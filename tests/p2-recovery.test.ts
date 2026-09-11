/**
 * P2 recovery-reassignment suite (spec §7 step 6 — "Reassign when
 * possible"): every requeue path (worker death, worker-reported failure,
 * expired reservation) re-routes the job, waking a sleeping capable worker
 * when no awake capacity exists — so recovery closes the §45 cold-start
 * loop instead of waiting on a claim a sleeping box can never issue.
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
const { sleepIdleWorkers, tryAcceptWake } = await import("@/lib/workers/sleep");
const { rerouteRequeuedJobs } = await import("@/lib/workers/recovery");
const {
  enqueueJob,
  claimNextJob,
  startJob,
  failJob,
  getJob,
} = await import("@/lib/jobs/queue");
const { createLiveSession, getSession } = await import(
  "@/lib/sessions/state-machine"
);
const { schedulerTick, RESERVATION_TTL_MS } = await import(
  "@/lib/scheduler/tick"
);
const db = await import("@/lib/db");
const { drizzle } = await import("drizzle-orm/pglite");
const schemaNS = await import("@/lib/db/schema");
const schema = schemaNS;
const { eq, sql } = await import("drizzle-orm");

const CRED = "p2-recovery-suite-credential";

async function provision(name: string, capabilities: string[]) {
  await provisionWorker(db.getDb(), {
    name,
    provider: "DEVELOPMENT_LOCAL",
    credential: CRED,
  });
  const result = await registerWorker(db.getDb(), {
    name,
    credential: CRED,
    provider: "DEVELOPMENT_LOCAL",
    capabilities,
    models: ["sharp:0.34"],
  });
  if (!result.ok) throw new Error(`worker ${name} failed to register`);
  const [row] = await db
    .getDb()
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.name, name))
    .limit(1);
  if (!row) throw new Error(`worker ${name} row missing`);
  return row.id;
}

async function anyUserId(): Promise<string> {
  const [user] = await db.getDb().select().from(schema.user).limit(1);
  if (!user) {
    const auth = createAuth(
      drizzle((await ready()).client, { schema: schemaNS }) as never,
    );
    await auth.api.signUpEmail({
      body: {
        name: "P2 Recovery User",
        email: "p2-recovery@test.dev",
        password: "p2-recovery-suite-password-123",
      },
    });
    return anyUserId();
  }
  return user.id;
}

/** Put a freshly-registered worker to sleep (aged idle + sweep). */
async function putToSleep(workerId: string): Promise<void> {
  await db.getDb().execute(sql`
    UPDATE workers SET idle_since_at = now() - interval '10 minutes'
    WHERE id = ${workerId}
  `);
  const sweep = await sleepIdleWorkers(db.getDb(), { idleMs: 60_000 });
  if (!sweep.sleptWorkers.includes(workerId)) {
    throw new Error(`worker ${workerId} did not go to sleep`);
  }
}

async function wakeRequested(workerId: string): Promise<Date | null> {
  const row = await db.getDb().execute<{ wake_requested_at: Date | null }>(
    sql`SELECT wake_requested_at FROM workers WHERE id = ${workerId}`,
  );
  return row.rows[0]?.wake_requested_at ?? null;
}

