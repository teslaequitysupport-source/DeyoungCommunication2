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
 *      live sessions — see markWorkerUnhealthy). SLEEPING workers are not
 *      monitored: a sleeping box sends no beats by design (spec §45).
 *   2. reservation sweeper — jobs claimed but never started are requeued,
 *   2.5 orphaned-job re-router — QUEUED types with no awake capacity wake
 *       their best sleeping capable worker (spec §7 step 6 safety net),
 *   3. session expiry — sessions still waiting when their TTL passes are
 *      EXPIRED (their queued job is cancelled), never left hanging.
 *   4. sleep sweep (spec §45) — IDLE workers past the idle timeout with no
 *      in-flight work go SLEEPING; a later job wakes them (cold start).
 *
 * Every action is observable in the jobs/live_sessions/workers tables and
 * the audit log — no silent state changes.
 */

import { eq, inArray, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { liveSessions, workers } from "@/lib/db/schema";
import { markWorkerUnhealthy } from "@/lib/workers/registry";
import { sleepIdleWorkers, requestWorkerWake } from "@/lib/workers/sleep";
import { rerouteRequeuedJobs } from "@/lib/workers/recovery";
import { selectWorkerForJobType } from "@/lib/workers/selection";

export interface SchedulerTickResult {
  ranAt: string;
  unhealthyWorkers: string[];
  requeuedReservations: string[];
  expiredSessions: string[];
  staleCompletedSessions: string[];
  staleAbandonedSessions: string[];
  /** Spec §45: workers that hit the idle timeout and went to sleep. */
  sleptWorkers: string[];
  /** Spec §7.6 safety net: sleeping workers woken for QUEUED job types
   *  that have no awake capacity (orphaned jobs). */
  orphanWakes: string[];
}

export const WORKER_HEARTBEAT_TIMEOUT_MS = 20_000;
export const RESERVATION_TTL_MS = 10 * 60_000;
export const SESSION_WAIT_TTL_MS = 5 * 60_000;
/** STOPPING with no worker response for this long completes the session. */
export const STOPPING_GRACE_MS = 60_000;
/** READY/LOADING with no publisher/worker progress — abandoned session. */
export const SESSION_ABANDONED_MS = 5 * 60_000;

export async function schedulerTick(
  db: PlatformDatabase,
  options?: { heartbeatTimeoutMs?: number; idleSleepMs?: number },
): Promise<SchedulerTickResult> {
  const heartbeatTimeout = options?.heartbeatTimeoutMs ?? WORKER_HEARTBEAT_TIMEOUT_MS;
  const result: SchedulerTickResult = {
    ranAt: new Date().toISOString(),
    unhealthyWorkers: [],
    requeuedReservations: [],
    expiredSessions: [],
    staleCompletedSessions: [],
    staleAbandonedSessions: [],
    sleptWorkers: [],
    orphanWakes: [],
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

  // Spec §7 step 6 — reassignment: a job whose claiming worker vanished
  // between RESERVE and START is re-routed like any other requeued job, so
  // it does not silently wait on a sleeping box that never polls it back.
  if (result.requeuedReservations.length > 0) {
    await rerouteRequeuedJobs(db, result.requeuedReservations);
  }

  // 2.5 Orphaned-job re-router (spec §7 step 6 safety net): a QUEUED job
  //     can end up with no awake capable worker through paths no requeue
  //     owns — e.g. a worker that reports an ERROR and then dies leaves the
  //     job QUEUED with no in-flight owner to reroute. Each tick, every
  //     distinct QUEUED job type with zero awake capacity but a sleeping
  //     capable worker gets the same honest cold start as a fresh enqueue:
  //     a wake request — unless one is already pending for that worker.
  const queuedTypes = await db.execute<{ type: string }>(sql`
    SELECT DISTINCT type FROM jobs WHERE status = 'QUEUED'
  `);
  for (const { type } of queuedTypes.rows) {
    const decision = await selectWorkerForJobType(db, type);
    if (decision.outcome === "wake") {
      const pending = await db.execute<{ id: string }>(sql`
        SELECT id FROM workers
        WHERE id = ${decision.workerId}
          AND status = 'SLEEPING'
          AND wake_requested_at IS NOT NULL
      `);
      if (pending.rows.length === 0) {
        await requestWorkerWake(db, { workerId: decision.workerId });
        result.orphanWakes.push(decision.workerId);
      }
    }
  }

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

  // 4. STOPPING sessions whose worker already finalized (or vanished) —
  //    complete them instead of stranding them mid-stop.
  const staleCompleted = await db.execute<{ id: string }>(sql`
    UPDATE live_sessions SET
      status = 'COMPLETED',
      ended_at = now(),
      updated_at = now()
    WHERE status = 'STOPPING'
      AND updated_at < now() - (${STOPPING_GRACE_MS} || ' milliseconds')::interval
    RETURNING id
  `);
  result.staleCompletedSessions = staleCompleted.rows.map((r) => r.id);

  // 5. Abandoned live sessions: worker reached READY/LOADING but no
  //    publisher ever flowed (and no state change since) — expire the
  //    session and its live job so nothing runs forever.
  const abandoned = await db.execute<{ id: string }>(sql`
    UPDATE live_sessions SET
      status = 'EXPIRED',
      ended_at = now(),
      updated_at = now()
    WHERE status IN ('WORKER_ASSIGNED','LOADING','READY')
      AND updated_at < now() - (${SESSION_ABANDONED_MS} || ' milliseconds')::interval
    RETURNING id
  `);
  result.staleAbandonedSessions = abandoned.rows.map((r) => r.id);

  if (result.staleAbandonedSessions.length > 0) {
    const abandonedList = sql.join(
      result.staleAbandonedSessions.map((sid) => sql`${sid}`),
      sql`, `,
    );
    await db.execute(sql`
      UPDATE jobs SET status = 'EXPIRED', completed_at = now(),
        failure_info = ${JSON.stringify({ reason: "session_abandoned" })}
      WHERE live_session_id IN (${abandonedList})
        AND status IN ('QUEUED','RESERVED','RUNNING')
    `);
  }

  // 6. Sleep sweep (spec §45): idle workers past the timeout go to sleep.
  //    Claims race safely against this sweep (NOT EXISTS guard in the SQL).
  const slept = await sleepIdleWorkers(db, { idleMs: options?.idleSleepMs });
  result.sleptWorkers = slept.sleptWorkers;

  return result;
}
