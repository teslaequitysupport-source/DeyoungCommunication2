/**
 * Worker registry — identities, credentials, lifecycle (report Ch. 8;
 * WORKER-PROTOCOL.md).
 *
 * Security model (spec §31):
 *   - A worker CANNOT self-provision: an administrator pre-creates the
 *     registry row with a hashed credential; REGISTER only succeeds when
 *     the presented credential matches the stored hash.
 *   - Credentials are compared as SHA-256 digests with timingSafeEqual —
 *     no plaintext credentials are ever stored.
 *   - UNHEALTHY handling requeues or fails the worker's in-flight jobs and
 *     degrades its live sessions — nothing pretends to keep running.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { jobs, liveSessions, workers } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";

export const ACTIVE_WORKER_STATUSES = [
  "IDLE",
  "RESERVED",
  "LOADING",
  "READY",
  "BUSY",
  "DRAINING",
] as const;

export interface WorkerRecord {
  id: string;
  name: string;
  provider: string;
  gpuType: string | null;
  vramMb: number | null;
  region: string | null;
  version: string | null;
  status: string;
  capabilities: string[];
  models: string[];
  lastHeartbeatAt: Date | null;
  heartbeatLatencyMs: number | null;
  activeJobs: number;
  errorCount: number;
  /** Spec §45 sleep-system fields. */
  idleSinceAt: Date | null;
  wakeRequestedAt: Date | null;
}

export function hashWorkerCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Provision a worker identity (admin action). Idempotent on name: an
 * existing row keeps its credential unless a new one is provided.
 */
export async function provisionWorker(
  db: PlatformDatabase,
  input: {
    name: string;
    provider: string;
    credential: string;
    gpuType?: string | null;
    vramMb?: number | null;
    region?: string | null;
  },
): Promise<WorkerRecord> {
  const credentialHash = hashWorkerCredential(input.credential);
  const [row] = await db
    .insert(workers)
    .values({
      name: input.name,
      provider: input.provider,
      credentialHash,
      gpuType: input.gpuType ?? null,
      vramMb: input.vramMb ?? null,
      region: input.region ?? null,
      status: "IDLE",
    })
    .onConflictDoUpdate({
      target: workers.name,
      set: { credentialHash, provider: input.provider },
    })
    .returning();
  return row as unknown as WorkerRecord;
}

export interface RegisterInput {
  name: string;
  credential: string;
  provider?: string;
  gpuType?: string | null;
  vramMb?: number | null;
  region?: string | null;
  version?: string | null;
  capabilities?: string[];
  models?: string[];
}

export type RegisterResult =
  | { ok: true; worker: WorkerRecord }
  | { ok: false; reason: "unknown_worker" | "bad_credential" | "shutdown" };

/**
 * REGISTER (worker → control). Verifies the pre-provisioned credential and
 * refreshes the announced manifest. A SHUTDOWN worker stays down until an
 * administrator re-enables it.
 */
export async function registerWorker(
  db: PlatformDatabase,
  input: RegisterInput,
): Promise<RegisterResult> {
  const [row] = await db
    .select()
    .from(workers)
    .where(eq(workers.name, input.name))
    .limit(1);
  if (!row) return { ok: false, reason: "unknown_worker" };
  if (!safeEqualHex(row.credentialHash, hashWorkerCredential(input.credential))) {
    return { ok: false, reason: "bad_credential" };
  }
  if (row.status === "SHUTDOWN") return { ok: false, reason: "shutdown" };

  const [updated] = await db
    .update(workers)
    .set({
      gpuType: input.gpuType ?? row.gpuType,
      vramMb: input.vramMb ?? row.vramMb,
      region: input.region ?? row.region,
      version: input.version ?? row.version,
      capabilities: input.capabilities ?? row.capabilities,
      models: input.models ?? row.models,
      status: "IDLE",
      lastHeartbeatAt: new Date(),
      // A (re-)register is the tail of a boot — cold start finished (spec
      // §45: WAKE → HEALTH CHECK → MODEL LOAD → READY): wake fields clear,
      // idle clock restarts.
      wakeRequestedAt: null,
      idleSinceAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workers.id, row.id))
    .returning();

  await recordAudit(db, {
    actorId: null,
    actorRole: null,
    action: "worker.register",
    targetType: "worker",
    targetId: row.id,
    outcome: "SUCCESS",
    metadata: {
      name: input.name,
      capabilities: input.capabilities ?? row.capabilities,
      version: input.version ?? null,
    },
  });
  return { ok: true, worker: updated as unknown as WorkerRecord };
}

