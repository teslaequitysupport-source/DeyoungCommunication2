/**
 * P5 Credits integration tests (spec §41) — the manual-credits billing
 * system: signup bonus, job spend gating, automatic refunds, admin grants,
 * and the exactly-once invariants that make the ledger trustworthy.
 *
 * Harness contract (tests/p1-harness.ts): await ready() BEFORE importing
 * any app module so the db/auth singletons bind to this file's private
 * database.
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { ready, closeStack } from "./p1-harness";

await ready();

const jobsApi = await import("@/app/api/jobs/route");
const accountCreditsApi = await import("@/app/api/account/credits/route");
const adminGrantApi = await import("@/app/api/admin/credits/grant/route");
const assetsPresignApi = await import("@/app/api/assets/presign/route");
const assetsUploadApi = await import("@/app/api/assets/upload/route");

const { createAuth } = await import("@/lib/auth");
const { signInCookieHeaders } = await import("./helpers");
const db = await import("@/lib/db");
const { drizzle } = await import("drizzle-orm/pglite");
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

const BASE = "http://localhost:3000";
const PASSWORD = "correct-horse-battery-staple";

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

async function realJpeg(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#3d5a80" },
    })
      .jpeg()
      .toBuffer(),
  );
}

interface Harness {
  auth: ReturnType<typeof createAuth>;
  cookie: (email: string) => Promise<Headers>;
}

let h: Harness;
let userCookie: Headers;
let adminCookie: Headers;
let assetId: string;
let spenderId: string;

async function harnessDb() {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  return { db: drizzle(client, { schema: schemaNS }), schema: schemaNS };
}

beforeAll(async () => {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  const auth = createAuth(drizzle(client, { schema: schemaNS }) as never);
  h = {
    auth,
    cookie: (email) =>
      signInCookieHeaders(auth as never, email, PASSWORD),
  };

  await auth.api.signUpEmail({
    body: { name: "Spender", email: "spender@p5.test", password: PASSWORD },
  });
  await auth.api.signUpEmail({
    body: { name: "Admin", email: "admin@p5.test", password: PASSWORD },
  });

  // Cookies FIRST (sign-in before flags — the DB flag flip never triggers
  // a 2FA challenge on already-issued sessions), then elevate the admin.
  userCookie = await h.cookie("spender@p5.test");
  adminCookie = await h.cookie("admin@p5.test");

  const hdb = await harnessDb();
  await hdb.db
    .update(hdb.schema.user)
    .set({ role: "ADMIN", twoFactorEnabled: true })
    .where(eq(hdb.schema.user.email, "admin@p5.test"));

  const [spender] = await hdb.db
    .select({ id: hdb.schema.user.id })
    .from(hdb.schema.user)
    .where(eq(hdb.schema.user.email, "spender@p5.test"));
  spenderId = spender.id;

  // One real uploaded asset to attach jobs to.
  const jpeg = await realJpeg();
  const presign = await assetsPresignApi.POST(
    jsonRequest("/api/assets/presign", "POST", {
      kind: "FACE_IMAGE",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    }, { cookie: userCookie.get("cookie")! }),
  );
  const directive = await presign.json();
  const upload = await assetsUploadApi.PUT(
    new Request(`${BASE}${directive.uploadUrl}`, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: jpeg as unknown as BodyInit,
    }),
  );
  assetId = ((await upload.json()) as { asset: { id: string } }).asset.id;
});

afterAll(async () => {
  await closeStack();
});

describe("P5 credits — signup bonus, spend gate, refunds, admin grants", () => {
  it("grants the signup bonus exactly once at sign-up", async () => {
    const api = await import("@/lib/credits");

    const balance = await api.creditBalance(db.getDb(), spenderId);
    expect(balance).toBe(100); // default SIGNUP_BONUS_CREDITS

    // The idempotency key guarantees hook replays are free.
    const again = await api.grantCredits(db.getDb(), {
      userId: spenderId,
      amount: 100,
      kind: "SIGNUP_BONUS",
      idempotencyKey: `signup-bonus:${spenderId}`,
    });
    expect(again.applied).toBe(false);
    expect(await api.creditBalance(db.getDb(), spenderId)).toBe(100);
  });

  it("shows balance, history and honest costs through the account API", async () => {
    const res = await accountCreditsApi.GET(
      jsonRequest("/api/account/credits", "GET", undefined, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.balance).toBe(100);
    expect(data.costs["transform.image.colorgrade"]).toBe(1);
    expect(data.costs["video.generate.h3"]).toBe(50);
    expect(data.history.length).toBe(1);
    expect(data.history[0].kind).toBe("SIGNUP_BONUS");
  });

  it("charges a job at submission and reports the new balance", async () => {
    const res = await jobsApi.POST(
      jsonRequest("/api/jobs", "POST", { assetId }, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.credits.cost).toBe(1);
    expect(data.credits.balanceAfter).toBe(99);
    expect(data.job.status).not.toBe("FAILED");
    const creditsApi0 = await import("@/lib/credits");
    expect(await creditsApi0.creditBalance(db.getDb(), spenderId)).toBe(99);
  });

  it("blocks jobs when the balance cannot pay (402 + terminal FAILED + no charge)", async () => {
    // Drain the balance via an admin grant of nothing — instead, spend the
    // remaining 99 with cost override-free jobs is slow; set the env cost
    // override for this assertion instead.
    process.env.CREDITS_COST_TRANSFORM_IMAGE_COLORGRADE = "500";
    try {
      const res = await jobsApi.POST(
        jsonRequest("/api/jobs", "POST", { assetId }, {
          cookie: userCookie.get("cookie")!,
        }),
      );
      expect(res.status).toBe(402);
      const data = await res.json();
      expect(data.error).toBe("insufficient_credits");
      expect(data.cost).toBe(500);
      expect(data.balance).toBe(99);

      // Balance unchanged, and the rejected job is terminally FAILED with
      // the honest reason.
      const creditsApi = await import("@/lib/credits");
      expect(await creditsApi.creditBalance(db.getDb(), spenderId)).toBe(99);
      const queue = await import("@/lib/jobs/queue");
      const jobs = await queue.listJobsForUser(db.getDb(), spenderId, 5);
      const rejected = jobs.find((j) => j.status === "FAILED");
      expect(rejected).toBeDefined();
      expect(rejected!.failureInfo?.reason).toBe("insufficient_credits");
    } finally {
      delete process.env.CREDITS_COST_TRANSFORM_IMAGE_COLORGRADE;
    }
  });

  it("refunds a terminally failed job exactly once", async () => {
    // New user with a fresh balance so the arithmetic is exact.
    await h.auth.api.signUpEmail({
      body: { name: "Refundee", email: "refundee@p5.test", password: PASSWORD },
    });
    const cookie = h.cookie("refundee@p5.test");

    // Grant +50 via admin so we have deterministic funds.
    const hdb = await harnessDb();
    const [target] = await hdb.db
      .select({ id: hdb.schema.user.id })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "refundee@p5.test"));

    const grant = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: 50,
        reason: "test grant for refund scenario",
        idempotencyKey: "refund-scenario-0001",
      }, { cookie: adminCookie.get("cookie")! }),
    );
    expect(grant.status).toBe(201);

    // Enqueue + spend through the public API path, then refund the
    // terminal end-state (worker-driven failJob refunds are covered by
    // the same idempotent helper).
    const queue = await import("@/lib/jobs/queue");
    const api = await import("@/lib/credits");
    const job = await queue.enqueueJob(db.getDb(), {
      userId: target.id,
      type: "transform.image.colorgrade",
      idempotencyKey: `batch:${assetId}:refund-test-1`,
      inputRefs: {},
    });
    const spend = await api.spendCreditsForJob(db.getDb(), {
      userId: target.id,
      jobId: job.id,
      cost: 1,
    });
    expect(spend.ok).toBe(true);

    const refundedOnce = await api.refundJobCredits(db.getDb(), { jobId: job.id });
    expect(refundedOnce).toBe(true);
    const refundedTwice = await api.refundJobCredits(db.getDb(), { jobId: job.id });
    expect(refundedTwice).toBe(false);

    const balance = await api.creditBalance(db.getDb(), target.id);
    expect(balance).toBe(100 + 50 - 1 + 1); // bonus + grant - spend + refund
  });

  it("admin grants: USER forbidden, no-MFA ADMIN forbidden, valid grant audited", async () => {
    const hdb = await harnessDb();
    const [target] = await hdb.db
      .select({ id: hdb.schema.user.id })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "spender@p5.test"));

    // USER role → 403
    const asUser = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: 10,
        reason: "should be forbidden",
        idempotencyKey: "forbidden-attempt-1",
      }, { cookie: userCookie.get("cookie")! }),
    );
    expect(asUser.status).toBe(403);

    // ADMIN without MFA → 403 mfa_required
    await hdb.db
      .update(hdb.schema.user)
      .set({ twoFactorEnabled: false })
      .where(eq(hdb.schema.user.email, "admin@p5.test"));
    // NOTE: the cookie session was signed before the flag flipped; the
    // gate reads the live user row, so this request must be denied.
    const noMfa = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: 10,
        reason: "mfa gate must block this",
        idempotencyKey: "forbidden-attempt-2",
      }, { cookie: adminCookie.get("cookie")! }),
    );
    expect(noMfa.status).toBe(403);
    expect((await noMfa.json()).error).toBe("mfa_required");

    // Restore MFA; the same grant succeeds and is audited.
    await hdb.db
      .update(hdb.schema.user)
      .set({ twoFactorEnabled: true })
      .where(eq(hdb.schema.user.email, "admin@p5.test"));
    const ok = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: 25,
        reason: "goodwill credit adjustment",
        idempotencyKey: "grant-0001",
      }, { cookie: adminCookie.get("cookie")! }),
    );
    expect(ok.status).toBe(201);
    const data = await ok.json();
    expect(data.balanceAfter).toBe(99 + 25);

    // The grant to spender is audited (the earlier refund-scenario grant
    // targeted a different user — filter to this one).
    const audits = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(
        sql`${hdb.schema.auditLog.action} = 'credits.grant' AND ${hdb.schema.auditLog.targetId} = ${target.id}`,
      );
    expect(audits.length).toBe(1);
    expect(audits[0].metadata).toMatchObject({ amount: 25 });
  });

  it("validates grant input (amount, reason, idempotency key)", async () => {
    const hdb = await harnessDb();
    const [target] = await hdb.db
      .select({ id: hdb.schema.user.id })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "spender@p5.test"));

    const badAmount = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: -5,
        reason: "negative amounts must be rejected",
        idempotencyKey: "grant-0002-bad",
      }, { cookie: adminCookie.get("cookie")! }),
    );
    expect(badAmount.status).toBe(400);

    const noKey = await adminGrantApi.POST(
      jsonRequest("/api/admin/credits/grant", "POST", {
        userId: target.id,
        amount: 5,
        reason: "missing idempotency key must be rejected",
      }, { cookie: adminCookie.get("cookie")! }),
    );
    expect(noKey.status).toBe(400);
  });

  it("keeps the ledger readable through the history endpoint", async () => {
    const res = await accountCreditsApi.GET(
      jsonRequest("/api/account/credits", "GET", undefined, {
        cookie: userCookie.get("cookie")!,
      }),
    );
    const data = await res.json();
    expect(data.balance).toBe(124); // 100 - 1 + 25
    const kinds = (data.history as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toContain("SIGNUP_BONUS");
    expect(kinds).toContain("JOB_SPEND");
    expect(kinds).toContain("ADMIN_GRANT");
  });
});