describe("P2 recovery — worker loss requeues AND reassigns (§7.6 + §45)", () => {
  it("wakes a sleeping capable worker when the running worker dies (batch)", async () => {
    const alive = await provision("rec-alive", ["transform.image"]);
    const sleeper = await provision("rec-sleeper", ["transform.image"]);
    await putToSleep(sleeper);

    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "rec-batch-1",
    });
    const claimed = await claimNextJob(db.getDb(), alive);
    expect(claimed?.id).toBe(job.id);
    await startJob(db.getDb(), job.id, alive);

    // Worker dies: the requeued job must be re-routed — the sleeping capable
    // worker gets a wake request in the same incident.
    const outcome = await markWorkerUnhealthy(db.getDb(), alive);
    expect(outcome?.requeuedJobs).toContain(job.id);

    const after = await getJob(db.getDb(), job.id);
    expect(after?.status).toBe("QUEUED");
    expect(after?.workerId).toBeNull();

    expect(await wakeRequested(sleeper)).not.toBeNull();

    // The cold-start handshake completes and the replacement claims.
    expect(await tryAcceptWake(db.getDb(), sleeper)).toBe(true);
    const reclaimed = await claimNextJob(db.getDb(), sleeper);
    expect(reclaimed?.id).toBe(job.id);
  });

  it("wakes a sleeping live worker and restores the session to RECOVERING", async () => {
    const userId = await anyUserId();
    const [character] = await db
      .getDb()
      .insert(schema.characters)
      .values({ userId, name: "RecChar", status: "ACTIVE" })
      .returning();
    await db.getDb().insert(schema.consentRecords).values({
      userId,
      purpose: "camera.transform.live",
      policyVersion: "test",
      status: "GRANTED",
    });

    const liveA = await provision("rec-live-a", ["transform.live"]);
    const liveB = await provision("rec-live-b", ["transform.live"]);
    await putToSleep(liveB);

    const created = await createLiveSession(db.getDb(), {
      userId,
      characterId: character.id,
    });
    if (!created.ok) throw new Error(created.code);
    const sessionId = created.session.id;

    const claimed = await claimNextJob(db.getDb(), liveA);
    expect(claimed?.liveSessionId).toBe(sessionId);
    await startJob(db.getDb(), claimed!.id, liveA);
    await db.getDb().execute(sql`
      UPDATE live_sessions SET status = 'LIVE', started_at = now()
      WHERE id = ${sessionId}
    `);

    // Live worker dies mid-session: DEGRADED + requeue + wake of B.
    const outcome = await markWorkerUnhealthy(db.getDb(), liveA);
    expect(outcome?.degradedSessions).toContain(sessionId);
    expect(outcome?.requeuedJobs).toContain(claimed!.id);
    expect((await getSession(db.getDb(), sessionId))?.status).toBe("DEGRADED");
    expect(await wakeRequested(liveB)).not.toBeNull();

    // B completes the handshake, claims, and the session is RECOVERING.
    expect(await tryAcceptWake(db.getDb(), liveB)).toBe(true);
    const reclaimed = await claimNextJob(db.getDb(), liveB);
    expect(reclaimed?.id).toBe(claimed!.id);
    expect((await getSession(db.getDb(), sessionId))?.status).toBe("RECOVERING");
  });

  it("honors the per-type retry budget: an exhausted live job fails terminally", async () => {
    const userId = await anyUserId();
    const [character] = await db
      .getDb()
      .insert(schema.characters)
      .values({ userId, name: "RecBudgetChar", status: "ACTIVE" })
      .returning();
    await db.getDb().insert(schema.consentRecords).values({
      userId,
      purpose: "camera.transform.live",
      policyVersion: "test",
      status: "GRANTED",
    });

    const liveA = await provision("rec-budget-a", ["transform.live"]);
    const created = await createLiveSession(db.getDb(), {
      userId,
      characterId: character.id,
    });
    if (!created.ok) throw new Error(created.code);
    const sessionId = created.session.id;
    const claimed = await claimNextJob(db.getDb(), liveA);
    expect(claimed?.liveSessionId).toBe(sessionId);

    // Live transforms have maxRetries 1 — pretend the budget is spent.
    await db.getDb().execute(sql`
      UPDATE jobs SET retry_count = 1 WHERE id = ${claimed!.id}
    `);

    const outcome = await markWorkerUnhealthy(db.getDb(), liveA);
    expect(outcome?.failedJobs).toContain(claimed!.id);
    expect(outcome?.failedSessions).toContain(sessionId);

    const after = await getJob(db.getDb(), claimed!.id);
    expect(after?.status).toBe("FAILED");
    expect((await getSession(db.getDb(), sessionId))?.status).toBe("FAILED");
  });
});

