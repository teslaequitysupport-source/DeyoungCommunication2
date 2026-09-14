/**
 * P2 compute-reality suite (spec §45 sleep system, §8 worker selection,
 * §9 H3 registry entry): idle timeout → SLEEP, cold-start wake handshake,
 * selection scoring, no-capable-worker honesty, and scheduler integration —
 * exercised against a private Postgres (same harness as P1).
 */

import { afterAll, describe, expect, it } from "vitest";
import { closeStack, ready } from "./p1-harness";
import type { WorkerCandidate } from "@/lib/workers/selection";

await ready();
afterAll(async () => {
  await closeStack();
});

const { createAuth } = await import("@/lib/auth");
const {
  provisionWorker,
  registerWorker,
  workerHeartbeat,
} = await import("@/lib/workers/registry");
const {
  sleepIdleWorkers,
  requestWorkerWake,
  tryAcceptWake,
  WORKER_IDLE_SLEEP_MS,
} = await import("@/lib/workers/sleep");
const {
  selectWorkerForJobType,
  routeJobAfterEnqueue,
  compareAwakeWorkers,
} = await import("@/lib/workers/selection");
const {
  enqueueJob,
  claimNextJob,
  getJob,
} = await import("@/lib/jobs/queue");
const { claimableJobTypes } = await import("@/lib/jobs/types");
const { schedulerTick } = await import("@/lib/scheduler/tick");
const db = await import("@/lib/db");
const { drizzle } = await import("drizzle-orm/pglite");
const schemaNS = await import("@/lib/db/schema");
const schema = schemaNS;
const { eq, sql } = await import("drizzle-orm");

const CRED = "p2-sleep-suite-credential";

async function workerId(name: string): Promise<string> {
  const rows = await db
    .getDb()
    .select()
    .from(schema.workers)
    .where(eq(schema.workers.name, name))
    .limit(1);
  if (!rows[0]) throw new Error(`worker ${name} not provisioned`);
  return rows[0].id;
}

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
  return workerId(name);
}

async function anyUserId(): Promise<string> {
  const [user] = await db.getDb().select().from(schema.user).limit(1);
  if (!user) {
    const auth = createAuth(
      drizzle((await ready()).client, { schema: schemaNS }) as never,
    );
    await auth.api.signUpEmail({
      body: {
        name: "P2 Sleep User",
        email: "p2-sleep@test.dev",
        password: "p2-sleep-suite-password-123",
      },
    });
    return anyUserId();
  }
  return user.id;
}

/** Force a worker's idle_since_at into the past (as if idle for `ms`). */
async function ageIdleSince(workerId: string, ms: number): Promise<void> {
  await db.getDb().execute(sql`
    UPDATE workers SET idle_since_at = now() - (${ms} || ' milliseconds')::interval
    WHERE id = ${workerId}
  `);
}

describe("P2 unit — job-type registry (§9)", () => {
  it("maps the video.h3 capability to the H3 generation job type", () => {
    expect(claimableJobTypes(["video.h3"])).toContain("video.generate.h3");
    expect(claimableJobTypes(["transform.image"])).not.toContain("video.generate.h3");
    expect(claimableJobTypes([])).not.toContain("video.generate.h3");
  });
});

describe("P2 unit — awake-worker ordering (§8)", () => {
  const base = {
    id: "x",
    name: "x",
    provider: "p",
    status: "IDLE",
    capabilities: [],
    models: [],
    gpuType: null,
    vramMb: null,
    region: null,
    activeJobs: 0,
    errorCount: 0,
    heartbeatLatencyMs: null,
    lastHeartbeatAt: null,
  };
  const candidate = (over: Partial<WorkerCandidate>): WorkerCandidate =>
    ({ ...base, ...over }) as WorkerCandidate;

  it("prefers fewer active jobs (load)", () => {
    const busy = candidate({ id: "busy", activeJobs: 3 });
    const free = candidate({ id: "free", activeJobs: 0 });
    expect([busy, free].sort(compareAwakeWorkers)[0].id).toBe("free");
  });

  it("breaks load ties on error count (health history)", () => {
    const flaky = candidate({ id: "flaky", errorCount: 5 });
    const clean = candidate({ id: "clean", errorCount: 0 });
    expect([flaky, clean].sort(compareAwakeWorkers)[0].id).toBe("clean");
  });

  it("breaks further ties on heartbeat latency", () => {
    const far = candidate({ id: "far", heartbeatLatencyMs: 900 });
    const near = candidate({ id: "near", heartbeatLatencyMs: 20 });
    expect([far, near].sort(compareAwakeWorkers)[0].id).toBe("near");
  });
});

