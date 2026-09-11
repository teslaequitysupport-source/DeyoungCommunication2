/**
 * E2E journey through the REAL route handlers (spec §51):
 * signup → character → asset upload → consent → session → worker claim →
 * status transitions → output upload → stop → RESULT → media library.
 *
 * Route handlers are invoked with real Request objects against a private
 * Postgres (PGlite over the wire protocol) — the same code path the Next
 * server executes. The worker side is exercised through the worker HTTP
 * surface with real credentials.
 */

import { afterAll, describe, expect, it } from "vitest";
import { closeStack, ready } from "./p1-harness";

await ready();
afterAll(async () => {
  await closeStack();
});

// Helpers are imported DYNAMICALLY (after the harness pinned the env):
// helpers.ts imports @/lib/auth whose module-level singleton would
// otherwise bind to the wrong database before ready() runs.
const { signInCookieHeaders } = await import("./helpers");

// Route handlers (imported AFTER the harness pinned the environment).
const charactersApi = await import("@/app/api/characters/route");
const consentApi = await import("@/app/api/consent/route");
const consentWithdrawApi = await import("@/app/api/consent/withdraw/route");
const assetsPresignApi = await import("@/app/api/assets/presign/route");
const assetsUploadApi = await import("@/app/api/assets/upload/route");
const assetsListApi = await import("@/app/api/assets/route");
const assetFileApi = await import("@/app/api/assets/[id]/file/route");
const sessionsApi = await import("@/app/api/sessions/route");
const sessionStopApi = await import("@/app/api/sessions/[id]/stop/route");
const jobsApi = await import("@/app/api/jobs/route");
const workerRegisterApi = await import("@/app/api/worker/register/route");
const workerClaimApi = await import("@/app/api/worker/claim/route");
const workerStatusApi = await import("@/app/api/worker/jobs/[id]/status/route");
const workerResultApi = await import("@/app/api/worker/jobs/[id]/result/route");
const workerOutputApi = await import("@/app/api/worker/jobs/[id]/output/route");

// Libs bound to the harness database — all dynamically imported AFTER ready().
const { createAuth } = await import("@/lib/auth");
const { provisionWorker } = await import("@/lib/workers/registry");
const { getJob } = await import("@/lib/jobs/queue");
const { getSession } = await import("@/lib/sessions/state-machine");
const db = await import("@/lib/db");
import sharp from "sharp";

const BASE = "http://localhost:3000";
const WORKER_NAME = "dev-worker-e2e";
const WORKER_CREDENTIAL = "e2e-worker-credential-0123456789";

function jsonRequest(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function workerHeaders(name = WORKER_NAME, credential = WORKER_CREDENTIAL) {
  return {
    "x-worker-name": name,
    authorization: `Bearer ${credential}`,
    "content-type": "application/json",
  };
}

/** A real 2x2 JPEG produced by sharp — never fabricated bytes. */
async function realJpeg(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#3d5a80" },
    })
      .jpeg()
      .toBuffer(),
  );
}

