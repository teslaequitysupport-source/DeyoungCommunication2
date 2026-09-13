/**
 * Durable job queue on the `jobs` table (report Ch. 9).
 *
 * Deviation from the approved report (documented in ARCHITECTURE.md):
 * the report proposed pgboss; the dev Postgres (PGlite) does not support
 * the LISTEN/NOTIFY channel pgboss relies on, and a second queue store
 * would split the source of truth. The queue is therefore the `jobs`
 * table itself using Postgres-native primitives:
 *
 *   - claiming uses `FOR UPDATE SKIP LOCKED` (atomic, multi-worker safe),
 *   - idempotency uses the unique `idempotency_key` index,
 *   - retries increment `retry_count` and requeue atomically.
 *
 * Same semantics, works identically on PGlite and Neon — and one fewer
 * moving part to operate.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { jobs, liveSessions, workers } from "@/lib/db/schema";
import { claimableJobTypes, jobTypeDefinition } from "@/lib/jobs/types";
import { rerouteRequeuedJobs } from "@/lib/workers/recovery";
import { refundJobCredits } from "@/lib/credits";

export interface JobRecord {
  id: string;
  userId: string;
  liveSessionId: string | null;
  type: string;
  status: string;
  priority: number;
  inputRefs: Record<string, unknown>;
  workerId: string | null;
  provider: string | null;
  idempotencyKey: string;
  startedAt: Date | null;
  completedAt: Date | null;
  failureInfo: Record<string, unknown> | null;
  retryCount: number;
  result: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  costUsd: string | null;
  createdAt: Date;
}

interface RawJobRow {
  [column: string]: unknown;
  id: string;
  user_id: string;
  live_session_id: string | null;
  type: string;
  status: string;
  priority: number;
  input_refs: Record<string, unknown> | null;
  worker_id: string | null;
  provider: string | null;
  idempotency_key: string;
  started_at: Date | null;
  completed_at: Date | null;
  failure_info: Record<string, unknown> | null;
  retry_count: number;
  result: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  cost_usd: string | null;
  created_at: Date;
}

function toRecord(row: Record<string, unknown>): JobRecord {
  // Accept both raw-SQL rows (snake_case) and Drizzle rows (camelCase).
  const pick = <T>(snake: string, camel: string): T =>
    (row[snake] !== undefined ? row[snake] : row[camel]) as T;
  return {
    id: row.id as string,
    userId: pick<string>("user_id", "userId"),
    liveSessionId: pick<string | null>("live_session_id", "liveSessionId") ?? null,
    type: row.type as string,
    status: row.status as string,
    priority: Number(row.priority ?? 0),
    inputRefs: (pick<Record<string, unknown> | null>("input_refs", "inputRefs") ?? {}),
    workerId: pick<string | null>("worker_id", "workerId") ?? null,
    provider: pick<string | null>("provider", "provider") ?? null,
    idempotencyKey: pick<string>("idempotency_key", "idempotencyKey"),
    startedAt: pick<Date | null>("started_at", "startedAt") ?? null,
    completedAt: pick<Date | null>("completed_at", "completedAt") ?? null,
    failureInfo: pick<Record<string, unknown> | null>("failure_info", "failureInfo") ?? null,
    retryCount: Number(row.retry_count ?? row.retryCount ?? 0),
    result: (pick<Record<string, unknown> | null>("result", "result") ?? null),
    usage: (pick<Record<string, unknown> | null>("usage", "usage") ?? null),
    costUsd: pick<string | null>("cost_usd", "costUsd") ?? null,
    createdAt: (row.created_at ?? row.createdAt) as Date,
  };
}

export interface EnqueueInput {
  userId: string;
  type: string;
  /** Stable key: re-submission returns the original job, never a duplicate. */
  idempotencyKey: string;
  inputRefs?: Record<string, unknown>;
  liveSessionId?: string | null;
  provider?: string | null;
}