describe("P2 — sleep sweep (§45 idle timeout)", () => {
  it("sleeps an idle worker past the timeout, keeps busy and in-flight workers awake", async () => {
    const sleeper = await provision("p2-sleeper", ["transform.image"]);
    const busy = await provision("p2-busy", ["transform.image"]);
    const inflight = await provision("p2-inflight", ["transform.image"]);

    // All idle with fresh heartbeats: nothing sleeps.
    const noneSlept = await sleepIdleWorkers(db.getDb(), { idleMs: 60_000 });
    expect(noneSlept.sleptWorkers).toHaveLength(0);

    // sleeper: idle for a long time; busy: activeJobs = 1; inflight: holds a
    // RUNNING job. Only sleeper may transition.
    await ageIdleSince(sleeper, WORKER_IDLE_SLEEP_MS + 60_000);
    await ageIdleSince(busy, WORKER_IDLE_SLEEP_MS + 60_000);
    await ageIdleSince(inflight, WORKER_IDLE_SLEEP_MS + 60_000);
    await db.getDb().execute(sql`
      UPDATE workers SET active_jobs = 1 WHERE id = ${busy}
    `);
    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.image.colorgrade",
      idempotencyKey: "p2-sweep-inflight",
    });
    await claimNextJob(db.getDb(), inflight); // RESERVED on inflight
    await db.getDb().execute(sql`
      UPDATE jobs SET status = 'RUNNING' WHERE id = ${job.id}
    `);

    const sweep = await sleepIdleWorkers(db.getDb(), { idleMs: 60_000 });
    expect(sweep.sleptWorkers).toEqual([sleeper]);

    const statuses = await db.getDb().execute<{ name: string; status: string }>(sql`
      SELECT name, status FROM workers
      WHERE id IN (${sleeper}, ${busy}, ${inflight})
    `);
    const byName = new Map(statuses.rows.map((r) => [r.name, r.status]));
    expect(byName.get("p2-sleeper")).toBe("SLEEPING");
    expect(byName.get("p2-busy")).toBe("IDLE");
    expect(byName.get("p2-inflight")).toBe("IDLE");
  });

  it("scheduler tick reports slept workers", async () => {
    const tickSleeper = await provision("p2-tick-sleeper", ["transform.image"]);
    await ageIdleSince(tickSleeper, WORKER_IDLE_SLEEP_MS + 60_000);
    const result = await schedulerTick(db.getDb(), { idleSleepMs: 60_000 });
    expect(result.sleptWorkers).toContain(tickSleeper);
  });
});

describe("P2 — wake handshake (§45 cold start)", () => {
  it("refuses the handshake with no pending request; completes it when a job woke the worker", async () => {
    // The only video.h3-capable worker in this database, put to sleep first —
    // so an H3 job has no awake capacity and must trigger a cold start.
    const h3Worker = await provision("p2-h3-worker", ["video.h3"]);
    await ageIdleSince(h3Worker, WORKER_IDLE_SLEEP_MS + 60_000);
    await sleepIdleWorkers(db.getDb(), { idleMs: 60_000 });

    // No wake requested: the wake handshake must NOT accept.
    expect(await tryAcceptWake(db.getDb(), h3Worker)).toBe(false);

    // A job arrives — routing finds only the sleeping worker and requests wake.
    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "video.generate.h3",
      idempotencyKey: "p2-wake-1",
    });
    const routing = await routeJobAfterEnqueue(db.getDb(), job);
    expect(routing.outcome).toBe("wake");
    if (routing.outcome === "wake") {
      expect(routing.workerId).toBe(h3Worker);
      expect(routing.reason).toBe("sleeping_worker_cold_start");
    }

    const wakeState = await db.getDb().execute<{
      wake_requested_at: Date | null;
    }>(sql`SELECT wake_requested_at FROM workers WHERE id = ${h3Worker}`);
    expect(wakeState.rows[0]?.wake_requested_at).not.toBeNull();

    // The worker's next poll completes the wake handshake, then claims.
    expect(await tryAcceptWake(db.getDb(), h3Worker)).toBe(true);
    const claimed = await claimNextJob(db.getDb(), h3Worker);
    expect(claimed?.id).toBe(job.id);

    const after = await db.getDb().execute<{
      status: string;
      wake_requested_at: Date | null;
    }>(sql`SELECT status, wake_requested_at FROM workers WHERE id = ${h3Worker}`);
    expect(after.rows[0]?.status).toBe("IDLE"); // claim reserves the job, worker stays IDLE
    expect(after.rows[0]?.wake_requested_at).toBeNull();

    const fresh = await getJob(db.getDb(), job.id);
    expect(fresh?.status).toBe("RESERVED");
    expect(fresh?.workerId).toBe(h3Worker);
  });

  it("requestWorkerWake refuses non-sleeping and unknown workers", async () => {
    const awake = await provision("p2-awake", ["transform.image"]);
    const awakeWake = await requestWorkerWake(db.getDb(), { workerId: awake });
    expect(awakeWake).toEqual({ ok: false, reason: "not_sleeping" });
    const ghost = await requestWorkerWake(db.getDb(), {
      workerId: "00000000-0000-0000-0000-000000000000",
    });
    expect(ghost).toEqual({ ok: false, reason: "unknown_worker" });
  });
});