describe("E2E journey — signup through save result", () => {
  let userCookie: Headers;
  let otherCookie: Headers;
  let characterId: string;
  let assetId: string;
  let sessionId: string;
  let jobId: string;
  let outputAssetId: string;

  it("signs up the session owner", async () => {
    const { client } = await ready();
    const { drizzle } = await import("drizzle-orm/pglite");
    const schemaNS = await import("@/lib/db/schema");
    const auth = createAuth(drizzle(client, { schema: schemaNS }) as never);
    await auth.api.signUpEmail({
      body: {
        name: "E2E Owner",
        email: "owner@e2e.test",
        password: "correct-horse-battery-staple",
      },
    });
    await auth.api.signUpEmail({
      body: {
        name: "E2E Other",
        email: "other@e2e.test",
        password: "another-correct-horse-battery",
      },
    });
    userCookie = await signInCookieHeaders(auth as never, "owner@e2e.test", "correct-horse-battery-staple");
    otherCookie = await signInCookieHeaders(auth as never, "other@e2e.test", "another-correct-horse-battery");
    expect(userCookie.get("cookie")).toContain("better-auth.session_token=");
  });

  it("rejects unauthenticated access to protected routes", async () => {
    const res = await charactersApi.GET(jsonRequest("/api/characters", "GET", undefined));
    expect(res.status).toBe(401);
    const res2 = await sessionsApi.POST(jsonRequest("/api/sessions", "POST", {}));
    expect(res2.status).toBe(401);
  });

  it("creates a character", async () => {
    const res = await charactersApi.POST(
      jsonRequest("/api/characters", "POST", { name: "Aurora", hue: 200, saturation: 1.2 }, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.character.name).toBe("Aurora");
    expect(data.character.appearanceConfig.hue).toBe(200);
    characterId = data.character.id as string;
  });

  it("blocks consent-free live sessions with consent_required", async () => {
    const res = await sessionsApi.POST(
      jsonRequest("/api/sessions", "POST", { characterId }, { cookie: userCookie.get("cookie")! }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("consent_required");
  });

  it("presigns and uploads a real face image", async () => {
    const jpeg = await realJpeg();
    const presign = await assetsPresignApi.POST(
      jsonRequest("/api/assets/presign", "POST", {
        kind: "FACE_IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: jpeg.byteLength,
      }, { cookie: userCookie.get("cookie")! }),
    );
    expect(presign.status).toBe(200);
    const directive = await presign.json();
    expect(directive.mode).toBe("server");
    expect(directive.storage).toBe("local-dev");

    const upload = await assetsUploadApi.PUT(
      new Request(`${BASE}${directive.uploadUrl}`, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: jpeg as unknown as BodyInit,
      }),
    );
    expect(upload.status).toBe(200);
    const uploaded = await upload.json();
    expect(uploaded.asset.mimeType).toBe("image/jpeg");
    expect(uploaded.asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    assetId = uploaded.asset.id as string;
  });

  it("rejects wrong-size and mislabeled uploads", async () => {
    const jpeg = await realJpeg();
    const presign = await assetsPresignApi.POST(
      jsonRequest("/api/assets/presign", "POST", {
        kind: "FACE_IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: jpeg.byteLength + 1,
      }, { cookie: userCookie.get("cookie")! }),
    );
    const directive = await presign.json();

    const badSize = await assetsUploadApi.PUT(
      new Request(`${BASE}${directive.uploadUrl}`, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: jpeg as unknown as BodyInit,
      }),
    );
    expect(badSize.status).toBe(400);
    expect((await badSize.json()).error).toBe("size_mismatch");

    // A text payload declared as JPEG must fail magic-byte validation.
    const presign2 = await assetsPresignApi.POST(
      jsonRequest("/api/assets/presign", "POST", {
        kind: "FACE_IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: 24,
      }, { cookie: userCookie.get("cookie")! }),
    );
    const directive2 = await presign2.json();
    const fake = await assetsUploadApi.PUT(
      new Request(`${BASE}${directive2.uploadUrl}`, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: new Uint8Array(24).fill(0x41) as unknown as BodyInit,
      }),
    );
    expect(fake.status).toBe(400);
    expect((await fake.json()).error).toBe("magic_bytes_mismatch");
  });

  it("rejects forged upload tickets", async () => {
    const forged = `${Buffer.from("not-a-real-ticket").toString("base64url")}.AAAA`;
    const res = await assetsUploadApi.PUT(
      new Request(`${BASE}/api/assets/upload?ticket=${encodeURIComponent(forged)}`, {
        method: "PUT",
        body: new Uint8Array(8),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("grants camera-transform consent and starts a live session", async () => {
    const grant = await consentApi.POST(
      jsonRequest("/api/consent", "POST", { purpose: "camera.transform.live" }, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    expect(grant.status).toBe(201);
    expect((await grant.json()).consent.status).toBe("GRANTED");

    const res = await sessionsApi.POST(
      jsonRequest("/api/sessions", "POST", { characterId }, { cookie: userCookie.get("cookie")! }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session.status).toBe("WAITING_FOR_WORKER");
    sessionId = data.session.id as string;

    const { latestJobForSession } = await import("@/lib/jobs/queue");
    const job = await latestJobForSession(db.getDb(), sessionId);
    expect(job).toBeTruthy();
    expect(job?.status).toBe("QUEUED");
    jobId = job!.id;
  });

  it("provisions and registers the worker", async () => {
    await provisionWorker(db.getDb(), {
      name: WORKER_NAME,
      provider: "DEVELOPMENT_LOCAL",
      credential: WORKER_CREDENTIAL,
    });

    const badName = await workerRegisterApi.POST(
      jsonRequest("/api/worker/register", "POST", {}, workerHeaders("unknown-worker", WORKER_CREDENTIAL)),
    );
    expect(badName.status).toBe(404);

    const badCredential = await workerRegisterApi.POST(
      jsonRequest("/api/worker/register", "POST", {}, workerHeaders(WORKER_NAME, "wrong-credential-0000000")),
    );
    expect(badCredential.status).toBe(401);

    const register = await workerRegisterApi.POST(
      jsonRequest("/api/worker/register", "POST", {
        provider: "DEVELOPMENT_LOCAL",
        capabilities: ["transform.image", "transform.live"],
        models: ["sharp:0.34"],
        version: "dev-worker-1.0.0",
      }, workerHeaders()),
    );
    expect(register.status).toBe(200);
    expect((await register.json()).worker.name).toBe(WORKER_NAME);
  });

  it("claims the live job (ALLOCATE payload with realtime ticket)", async () => {
    const res = await workerClaimApi.POST(
      jsonRequest("/api/worker/claim", "POST", {}, workerHeaders()),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.job.id).toBe(jobId);
    expect(data.job.status).toBe("RESERVED");
    expect(data.allocate.kind).toBe("live");
    expect(data.allocate.realtime.ticket).toBeTruthy();
    expect(data.allocate.character.appearance.hue).toBe(200);

    const session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("WORKER_ASSIGNED");
  });

  it("advances STARTED → SESSION_READY → SESSION_LIVE", async () => {
    const started = await workerStatusApi.POST(
      jsonRequest(`/api/worker/jobs/${jobId}/status`, "POST", { phase: "STARTED" }, workerHeaders()),
      { params: Promise.resolve({ id: jobId }) } as never,
    );
    expect(started.status).toBe(200);
    let session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("LOADING");

    const ready = await workerStatusApi.POST(
      jsonRequest(`/api/worker/jobs/${jobId}/status`, "POST", { phase: "SESSION_READY", sessionId }, workerHeaders()),
      { params: Promise.resolve({ id: jobId }) } as never,
    );
    expect(ready.status).toBe(200);
    session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("READY");

    const live = await workerStatusApi.POST(
      jsonRequest(`/api/worker/jobs/${jobId}/status`, "POST", { phase: "SESSION_LIVE", sessionId }, workerHeaders()),
      { params: Promise.resolve({ id: jobId }) } as never,
    );
    expect(live.status).toBe(200);
    session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("LIVE");
  });

  it("uploads worker output through the worker-authenticated route", async () => {
    const jpeg = await realJpeg();
    const res = await workerOutputApi.POST(
      new Request(`${BASE}/api/worker/jobs/${jobId}/output`, {
        method: "POST",
        headers: { ...workerHeaders(), "content-type": "image/jpeg" },
        body: jpeg as unknown as BodyInit,
      }),
      { params: Promise.resolve({ id: jobId }) } as never,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.asset.kind).toBe("RENDER_OUTPUT");
    outputAssetId = data.asset.id as string;
  });

  it("stops the session and completes the job (save result)", async () => {
    const stop = await sessionStopApi.POST(
      jsonRequest(`/api/sessions/${sessionId}/stop`, "POST", undefined, {
        cookie: userCookie.get("cookie")!,
      }),
      { params: Promise.resolve({ id: sessionId }) } as never,
    );
    expect(stop.status).toBe(200);
    expect((await stop.json()).session.status).toBe("STOPPING");

    const result = await workerResultApi.POST(
      jsonRequest(`/api/worker/jobs/${jobId}/result`, "POST", {
        result: { outputAssetId, transform: "dev.colorgrade" },
        usage: { framesIn: 10, framesOut: 9 },
      }, workerHeaders()),
      { params: Promise.resolve({ id: jobId }) } as never,
    );
    expect(result.status).toBe(200);

    const job = await getJob(db.getDb(), jobId);
    expect(job?.status).toBe("SUCCEEDED");
    const session = await getSession(db.getDb(), sessionId);
    expect(session?.status).toBe("COMPLETED");
  });

  it("shows the saved output in the media library", async () => {
    const list = await assetsListApi.GET(
      jsonRequest("/api/assets", "GET", undefined, { cookie: userCookie.get("cookie")! }),
    );
    const data = await list.json();
    const output = data.assets.find((a: { id: string }) => a.id === outputAssetId);
    expect(output).toBeTruthy();
    expect(output.kind).toBe("RENDER_OUTPUT");

    const file = await assetFileApi.GET(
      jsonRequest(`/api/assets/${outputAssetId}/file`, "GET", undefined, {
        cookie: userCookie.get("cookie")!,
      }),
      { params: Promise.resolve({ id: outputAssetId }) } as never,
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(bytes[0]).toBe(0xff); // real JPEG bytes
    expect(bytes[1]).toBe(0xd8);
  });

  it("blocks cross-user access (IDOR/BOLA)", async () => {
    const res = await assetFileApi.GET(
      jsonRequest(`/api/assets/${assetId}/file`, "GET", undefined, {
        cookie: otherCookie.get("cookie")!,
      }),
      { params: Promise.resolve({ id: assetId }) } as never,
    );
    expect(res.status).toBe(404); // exists, but not for this user

    const res2 = await sessionStopApi.POST(
      jsonRequest(`/api/sessions/${sessionId}/stop`, "POST", undefined, {
        cookie: otherCookie.get("cookie")!,
      }),
      { params: Promise.resolve({ id: sessionId }) } as never,
    );
    expect(res2.status).toBe(404);
  });

  it("blocks workers from reading assets outside their assigned job", async () => {
    // The uploaded face image is NOT part of any assigned job for this worker.
    const res = await assetFileApi.GET(
      jsonRequest(`/api/assets/${assetId}/file`, "GET", undefined, workerHeaders()),
      { params: Promise.resolve({ id: assetId }) } as never,
    );
    expect(res.status).toBe(403);
  });

  it("withdrawn consent blocks new live sessions", async () => {
    const withdraw = await consentWithdrawApi.POST(
      jsonRequest("/api/consent/withdraw", "POST", { purpose: "camera.transform.live" }, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    expect(withdraw.status).toBe(200);

    const res = await sessionsApi.POST(
      jsonRequest("/api/sessions", "POST", { characterId }, { cookie: userCookie.get("cookie")! }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("consent_required");
  });

  it("job records are visible to their owner only through /api/jobs", async () => {
    const res = await jobsApi.GET(
      jsonRequest("/api/jobs", "GET", undefined, { cookie: userCookie.get("cookie")! }),
    );
    const data = await res.json();
    expect(data.jobs.some((j: { id: string }) => j.id === jobId)).toBe(true);

    const other = await jobsApi.GET(
      jsonRequest("/api/jobs", "GET", undefined, { cookie: otherCookie.get("cookie")! }),
    );
    const otherData = await other.json();
    expect(otherData.jobs.some((j: { id: string }) => j.id === jobId)).toBe(false);
  });
});
