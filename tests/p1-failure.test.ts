/**
 * Failure suite (spec §51): worker failure mid-job, network-loss semantics
 * (missed heartbeats), job requeue/expiry, expired sessions, and
 * scheduler recovery — exercised against a private Postgres.
 */

import { afterAll, describe, expect, it } from "vitest";
import { closeStack, ready } from "./p1-harness";

await ready();
afterAll(async () => {
  await closeStack();
});

const { createAuth } = await import("@/lib/auth");
const {
  provisionWorker,
  registerWorker,
  markWorkerUnhealthy,
} = await import("@/lib/workers/registry");
const {
  enqueueJob,
  claimNextJob,
  startJob,
  failJob,
  getJob,
} = await import("@/lib/jobs/queue");
const {
  createLiveSession,
  getSession,
  stopLiveSession,
  workerSessionReady,
  sessionWentLive,
} = await import("@/lib/sessions/state-machine");
const { schedulerTick } = await import("@/lib/scheduler/tick");
const db = await import("@/lib/db");
const { drizzle } = await import("drizzle-orm/pglite");
const schemaNS = await import("@/lib/db/schema");
const schema = schemaNS;
const { eq, sql } = await import("drizzle-orm");

const WORKER_A = "failure-worker-a";
const WORKER_B = "failure-worker-b";
const CRED = "failure-suite-worker-credential";
const CAPS = ["transform.image", "transform.live"];

async function workerRow(name: string) {
  const rows = await db
    .getDb()
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.name, name))
    .limit(1);
  if (!rows[0]) throw new Error(`worker ${name} not provisioned`);
  return rows[0] as { id: string };
}

/** Provision + REGISTER a worker so it carries claimable capabilities. */
async function ensureWorker(name: string) {
  await provisionWorker(db.getDb(), {
    name,
    provider: "DEVELOPMENT_LOCAL",
    credential: CRED,
  });
  const result = await registerWorker(db.getDb(), {
    name,
    credential: CRED,
    provider: "DEVELOPMENT_LOCAL",
    capabilities: CAPS,
    models: ["sharp:0.34"],
  });
  if (!result.ok) throw new Error(`worker ${name} failed to register`);
  return workerRow(name);
}

async function anyUserId(): Promise<string> {
  const [user] = await db.getDb().select().from(schema.user).limit(1);
  if (!user) {
    const auth = createAuth(drizzle((await ready()).client, { schema: schemaNS }) as never);
    await auth.api.signUpEmail({
      body: {
        name: "Failure User",
        email: "failure@test.dev",
        password: "failure-suite-password-123",
      },
    });
    return anyUserId();
  }
  return user.id;
}

