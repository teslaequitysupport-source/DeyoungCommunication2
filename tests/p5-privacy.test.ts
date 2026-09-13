/**
 * P5 Privacy integration tests (spec §35) — the data-subject rights plane:
 * account deletion (real, cascading, accountability preserved), data export,
 * and the retention sweep with its consent-evidence preservation.
 *
 * Harness contract (tests/p1-harness.ts): await ready() BEFORE importing
 * any app module so the db/auth singletons bind to this file's private
 * database.
 */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { ready, closeStack } from "./p1-harness";

await ready();

const deleteApi = await import("@/app/api/account/delete/route");
const exportApi = await import("@/app/api/account/export/route");
const reportsApi = await import("@/app/api/reports/route");
const charactersApi = await import("@/app/api/characters/route");
const assetsPresignApi = await import("@/app/api/assets/presign/route");
const assetsUploadApi = await import("@/app/api/assets/upload/route");
const consentApi = await import("@/app/api/consent/route");

const { createAuth } = await import("@/lib/auth");
const { signInCookieHeaders } = await import("./helpers");
const { getStorage } = await import("@/lib/storage");
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
      create: { width: 8, height: 8, channels: 3, background: "#7d5a3d" },
    })
      .jpeg()
      .toBuffer(),
  );
}

async function harnessDb() {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  return { db: drizzle(client, { schema: schemaNS }), schema: schemaNS };
}

let auth: ReturnType<typeof createAuth>;
let victimCookie: Headers;
let exporterCookie: Headers;
let keeperCookie: Headers;
let victimId: string;
let exporterId: string;
let victimAssetId: string;
let victimStorageKey: string;
let keeperCharacterId: string;
let victimCharacterId: string;

beforeAll(async () => {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  auth = createAuth(drizzle(client, { schema: schemaNS }) as never);

  for (const [name, email] of [
    ["Victim", "victim@p5.test"],
    ["Exporter", "exporter@p5.test"],
    ["Keeper", "keeper@p5.test"],
  ] as const) {
    await auth.api.signUpEmail({
      body: { name, email, password: PASSWORD },
    });
  }
  victimCookie = await signInCookieHeaders(auth as never, "victim@p5.test", PASSWORD);
  exporterCookie = await signInCookieHeaders(auth as never, "exporter@p5.test", PASSWORD);
  keeperCookie = await signInCookieHeaders(auth as never, "keeper@p5.test", PASSWORD);

  const hdb = await harnessDb();
  const ids = await hdb.db
    .select({ id: hdb.schema.user.id, email: hdb.schema.user.email })
    .from(hdb.schema.user);
  victimId = ids.find((u) => u.email === "victim@p5.test")!.id;
  exporterId = ids.find((u) => u.email === "exporter@p5.test")!.id;

  // Keeper owns a character the victim will report (reports must outlive
  // the reporter's account deletion).
  const keeperChar = await charactersApi.POST(
    jsonRequest("/api/characters", "POST", { name: "KeeperChar" }, {
      cookie: keeperCookie.get("cookie")!,
    }),
  );
  keeperCharacterId = ((await keeperChar.json()) as { character: { id: string } }).character.id;

  // Victim: character + uploaded asset + consent.
  const victimChar = await charactersApi.POST(
    jsonRequest("/api/characters", "POST", { name: "VictimChar" }, {
      cookie: victimCookie.get("cookie")!,
    }),
  );
  victimCharacterId = ((await victimChar.json()) as { character: { id: string } }).character.id;

  const jpeg = await realJpeg();
  const presign = await assetsPresignApi.POST(
    jsonRequest("/api/assets/presign", "POST", {
      kind: "FACE_IMAGE",
      mimeType: "image/jpeg",
      sizeBytes: jpeg.byteLength,
    }, { cookie: victimCookie.get("cookie")! }),
  );
  const directive = await presign.json();
  const upload = await assetsUploadApi.PUT(
    new Request(`${BASE}${directive.uploadUrl}`, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: jpeg as unknown as BodyInit,
    }),
  );
  const uploaded = (await upload.json()) as { asset: { id: string; storageKey: string } };
  victimAssetId = uploaded.asset.id;
  victimStorageKey = uploaded.asset.storageKey;

  // Consent for the victim's face asset (asset-scoped purpose).
  const consent = await consentApi.POST(
    jsonRequest("/api/consent", "POST", {
      assetId: victimAssetId,
      purpose: "face.transform.offline",
    }, { cookie: victimCookie.get("cookie")! }),
  );
  expect(consent.status).toBeGreaterThanOrEqual(200);
  expect(consent.status).toBeLessThan(300);

  // Victim files a report against keeper's character.
  const report = await reportsApi.POST(
    jsonRequest("/api/reports", "POST", {
      targetType: "character",
      targetId: keeperCharacterId,
      reason: "IMPERSONATION",
      details: "This character impersonates me.",
    }, { cookie: victimCookie.get("cookie")! }),
  );
  expect(report.status).toBe(201);
});

