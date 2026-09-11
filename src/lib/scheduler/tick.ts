/**
 * Scheduler tick — the control plane's housekeeping loop (report Ch. 8).
 *
 * Runs inside the Next.js app (invoked by a tiny ticker daemon in dev, by
 * a scheduled job in deployment) because Next dev isolates route module
 * graphs, so an in-process setInterval would be unreliable. The tick is a
 * pure database pass:
 *
 *   1. heartbeat monitor — active workers with a stale heartbeat are marked
 *      UNHEALTHY (which requeues-or-fails their jobs and degrades their
 *      live sessions — see markWorkerUnhealthy),
 *   2. reservation sweeper — jobs claimed but never started are requeued,
 *   3. session expiry — sessions still waiting when their TTL passes are
 *      EXPIRED (their queued job is cancelled), never left hanging.
 *
 * Every action is observable in the jobs/live_sessions/workers tables and
 * the audit log — no silent state changes.
 */

import { eq, inArray, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { liveSessions, workers } from "@/lib/db/schema";
import { markWorkerUnhealthy } from "@/lib/workers/registry";

export interface SchedulerTickResult {
  ranAt: string;
  unhealthyWorkers: string[];
  requeuedReservations: string[];
  expiredSessions: string[];
}

export const WORKER_HEARTBEAT_TIMEOUT_MS = 20_000;
export const RESERVATION_TTL_MS = 10 * 60_000;
export const SESSION_WAIT_TTL_MS = 5 * 60_000;

export async function schedulerTick(
  db: PlatformDatabase,
  options?: { heartbeatTimeoutMs?: number },
): Promise<SchedulerTickResult> {
  const heartbeatTimeout = options?.heartbeatTimeoutMs ?? WORKER_HEARTBEAT_TIMEOUT_MS;
  const result: SchedulerTickResult = {
    ranAt: new Date().toISOString(),
    unhealthyWorkers: [],
    requeuedReservations: [],
    expiredSessions: [],
  };

  // 1. Heartbeat monitor.
  const stale = await db
    .select({ id: workers.id })
    .from(workers)
    .where(
      inArray(workers.status, [
        "IDLE",
        "RESERVED",
        "LOADING",
        "READY",
        "BUSY",
        "DRAINING",
      ] as never[]),
    );
  for (const w of stale) {
    const [row] = await db
      .select({ lastHeartbeatAt: workers.lastHeartbeatAt })
      .from(workers)
      .where(eq(workers.id, w.id))
      .limit(1);
    const age = row?.lastHeartbeatAt
      ? Date.now() - new Date(row.lastHeartbeatAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (age > heartbeatTimeout) {
      const outcome = await markWorkerUnhealthy(db, w.id);
      if (outcome) result.unhealthyWorkers.push(w.id);
    }
  }

  // 2. Reservation sweeper — claimed but never started.
  const requeued = await db.execute<{ id: string }>(sql`
    UPDATE jobs SET
      status = CASE WHEN retry_count < 3 THEN 'QUEUED'::job_status ELSE 'EXPIRED'::job_status END,
      worker_id = NULL,
      retry_count = retry_count + 1,
      failure_info = ${JSON.stringify({ reason: "reservation_expired" })}
    WHERE status = 'RESERVED'
      AND updated_at < now() - (${RESERVATION_TTL_MS} || ' milliseconds')::interval
    RETURNING id
  `);
  result.requeuedReservations = requeued.rows.map((r) => r.id);

  // 3. Session expiry — never leave a user stuck on "waiting".
  const expired = await db.execute<{ id: string }>(sql`
    UPDATE live_sessions SET
      status = 'EXPIRED',
      ended_at = now(),
      updated_at = now()
    WHERE status IN ('CREATED','VALIDATING','WAITING_FOR_WORKER')
      AND created_at < now() - (${SESSION_WAIT_TTL_MS} || ' milliseconds')::interval
    RETURNING id
  `);
  result.expiredSessions = expired.rows.map((r) => r.id);

  if (result.expiredSessions.length > 0) {
    const sessionList = sql.join(
      result.expiredSessions.map((sid) => sql`${sid}`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE jobs SET status = 'CANCELLED', completed_at = now()
      WHERE live_session_id IN (${sessionList}) AND status = 'QUEUED'
    `);
  }

  return result;
}
