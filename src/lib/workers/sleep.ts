/**
 * AI compute sleep system (spec §45).
 *
 *   idle worker ──timeout──▶ SLEEPING            (scheduler sleep sweep)
 *   job arrives ──no awake worker──▶ wake_requested_at set on the best
 *                                     sleeping capable worker (cold start)
 *   worker boots / re-polls ──▶ wake accepted: SLEEPING → IDLE ─▶ claims
 *
 * Honest-state rules:
 *   - Sleeping workers never appear as available capacity; a job that needs
 *     one is QUEUED and its session stays WAITING_FOR_WORKER — no simulated
 *     progress, no instant-startup promises.
 *   - The actual provider wake call (RunPod / cloud API) is behind the
 *     WakeInvoker interface: production plugs a real invoker; the dev default
 *     is the worker's own claim poll (documented, observable).
 *   - SLEEPING is excluded from the heartbeat monitor's status list, so a
 *     sleeping worker is never falsely marked UNHEALTHY for missing beats.
 */

import { sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

/**
 * How long a worker may sit IDLE with zero active jobs before the scheduler
 * sleeps it. Default 2 minutes (dev); production tunes per provider cost
 * (RunPod sleep threshold per the approved report Ch. 16 P2).
 */
export const WORKER_IDLE_SLEEP_MS = 120_000;

export interface SleepSweepOptions {
  /** Idle age threshold. Default WORKER_IDLE_SLEEP_MS. */
  idleMs?: number;
}

export interface SleepSweepResult {
  sleptWorkers: string[];
}

/**
 * Scheduler step: sleep idle workers (spec §45: NO JOB → IDLE → TIMEOUT →
 * DRAIN → SLEEP/SHUTDOWN). Only workers that are IDLE, report zero active
 * jobs, have been idle longer than the threshold, and hold no in-flight
 * (RESERVED/RUNNING) jobs transition to SLEEPING. The NOT EXISTS guard is
 * atomic with the status write, so a claim racing the sweep cannot be lost.
 */
export async function sleepIdleWorkers(
  db: PlatformDatabase,
  options?: SleepSweepOptions,
): Promise<SleepSweepResult> {
  const idleMs = options?.idleMs ?? WORKER_IDLE_SLEEP_MS;
  const slept = await db.execute<{ id: string }>(sql`
    UPDATE workers SET status = 'SLEEPING', updated_at = now()
    WHERE status = 'IDLE'
      AND active_jobs = 0
      AND idle_since_at IS NOT NULL
      AND idle_since_at < now() - (${idleMs} || ' milliseconds')::interval
      AND NOT EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.worker_id = workers.id
          AND jobs.status IN ('RESERVED','RUNNING')
      )
    RETURNING id
  `);
  const sleptWorkers = slept.rows.map((r) => r.id);
  for (const workerId of sleptWorkers) {
    await recordAudit(db, {
      action: "worker.sleep",
      targetType: "worker",
      targetId: workerId,
      outcome: "SUCCESS",
      metadata: { idleMs, reason: "idle_timeout" },
    });
  }
  return { sleptWorkers };
}

export interface WakeRequest {
  workerId: string;
  /** The job that triggered the wake (observability only). */
  jobId?: string;
}

export type WakeResult =
  | { ok: true; workerId: string }
  | { ok: false; reason: "not_sleeping" | "unknown_worker" };

/**
 * Mark a sleeping worker as wake-requested (cold start in flight). The
 * provider-level wake call plugs in here via `invokeWake` — by default the
 * dev transport relies on the worker's own claim poll, which accepts the
 * wake server-side (tryAcceptWake below). Safe to call repeatedly: the
 * timestamp just refreshes, and only a SLEEPING worker can be woken.
 */
export async function requestWorkerWake(
  db: PlatformDatabase,
  input: WakeRequest,
  invokeWake?: (workerId: string) => Promise<void>,
): Promise<WakeResult> {
  const updated = await db.execute<{ id: string }>(sql`
    UPDATE workers SET wake_requested_at = now(), updated_at = now()
    WHERE id = ${input.workerId} AND status = 'SLEEPING'
    RETURNING id
  `);
  const row = updated.rows[0];
  if (!row) {
    // Distinguish unknown worker from wrong-state for observability.
    const exists = await db.execute<{ id: string }>(sql`
      SELECT id FROM workers WHERE id = ${input.workerId}
    `);
    return {
      ok: false,
      reason: exists.rows[0] ? "not_sleeping" : "unknown_worker",
    };
  }

  await recordAudit(db, {
    action: "worker.wake_requested",
    targetType: "worker",
    targetId: row.id,
    outcome: "SUCCESS",
    metadata: input.jobId ? { jobId: input.jobId } : {},
  });

  if (invokeWake) {
    // Production: the provider-specific wake (e.g. RunPod pod resume). Failures
    // are logged by the invoker; the wake_requested_at stays visible.
    await invokeWake(row.id);
  }
  return { ok: true, workerId: row.id };
}

/**
 * The wake handshake's control-plane half (spec §45: WAKE → HEALTH CHECK →
 * MODEL LOAD → READY → EXECUTE). A SLEEPING worker with a PENDING wake
 * request that presents itself again — a real cold boot ends with
 * REGISTER; the dev transport's claim poll arrives here — passes the
 * health check and returns to IDLE, ready to claim. Without a pending
 * request the worker stays asleep: nothing wakes itself just by polling.
 * Returns false when no sleeping worker had a wake pending, so callers
 * only audit real transitions.
 */
export async function tryAcceptWake(
  db: PlatformDatabase,
  workerId: string,
): Promise<boolean> {
  const updated = await db.execute<{ id: string }>(sql`
    UPDATE workers SET
      status = 'IDLE',
      wake_requested_at = NULL,
      idle_since_at = now(),
      updated_at = now()
    WHERE id = ${workerId}
      AND status = 'SLEEPING'
      AND wake_requested_at IS NOT NULL
    RETURNING id
  `);
  const row = updated.rows[0];
  if (!row) return false;
  await recordAudit(db, {
    action: "worker.woke",
    targetType: "worker",
    targetId: row.id,
    outcome: "SUCCESS",
    metadata: { reason: "wake_accepted" },
  });
  return true;
}