describe("P2 recovery — reservation sweeper requeues AND reassigns", () => {
  it("an expired reservation from a shut-down worker is re-routed to a sleeping capable worker", async () => {
    // video.h3 gives this suite an isolated capability pool: no worker from
    // an earlier suite in this file can serve video.generate.h3.
    const ghost = await provision("rec-ghost", ["video.h3"]);
    const sleeper = await provision("rec-sweep-sleeper", ["video.h3"]);
    await putToSleep(sleeper);

    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "video.generate.h3",
      idempotencyKey: "rec-sweep-1",
      inputRefs: { prompt: "a test render" },
    });
    const claimed = await claimNextJob(db.getDb(), ghost);
    expect(claimed?.id).toBe(job.id); // RESERVED, never started

    // The claiming box never reported STARTED and is shut down by an admin —
    // with no awake video.h3 capacity left, the requeued job must wake the
    // sleeping replacement (SHUTDOWN workers are never selection candidates).
    await db.getDb().execute(sql`
      UPDATE workers SET status = 'SHUTDOWN' WHERE id = ${ghost}
    `);
    await db.getDb().execute(sql`
      UPDATE jobs SET updated_at = now() - (${RESERVATION_TTL_MS + 60_000} || ' milliseconds')::interval
      WHERE id = ${job.id}
    `);
    const result = await schedulerTick(db.getDb());
    expect(result.requeuedReservations).toContain(job.id);

    const after = await getJob(db.getDb(), job.id);
    expect(after?.status).toBe("QUEUED");
    expect(after?.workerId).toBeNull();
    expect(await wakeRequested(sleeper)).not.toBeNull();

    // The replacement completes the handshake and claims the requeued job.
    expect(await tryAcceptWake(db.getDb(), sleeper)).toBe(true);
    const reclaimed = await claimNextJob(db.getDb(), sleeper);
    expect(reclaimed?.id).toBe(job.id);

    // Retire the replacement so later suites in this file see an empty
    // awake video.h3 pool for their own capacity assertions. (Its RESERVED
    // job is fresh; the reservation sweeper would recover it after the TTL.)
    await db.getDb().execute(sql`
      UPDATE workers SET status = 'SHUTDOWN' WHERE id = ${sleeper}
    `);
  });
});

describe("P2 recovery — worker-reported failure requeues honestly", () => {
  it("a requeued failJob routes back to the awake reporting worker; its later death + tick wakes the sleeping replacement", async () => {
    const awake = await provision("rec-fail-awake", ["video.h3"]);
    const sleeper = await provision("rec-fail-sleeper", ["video.h3"]);
    await putToSleep(sleeper);

    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "video.generate.h3",
      idempotencyKey: "rec-fail-1",
      inputRefs: { prompt: "a test render" },
    });
    const claimed = await claimNextJob(db.getDb(), awake);
    expect(claimed?.id).toBe(job.id);

    // The worker reports a failure but stays alive and capable: the
    // requeued job routes back to it (it polls) — no cold start is spent
    // on the sleeping replacement while awake capacity exists.
    const requeued = await failJob(db.getDb(), {
      jobId: job.id,
      workerId: awake,
      failureInfo: { reason: "simulated_worker_error" },
    });
    expect(requeued?.status).toBe("QUEUED");
    expect(await wakeRequested(sleeper)).toBeNull();

    // The worker then dies: the job is now QUEUED with no in-flight owner,
    // so no requeue path owns its reroute — the tick's orphaned-job
    // re-router (§7.6 safety net) wakes the sleeping capable replacement.
    await markWorkerUnhealthy(db.getDb(), awake);
    const tick = await schedulerTick(db.getDb());
    expect(tick.orphanWakes).toContain(sleeper);
    expect(await wakeRequested(sleeper)).not.toBeNull();

    // The replacement completes the handshake and claims the orphan.
    expect(await tryAcceptWake(db.getDb(), sleeper)).toBe(true);
    const reclaimed = await claimNextJob(db.getDb(), sleeper);
    expect(reclaimed?.id).toBe(job.id);
  });
});

describe("P2 recovery — reroute safety", () => {
  it("skips jobs that were already re-claimed, and reports nothing to wake", async () => {
    const taker = await provision("rec-taker", ["transform.image"]);
    const sleeper = await provision("rec-skip-sleeper", ["transform.image"]);
    await putToSleep(sleeper);

    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "rec-skip-1",
    });
    // Drain older QUEUED jobs from earlier suites (the queue is strictly
    // oldest-first) until this suite's job is the one held RESERVED.
    let claimed = await claimNextJob(db.getDb(), taker);
    while (claimed && claimed.id !== job.id) {
      claimed = await claimNextJob(db.getDb(), taker);
    }
    expect(claimed?.id).toBe(job.id);

    const outcomes = await rerouteRequeuedJobs(db.getDb(), [job.id]);
    expect(outcomes).toHaveLength(0);
    expect(await wakeRequested(sleeper)).toBeNull();
  });
});