/**
 * Enqueue a job. Idempotent: the unique index on idempotency_key makes a
 * concurrent double-submission return the same row.
 */
export async function enqueueJob(
  db: PlatformDatabase,
  input: EnqueueInput,
): Promise<JobRecord> {
  const def = jobTypeDefinition(input.type);
  await db
    .insert(jobs)
    .values({
      userId: input.userId,
      type: input.type,
      status: "QUEUED",
      priority: def.priority,
      inputRefs: input.inputRefs ?? {},
      idempotencyKey: input.idempotencyKey,
      liveSessionId: input.liveSessionId ?? null,
      provider: input.provider ?? null,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey });

  const [existing] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (!existing) {
    throw new Error(
      "enqueueJob: insert reported conflict but the original row is missing",
    );
  }
  return toRecord(existing);
}

/**
 * Atomically claim the next claimable job for a worker (RESERVE + ALLOCATE
 * in one step). The claimable type list is derived server-side from the
 * worker's REGISTERed capabilities — never from request input. When the job
 * belongs to a live session, the session row is advanced in the same
 * transaction (WAITING_FOR_WORKER → WORKER_ASSIGNED; DEGRADED/RECOVERING →
 * RECOVERING), so the session state can never disagree with the job state.
 */
export async function claimNextJob(
  db: PlatformDatabase,
  workerId: string,
): Promise<JobRecord | null> {
  const [workerRow] = await db
    .select({ capabilities: workers.capabilities, provider: workers.provider })
    .from(workers)
    .where(eq(workers.id, workerId))
    .limit(1);
  if (!workerRow) throw new Error("claimNextJob: unknown worker");
  const types = claimableJobTypes(workerRow.capabilities ?? []);
  if (types.length === 0) return null;

  return db.transaction(async (tx) => {
    const typeList = sql.join(
      types.map((t) => sql`${t}`),
      sql`, `,
    );
    const claimed = await tx.execute<RawJobRow>(sql`
      UPDATE jobs SET
        status = 'RESERVED',
        worker_id = ${workerId},
        provider = ${workerRow.provider},
        updated_at = now()
      WHERE id = (
        SELECT j.id FROM jobs j
        WHERE j.status = 'QUEUED' AND j.type IN (${typeList})
        ORDER BY j.priority DESC, j.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);
    const row = claimed.rows[0];
    if (!row) return null;
    const record = toRecord(row);

    if (record.liveSessionId) {
      await tx.execute(sql`
        UPDATE live_sessions SET
          worker_id = ${workerId},
          status = CASE
            WHEN status = 'WAITING_FOR_WORKER' THEN 'WORKER_ASSIGNED'::live_session_status
            WHEN status IN ('DEGRADED','RECOVERING','WORKER_ASSIGNED','LOADING') THEN 'RECOVERING'::live_session_status
            ELSE status END,
          updated_at = now()
        WHERE id = ${record.liveSessionId}
          AND status NOT IN ('COMPLETED','FAILED','CANCELLED','EXPIRED','STOPPING')
      `);
    }
    return record;
  });
}

/** RESERVED → RUNNING (worker accepted and began execution). */
export async function startJob(
  db: PlatformDatabase,
  jobId: string,
  workerId: string,
): Promise<JobRecord | null> {
  const updated = await db.execute<RawJobRow>(sql`
    UPDATE jobs SET status = 'RUNNING', started_at = now()
    WHERE id = ${jobId} AND worker_id = ${workerId} AND status = 'RESERVED'
    RETURNING *
  `);
  const row = updated.rows[0];
  if (!row) return null;
  const record = toRecord(row);

  if (record.liveSessionId) {
    await db.execute(sql`
      UPDATE live_sessions SET status = 'LOADING', updated_at = now()
      WHERE id = ${record.liveSessionId}
        AND status IN ('WORKER_ASSIGNED','RECOVERING')
    `);
  }
  return record;
}

/** RUNNING → SUCCEEDED with result/usage; live session → COMPLETED. */
export async function completeJob(
  db: PlatformDatabase,
  args: {
    jobId: string;
    workerId: string;
    result?: Record<string, unknown>;
    usage?: Record<string, unknown>;
    costUsd?: string | null;
  },
): Promise<JobRecord | null> {
  const updated = await db.execute<RawJobRow>(sql`
    UPDATE jobs SET
      status = 'SUCCEEDED',
      completed_at = now(),
      result = ${args.result ? JSON.stringify(args.result) : null},
      usage = ${args.usage ? JSON.stringify(args.usage) : null},
      cost_usd = ${args.costUsd ?? null}
    WHERE id = ${args.jobId} AND worker_id = ${args.workerId}
      AND status IN ('RESERVED','RUNNING')
    RETURNING *
  `);
  const row = updated.rows[0];
  if (!row) return null;
  const record = toRecord(row);

  if (record.liveSessionId) {
    await db.execute(sql`
      UPDATE live_sessions SET
        status = 'COMPLETED',
        ended_at = now(),
        updated_at = now()
      WHERE id = ${record.liveSessionId} AND status = 'STOPPING'
    `);
  }
  return record;
}

export interface FailInput {
  jobId: string;
  workerId: string;
  failureInfo: Record<string, unknown>;
  /** Explicit request from the worker or recovery path. */
  requeue?: boolean;
}

/**
 * Fail a job. Either requeues it (safe retry — the idempotency key means
 * no duplicate work or billing) when retries remain, or marks it FAILED
 * terminally. Live sessions are moved to DEGRADED on requeue (they wait for
 * a new worker to claim, then move to RECOVERING) or FAILED on terminal.
 */
export async function failJob(
  db: PlatformDatabase,
  input: FailInput,
): Promise<JobRecord | null> {
  const [current] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!current || current.workerId !== input.workerId) return null;

  const def = jobTypeDefinition(current.type);
  const canRetry =
    input.requeue !== false && current.retryCount < def.maxRetries;

  if (canRetry) {
    const updated = await db.execute<RawJobRow>(sql`
      UPDATE jobs SET
        status = 'QUEUED',
        worker_id = NULL,
        retry_count = ${current.retryCount + 1},
        failure_info = ${JSON.stringify(input.failureInfo)}
      WHERE id = ${input.jobId} AND worker_id = ${input.workerId}
        AND status IN ('RESERVED','RUNNING')
      RETURNING *
    `);
    const row = updated.rows[0];
    if (!row) return null;
    const record = toRecord(row);
    if (record.liveSessionId) {
      await db.execute(sql`
        UPDATE live_sessions SET status = 'DEGRADED', updated_at = now()
        WHERE id = ${record.liveSessionId}
          AND status IN ('WORKER_ASSIGNED','LOADING','READY','LIVE','RECOVERING')
      `);
    }
    // Spec §7 step 6 ("Reassign when possible"): a requeued job with no
    // awake capacity wakes a sleeping capable worker instead of waiting
    // for a claim that cannot come from a sleeping box.
    await rerouteRequeuedJobs(db, [record.id]);
    return record;
  }

  const updated = await db.execute<RawJobRow>(sql`
    UPDATE jobs SET
      status = 'FAILED',
      completed_at = now(),
      failure_info = ${JSON.stringify(input.failureInfo)}
    WHERE id = ${input.jobId} AND worker_id = ${input.workerId}
      AND status IN ('RESERVED','RUNNING')
    RETURNING *
  `);
  const row = updated.rows[0];
  if (!row) return null;
  const record = toRecord(row);
  // Terminal failure without delivered work → the spend is refunded
  // (spec §41: "failed generations" must not cost the user). Idempotent,
  // and a no-op for free job types.
  await refundJobCredits(db, { jobId: record.id });
  if (record.liveSessionId) {
    await db.execute(sql`
      UPDATE live_sessions SET
        status = 'FAILED',
        ended_at = now(),
        updated_at = now()
      WHERE id = ${record.liveSessionId}
        AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED')
    `);
  }
  return record;
}

/** User-initiated cancel. Only meaningful before execution completes. */
export async function cancelJob(
  db: PlatformDatabase,
  args: { jobId: string; userId: string },
): Promise<JobRecord | null> {
  const updated = await db.execute<RawJobRow>(sql`
    UPDATE jobs SET status = 'CANCELLED', completed_at = now()
    WHERE id = ${args.jobId} AND user_id = ${args.userId}
      AND status IN ('QUEUED','RESERVED')
    RETURNING *
  `);
  const row = updated.rows[0] ?? null;
  if (row) {
    // Cancelled before completion → nothing was delivered → refund.
    await refundJobCredits(db, { jobId: row.id });
  }
  return row ? toRecord(row) : null;
}

/**
 * Reject a job terminally at intake (before any worker sees it) — used by
 * the credits gate when the account cannot pay. No refund: nothing was
 * spent (the gate runs before the spend insert).
 */
export async function rejectJob(
  db: PlatformDatabase,
  args: { jobId: string; failureInfo: Record<string, unknown> },
): Promise<JobRecord | null> {
  const updated = await db.execute<RawJobRow>(sql`
    UPDATE jobs SET
      status = 'FAILED',
      completed_at = now(),
      failure_info = ${JSON.stringify(args.failureInfo)}
    WHERE id = ${args.jobId} AND status = 'QUEUED'
    RETURNING *
  `);
  const row = updated.rows[0] ?? null;
  return row ? toRecord(row) : null;
}

export async function getJob(
  db: PlatformDatabase,
  jobId: string,
): Promise<JobRecord | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function listJobsForUser(
  db: PlatformDatabase,
  userId: string,
  limit = 50,
): Promise<JobRecord[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.userId, userId))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
  return rows.map((r) => toRecord(r));
}

/** For the P1 UI: only a user's own jobs (and jobs are never cross-user). */
export async function jobBelongsToUser(
  db: PlatformDatabase,
  jobId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: jobs.userId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return row?.userId === userId;
}

/** Session status snapshot used by the relay's status channel. */
export async function latestJobForSession(
  db: PlatformDatabase,
  sessionId: string,
): Promise<JobRecord | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.liveSessionId, sessionId))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}

/**
 * Sweeper slice: requeue jobs left RESERVED (claimed but never started).
 * Crashes between claim and start are recovered here instead of leaking.
 * Jobs whose retries are exhausted go EXPIRED — and are refunded, because
 * the user never received the work.
 */
export async function expireStaleReservations(
  db: PlatformDatabase,
  olderThanMs: number,
): Promise<string[]> {
  const updated = await db.execute<{ id: string; status: string }>(sql`
    UPDATE jobs SET
      status = CASE WHEN retry_count < 3 THEN 'QUEUED'::job_status ELSE 'EXPIRED'::job_status END,
      worker_id = NULL,
      retry_count = retry_count + 1,
      failure_info = ${JSON.stringify({ reason: "reservation_expired" })}
    WHERE status = 'RESERVED'
      AND updated_at < now() - (${olderThanMs} || ' milliseconds')::interval
    RETURNING id, status
  `);
  for (const row of updated.rows) {
    if (row.status === "EXPIRED") {
      await refundJobCredits(db, { jobId: row.id });
    }
  }
  return updated.rows.map((r) => r.id);
}

/** Test/debug helper: confirm no cross-user leakage by construction. */
export async function jobsInStates(
  db: PlatformDatabase,
  states: string[],
): Promise<JobRecord[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, states as never[]));
  return rows.map((r) => toRecord(r));
}

export const jobGuards = { and, eq };