describe("Failure suite — worker loss and recovery", () => {
  it("requeues an in-flight batch job when its worker goes unhealthy", async () => {
    const userId = await anyUserId();
    const workerA = await ensureWorker(WORKER_A);

    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "fail-requeue-1",
    });

    const claimed = await claimNextJob(db.getDb(), workerA.id);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("RESERVED");
    const started = await startJob(db.getDb(), job.id, claimed!.workerId!);
    expect(started?.status).toBe("RUNNING");

    // Worker dies (heartbeat stops): the unhealthy path must not pretend
    // the job is still running.
    const outcome = await markWorkerUnhealthy(db.getDb(), claimed!.workerId!);
    expect(outcome?.requeuedJobs).toContain(job.id);
    const after = await getJob(db.getDb(), job.id);
    expect(after?.status).toBe("QUEUED");
    expect(after?.retryCount).toBe(1);
    expect(after?.workerId).toBeNull();
  });

  it("retries are claimed by a healthy second worker", async () => {
    const workerB = await ensureWorker(WORKER_B);
    const original = await jobByKey("fail-requeue-1");
    const reclaimed = await claimNextJob(db.getDb(), workerB.id);
    expect(reclaimed?.id).toBe(original.id);
    expect(reclaimed?.retryCount).toBe(1);
  });

  it("a retry-exhausted job goes FAILED, not requeued forever", async () => {
    const userId = await anyUserId();
    const workerB = await workerRow(WORKER_B);
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "fail-exhaust-1",
    });

    for (let i = 0; i < 4; i++) {
      const claimed = await claimNextJob(db.getDb(), workerB.id);
      expect(claimed?.id).toBe(job.id);
      const failed = await failJob(db.getDb(), {
        jobId: job.id,
        workerId: workerB.id,
        failureInfo: { reason: "simulated_failure", attempt: i },
      });
      expect(failed).toBeTruthy();
    }
    const final = await getJob(db.getDb(), job.id);
    expect(final?.status).toBe("FAILED");
    expect(final?.retryCount).toBe(3); // maxRetries for the image transform type
  });

  it("duplicate submission returns the SAME job (idempotency key)", async () => {
    const userId = await anyUserId();
    const first = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "idem-key-1",
    });
    const second = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "idem-key-1",
    });
    expect(second.id).toBe(first.id);
  });

  it("worker loss mid-session degrades the session; recovery restores LIVE", async () => {
    const userId = await anyUserId();
    const [character] = await db
      .getDb()
      .insert(schema.characters)
      .values({ userId, name: "FailChar", status: "ACTIVE" })
      .returning();
    await db
      .getDb()
      .insert(schema.consentRecords)
      .values({
        userId,
        purpose: "camera.transform.live",
        policyVersion: "test",
        status: "GRANTED",
      });

    const created = await createLiveSession(db.getDb(), {
      userId,
      characterId: character.id,
    });
    if (!created.ok) throw new Error(created.code);
    const sessionId = created.session.id;

    const workerA = await ensureWorker(WORKER_A);
    const claimed = await claimNextJob(db.getDb(), workerA.id);
    expect(claimed?.liveSessionId).toBe(sessionId);
    await startJob(db.getDb(), claimed!.id, workerA.id);
    await db
      .getDb()
      .execute(sql`UPDATE live_sessions SET status = 'LIVE', started_at = now() WHERE id = ${sessionId}`);

    // Worker A dies mid-session.
    const outcome = await markWorkerUnhealthy(db.getDb(), workerA.id);
    expect(outcome?.degradedSessions).toContain(sessionId);
    let session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("DEGRADED");

    // The live job requeued — worker B claims it → session RECOVERING.
    const workerB = await workerRow(WORKER_B);
    const reclaimed = await claimNextJob(db.getDb(), workerB.id);
    expect(reclaimed?.liveSessionId).toBe(sessionId);
    session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("RECOVERING");

    // Worker B reports READY then LIVE — session restored.
    await workerSessionReady(db.getDb(), sessionId);
    await sessionWentLive(db.getDb(), sessionId);
    session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("LIVE");
  });

  it("scheduler tick marks stale-heartbeat workers UNHEALTHY", async () => {
    const workerA = await ensureWorker(WORKER_A);
    await db
      .getDb()
      .execute(sql`UPDATE workers SET last_heartbeat_at = now() - interval '60 seconds' WHERE id = ${workerA.id}`);

    const result = await schedulerTick(db.getDb(), { heartbeatTimeoutMs: 20_000 });
    expect(result.unhealthyWorkers).toContain(workerA.id);
  });

  it("scheduler tick expires stale waiting sessions and cancels their jobs", async () => {
    const userId = await anyUserId();
    const [character] = await db
      .getDb()
      .insert(schema.characters)
      .values({ userId, name: "ExpireChar", status: "ACTIVE" })
      .returning();
    await db
      .getDb()
      .insert(schema.consentRecords)
      .values({
        userId,
        purpose: "camera.transform.live",
        policyVersion: "test",
        status: "GRANTED",
      });
    const created = await createLiveSession(db.getDb(), {
      userId,
      characterId: character.id,
    });
    if (!created.ok) throw new Error(created.code);
    const sessionId = created.session.id;

    await db
      .getDb()
      .execute(sql`UPDATE live_sessions SET created_at = now() - interval '10 minutes' WHERE id = ${sessionId}`);

    const result = await schedulerTick(db.getDb());
    expect(result.expiredSessions).toContain(sessionId);
    const session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("EXPIRED");
    const { latestJobForSession } = await import("@/lib/jobs/queue");
    const job = await latestJobForSession(db.getDb(), sessionId);
    expect(job?.status).toBe("CANCELLED");
  });

  it("stopping a never-claimed session cancels it and its queued job", async () => {
    const userId = await anyUserId();
    const [character] = await db
      .getDb()
      .insert(schema.characters)
      .values({ userId, name: "CancelChar", status: "ACTIVE" })
      .returning();
    await db
      .getDb()
      .insert(schema.consentRecords)
      .values({
        userId,
        purpose: "camera.transform.live",
        policyVersion: "test",
        status: "GRANTED",
      });
    const created = await createLiveSession(db.getDb(), {
      userId,
      characterId: character.id,
    });
    if (!created.ok) throw new Error(created.code);
    const sessionId = created.session.id;
    const stopped = await stopLiveSession(db.getDb(), {
      sessionId,
      userId,
    });
    expect(stopped?.status).toBe("CANCELLED");
    const { latestJobForSession } = await import("@/lib/jobs/queue");
    const job = await latestJobForSession(db.getDb(), sessionId);
    expect(job?.status).toBe("CANCELLED");
  });

  async function jobByKey(key: string) {
    const rows = await db
      .getDb()
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.idempotencyKey, key))
      .limit(1);
    if (!rows[0]) throw new Error(`job ${key} missing`);
    return rows[0] as { id: string };
  }
});