export type AuthenticatedWorker = {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  activeJobs: number;
};

export type WorkerAuthResult =
  | { ok: true; worker: AuthenticatedWorker }
  | { ok: false; reason: "missing" | "unknown_worker" | "bad_credential" };

/** Authenticate a worker request (name header + bearer credential). */
export async function authenticateWorker(
  db: PlatformDatabase,
  name: string | null,
  credential: string | null,
): Promise<WorkerAuthResult> {
  if (!name || !credential) return { ok: false, reason: "missing" };
  const [row] = await db
    .select()
    .from(workers)
    .where(eq(workers.name, name))
    .limit(1);
  if (!row) return { ok: false, reason: "unknown_worker" };
  if (
    !safeEqualHex(row.credentialHash, hashWorkerCredential(credential))
  ) {
    return { ok: false, reason: "bad_credential" };
  }
  return {
    ok: true,
    worker: {
      id: row.id,
      name: row.name,
      status: row.status,
      capabilities: row.capabilities ?? [],
      activeJobs: row.activeJobs,
    },
  };
}

export interface HeartbeatInput {
  workerId: string;
  activeJobs: number;
  heartbeatLatencyMs: number | null;
}

/**
 * HEARTBEAT (worker → control). Updates liveness + load. A previously
 * UNHEALTHY worker whose heartbeats resumed returns to IDLE (its in-flight
 * jobs were already requeued when it went unhealthy — nothing is silently
 * resurrected). DRAINING/SHUTDOWN states are respected. A SLEEPING worker
 * stays SLEEPING here — wake acceptance happens in the claim handshake
 * (tryAcceptWake) so a resumed poll equals a completed health check.
 *
 * Idle clock (spec §45): zero active jobs stamps idle_since_at (once);
 * non-zero clears it, so the sleep sweep only ever sleeps true idlers.
 */
export async function workerHeartbeat(
  db: PlatformDatabase,
  input: HeartbeatInput,
): Promise<void> {
  await db.execute(sql`
    UPDATE workers SET
      last_heartbeat_at = now(),
      active_jobs = ${input.activeJobs},
      heartbeat_latency_ms = ${input.heartbeatLatencyMs},
      idle_since_at = CASE
        WHEN ${input.activeJobs} > 0 THEN NULL
        ELSE COALESCE(idle_since_at, now()) END,
      updated_at = now()
    WHERE id = ${input.workerId}
  `);

  await db.execute(sql`
    UPDATE workers SET status = 'IDLE', updated_at = now()
    WHERE id = ${input.workerId} AND status = 'UNHEALTHY'
  `);
}

export interface UnhealthyOutcome {
  workerId: string;
  requeuedJobs: string[];
  failedJobs: string[];
  degradedSessions: string[];
  failedSessions: string[];
}

/**
 * Failure recovery (spec §7): missed heartbeats → mark UNHEALTHY, stop
 * assigning work, requeue-or-fail in-flight jobs, degrade-or-fail live
 * sessions, and record the incident. Never pretend the worker is alive.
 */