describe("P2 — worker selection (§8)", () => {
  it("prefers an awake capable worker and reports assigned", async () => {
    const routing = await selectWorkerForJobType(
      db.getDb(),
      "transform.image.colorgrade",
    );
    // p2-awake / p2-busy / p2-inflight are IDLE and capable from earlier suites.
    expect(routing.outcome).toBe("assigned");
  });

  it("selects the awake H3-capable worker for H3 jobs after the cold start", async () => {
    // p2-h3-worker woke during the handshake suite and is IDLE now.
    const decision = await selectWorkerForJobType(db.getDb(), "video.generate.h3");
    expect(decision.outcome).toBe("assigned");
    if (decision.outcome === "assigned") {
      expect(decision.workerId).toBe(await workerId("p2-h3-worker"));
    }
  });

  it("reports none when no worker anywhere has the capability", async () => {
    const decision = await selectWorkerForJobType(db.getDb(), "transform.live.colorgrade");
    // No worker in this suite registered transform.live.
    expect(decision).toEqual({ outcome: "none", reason: "no_capable_worker" });
  });

  it("excludes UNHEALTHY workers from selection entirely", async () => {
    const broken = await provision("p2-broken", ["transform.image"]);
    await db.getDb().execute(sql`
      UPDATE workers SET status = 'UNHEALTHY' WHERE id = ${broken}
    `);
    const decision = await selectWorkerForJobType(
      db.getDb(),
      "transform.image.colorgrade",
    );
    expect(decision.outcome).toBe("assigned");
    if (decision.outcome === "assigned") expect(decision.workerId).not.toBe(broken);
  });
});

describe("P2 — enqueue routing visibility", () => {
  it("job with no capable worker stays QUEUED with an honest routing reason", async () => {
    const userId = await anyUserId();
    const job = await enqueueJob(db.getDb(), {
      userId,
      type: "transform.live.colorgrade",
      idempotencyKey: "p2-no-worker-1",
    });
    const routing = await routeJobAfterEnqueue(db.getDb(), job);
    expect(routing.outcome).toBe("none");
    if (routing.outcome === "none") {
      expect(routing.reason).toBe("no_capable_worker");
    }
    const fresh = await getJob(db.getDb(), job.id);
    expect(fresh?.status).toBe("QUEUED");
    expect(fresh?.workerId).toBeNull();
  });
});

describe("P2 — heartbeat idle clock (§45)", () => {
  it("stamps idle_since_at on zero-load heartbeats and clears it under load", async () => {
    const clocked = await provision("p2-clocked", ["transform.image"]);

    await workerHeartbeat(db.getDb(), {
      workerId: clocked,
      activeJobs: 0,
      heartbeatLatencyMs: 12,
    });
    let row = await db.getDb().execute<{ idle_since_at: Date | null }>(
      sql`SELECT idle_since_at FROM workers WHERE id = ${clocked}`,
    );
    expect(row.rows[0]?.idle_since_at).not.toBeNull();

    await workerHeartbeat(db.getDb(), {
      workerId: clocked,
      activeJobs: 2,
      heartbeatLatencyMs: 12,
    });
    row = await db.getDb().execute<{ idle_since_at: Date | null }>(
      sql`SELECT idle_since_at FROM workers WHERE id = ${clocked}`,
    );
    expect(row.rows[0]?.idle_since_at).toBeNull();
  });
});