afterAll(async () => {
  await closeStack();
});

describe("P5 privacy — export, deletion, retention", () => {
  it("exports the full data-subject document with media links", async () => {
    const res = await exportApi.GET(
      jsonRequest("/api/account/export", "GET", undefined, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.format).toBe("live-character-platform.export.v1");
    expect(data.profile.email).toBe("victim@p5.test");
    expect(data.profile.id).toBe(victimId);
    expect(data.characters.length).toBe(1);
    expect(data.assets.length).toBe(1);
    expect(data.assets[0].downloadUrl).toBe(`/api/assets/${victimAssetId}/file`);
    expect(data.consentRecords.length).toBe(1);
    expect(data.consentRecords[0].purpose).toBe("face.transform.offline");
    expect(data.reportsFiled.length).toBe(1);
    expect(data.creditLedger.length).toBe(1); // signup bonus
    expect(data.notice).toContain("secrets");

    // The export itself is audited.
    const hdb = await harnessDb();
    const audits = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.action, "account.export"));
    expect(audits.length).toBe(1);
  });

  it("guards deletion: wrong confirmation phrase, wrong password, staff block", async () => {
    const wrongPhrase = await deleteApi.POST(
      jsonRequest("/api/account/delete", "POST", {
        password: PASSWORD,
        confirmation: "delete",
      }, { cookie: victimCookie.get("cookie")! }),
    );
    expect(wrongPhrase.status).toBe(400);
    expect((await wrongPhrase.json()).error).toBe("confirmation_mismatch");

    const wrongPassword = await deleteApi.POST(
      jsonRequest("/api/account/delete", "POST", {
        password: "not-the-password",
        confirmation: "DELETE",
      }, { cookie: victimCookie.get("cookie")! }),
    );
    expect(wrongPassword.status).toBe(403);
    expect((await wrongPassword.json()).error).toBe("wrong_password");

    // Staff accounts cannot self-delete: elevate exporter, then try.
    const hdb = await harnessDb();
    await hdb.db
      .update(hdb.schema.user)
      .set({ role: "SUPPORT" })
      .where(eq(hdb.schema.user.id, exporterId));
    const staffAttempt = await deleteApi.POST(
      jsonRequest("/api/account/delete", "POST", {
        password: PASSWORD,
        confirmation: "DELETE",
      }, { cookie: exporterCookie.get("cookie")! }),
    );
    expect(staffAttempt.status).toBe(403);
    expect((await staffAttempt.json()).error).toBe("staff_account");
    await hdb.db
      .update(hdb.schema.user)
      .set({ role: "USER" })
      .where(eq(hdb.schema.user.id, exporterId));
  });

  it("hard-deletes the account: objects gone, rows cascaded, accountability survives", async () => {
    const { STORAGE_LOCAL_ROOT } = process.env;
    const objectPath = `${STORAGE_LOCAL_ROOT}/${victimStorageKey}`;
    expect(existsSync(objectPath)).toBe(true);

    const res = await deleteApi.POST(
      jsonRequest("/api/account/delete", "POST", {
        password: PASSWORD,
        confirmation: "DELETE",
      }, { cookie: victimCookie.get("cookie")! }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
    expect(data.deletedObjects).toBe(1);

    // The storage object is really gone.
    expect(existsSync(objectPath)).toBe(false);

    const hdb = await harnessDb();
    // User row gone; cascade removed characters/assets/consent/jobs/ledger.
    const [row] = await hdb.db
      .select()
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.id, victimId));
    expect(row).toBeUndefined();

    const chars = await hdb.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM characters WHERE user_id = ${victimId}`,
    );
    expect(Number(chars.rows[0].count)).toBe(0);

    const assets = await hdb.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM assets WHERE user_id = ${victimId}`,
    );
    expect(Number(assets.rows[0].count)).toBe(0);

    // The victim's report SURVIVES de-linked (reporter_id → NULL).
    const [survivor] = await hdb.db
      .select()
      .from(hdb.schema.reports)
      .where(eq(hdb.schema.reports.targetId, keeperCharacterId));
    expect(survivor).toBeDefined();
    expect(survivor.reporterId).toBeNull();
    expect(survivor.reason).toBe("IMPERSONATION");

    // The deletion itself is audited with the email preserved (the earlier
    // wrong-password attempt left a DENIED row — filter to the SUCCESS one).
    const [deletion] = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(
        sql`${hdb.schema.auditLog.action} = 'account.delete' AND ${hdb.schema.auditLog.targetId} = ${victimId} AND ${hdb.schema.auditLog.outcome} = 'SUCCESS'`,
      );
    expect(deletion).toBeDefined();
    expect(deletion.actorEmail).toBe("victim@p5.test");
    expect(deletion.actorId).toBeNull();

    // The old session cookie is dead: the session row was cascaded away.
    const dead = await charactersApi.GET(
      jsonRequest("/api/characters", "GET", undefined, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(dead.status).toBe(401);
  });

  it("retention sweep deletes old data but preserves consent evidence", async () => {
    const hdb = await harnessDb();

    // Backdate: an exporter asset + its consent, an ended live session,
    // a terminal job, a closed report, an old audit row.
    const jpeg = await realJpeg();
    const presign = await assetsPresignApi.POST(
      jsonRequest("/api/assets/presign", "POST", {
        kind: "FACE_IMAGE",
        mimeType: "image/jpeg",
        sizeBytes: jpeg.byteLength,
      }, { cookie: exporterCookie.get("cookie")! }),
    );
    const directive = await presign.json();
    const upload = await assetsUploadApi.PUT(
      new Request(`${BASE}${directive.uploadUrl}`, {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: jpeg as unknown as BodyInit,
      }),
    );
    const uploaded = (await upload.json()) as { asset: { id: string } };
    const oldAssetId = uploaded.asset.id;

    await consentApi.POST(
      jsonRequest("/api/consent", "POST", {
        assetId: oldAssetId,
        purpose: "face.transform.offline",
      }, { cookie: exporterCookie.get("cookie")! }),
    );

    await hdb.db.execute(sql`
      UPDATE assets SET created_at = now() - interval '400 days' WHERE id = ${oldAssetId}
    `);

    const oldSession = await hdb.db
      .insert(hdb.schema.liveSessions)
      .values({
        userId: exporterId,
        characterId: null,
        status: "COMPLETED",
        startedAt: new Date(Date.now() - 400 * 86_400_000),
        endedAt: new Date(Date.now() - 399 * 86_400_000),
      })
      .returning({ id: hdb.schema.liveSessions.id });

    await hdb.db.execute(sql`
      UPDATE live_sessions SET created_at = now() - interval '400 days' WHERE id = ${oldSession[0].id}
    `);

    const oldJob = await hdb.db
      .insert(hdb.schema.jobs)
      .values({
        userId: exporterId,
        type: "transform.image.colorgrade",
        status: "SUCCEEDED",
        completedAt: new Date(Date.now() - 400 * 86_400_000),
        idempotencyKey: "retention-test-job-1",
      })
      .returning({ id: hdb.schema.jobs.id });
    await hdb.db.execute(sql`
      UPDATE jobs SET created_at = now() - interval '400 days', updated_at = now() - interval '400 days' WHERE id = ${oldJob[0].id}
    `);

    const oldReport = await hdb.db
      .insert(hdb.schema.reports)
      .values({
        reporterId: exporterId,
        reason: "OTHER",
        targetType: "character",
        targetId: keeperCharacterId,
        status: "DISMISSED",
        decisionAction: "NONE",
        decisionNotes: "not actionable",
        decidedAt: new Date(),
      })
      .returning({ id: hdb.schema.reports.id });
    await hdb.db.execute(sql`
      UPDATE reports SET created_at = now() - interval '800 days', updated_at = now() - interval '800 days' WHERE id = ${oldReport[0].id}
    `);

    // Run the sweep with default-ish windows (all the above fall outside).
    const { retentionSweep } = await import("@/lib/privacy/retention");
    const result = await retentionSweep(db.getDb(), getStorage(), {
      policy: {
        assetsDays: 365,
        liveSessionsDays: 90,
        jobsDays: 180,
        reportsDays: 730,
        auditDays: 730,
      },
    });

    expect(result.deletedAssets).toBe(1);
    expect(result.deletedObjects).toBe(1);
    expect(result.deletedLiveSessions).toBe(1);
    expect(result.deletedJobs).toBeGreaterThanOrEqual(1);
    expect(result.deletedReports).toBe(1);

    // Asset row gone; its consent record SURVIVES de-linked.
    const [assetRow] = await hdb.db
      .select()
      .from(hdb.schema.assets)
      .where(eq(hdb.schema.assets.id, oldAssetId));
    expect(assetRow).toBeUndefined();

    const consents = await hdb.db
      .select()
      .from(hdb.schema.consentRecords)
      .where(
        sql`${hdb.schema.consentRecords.userId} = ${exporterId} AND ${hdb.schema.consentRecords.assetId} IS NULL`,
      );
    expect(consents.length).toBe(1);

    // Zero-day windows disable deletion entirely.
    const before = await hdb.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM jobs WHERE user_id = ${exporterId}`,
    );
    const noop = await retentionSweep(db.getDb(), getStorage(), {
      policy: {
        assetsDays: 0,
        liveSessionsDays: 0,
        jobsDays: 0,
        reportsDays: 0,
        auditDays: 0,
      },
    });
    expect(noop.deletedJobs).toBe(0);
    const after = await hdb.db.execute<{ count: string }>(
      sql`SELECT count(*) AS count FROM jobs WHERE user_id = ${exporterId}`,
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