export async function markWorkerUnhealthy(
  db: PlatformDatabase,
  workerId: string,
): Promise<UnhealthyOutcome | null> {
  const outcome: UnhealthyOutcome = {
    workerId,
    requeuedJobs: [],
    failedJobs: [],
    degradedSessions: [],
    failedSessions: [],
  };

  const updated = await db.execute<{ id: string; name: string }>(sql`
    UPDATE workers SET status = 'UNHEALTHY', updated_at = now()
    WHERE id = ${workerId}
      AND status IN ('IDLE','RESERVED','LOADING','READY','BUSY','DRAINING')
    RETURNING id, name
  `);
  const row = updated.rows[0];
  if (!row) return null;

  // Live sessions lose their worker first (DEGRADED), jobs then requeue or fail.
  const sessionsResult = await db.execute<{ id: string }>(sql`
    UPDATE live_sessions SET status = 'DEGRADED', updated_at = now()
    WHERE worker_id = ${workerId}
      AND status IN ('WORKER_ASSIGNED','LOADING','READY','LIVE','RECOVERING')
    RETURNING id
  `);
  outcome.degradedSessions = sessionsResult.rows.map((r) => r.id);

  const inflight = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.workerId, workerId),
        inArray(jobs.status, ["RESERVED", "RUNNING"] as never[]),
      ),
    );

  for (const job of inflight) {
    const maxRetries = 3; // align with jobTypeDefinition at call sites
    if (job.retryCount < maxRetries) {
      await db.execute(sql`
        UPDATE jobs SET status = 'QUEUED', worker_id = NULL,
          retry_count = ${job.retryCount + 1},
          failure_info = ${JSON.stringify({
            reason: "worker_unhealthy",
            workerId,
          })},
          updated_at = now()
        WHERE id = ${job.id} AND status IN ('RESERVED','RUNNING')
      `);
      outcome.requeuedJobs.push(job.id);
    } else {
      await db.execute(sql`
        UPDATE jobs SET status = 'FAILED', completed_at = now(),
          failure_info = ${JSON.stringify({
            reason: "worker_unhealthy",
            workerId,
          })},
          updated_at = now()
        WHERE id = ${job.id} AND status IN ('RESERVED','RUNNING')
      `);
      outcome.failedJobs.push(job.id);
      if (job.liveSessionId) {
        await db.execute(sql`
          UPDATE live_sessions SET status = 'FAILED', ended_at = now(), updated_at = now()
          WHERE id = ${job.liveSessionId}
            AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED')
        `);
        outcome.failedSessions.push(job.liveSessionId);
      }
    }
  }

  await recordAudit(db, {
    action: "worker.unhealthy",
    targetType: "worker",
    targetId: workerId,
    outcome: "ERROR",
    metadata: {
      requeuedJobs: outcome.requeuedJobs,
      failedJobs: outcome.failedJobs,
      degradedSessions: outcome.degradedSessions,
      failedSessions: outcome.failedSessions,
    },
  });
  return outcome;
}

/** DRAIN: finish current work, accept nothing new. */
export async function drainWorker(
  db: PlatformDatabase,
  workerId: string,
): Promise<void> {
  await db
    .update(workers)
    .set({ status: "DRAINING", updatedAt: new Date() })
    .where(eq(workers.id, workerId));
  await recordAudit(db, {
    action: "worker.drain",
    targetType: "worker",
    targetId: workerId,
    outcome: "SUCCESS",
  });
}

/** SHUTDOWN: terminal until an administrator re-provisions it. */
export async function shutdownWorker(
  db: PlatformDatabase,
  workerId: string,
): Promise<void> {
  await db
    .update(workers)
    .set({ status: "SHUTDOWN", updatedAt: new Date() })
    .where(eq(workers.id, workerId));
  await recordAudit(db, {
    action: "worker.shutdown",
    targetType: "worker",
    targetId: workerId,
    outcome: "SUCCESS",
  });
}

/** Workers available for claims (IDLE/READY…, not DRAINING/UNHEALTHY). */
export async function claimEligibleWorkers(db: PlatformDatabase): Promise<
  WorkerRecord[]
> {
  const rows = await db
    .select()
    .from(workers)
    .where(inArray(workers.status, ["IDLE", "RESERVED", "LOADING", "READY", "BUSY"] as never[]));
  return rows as unknown as WorkerRecord[];
}

export async function getWorkerByName(
  db: PlatformDatabase,
  name: string,
): Promise<WorkerRecord | null> {
  const [row] = await db
    .select()
    .from(workers)
    .where(eq(workers.name, name))
    .limit(1);
  return (row as unknown as WorkerRecord) ?? null;
}
