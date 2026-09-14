/**
 * P3 Trust-plane integration tests — abuse reports, moderation decisions with
 * enforcement, admin user management, and the auth-layer status gate.
 *
 * Harness contract (tests/p1-harness.ts): await ready() BEFORE importing any
 * app module so the db/auth singletons bind to this file's private database.
 */

import { describe, expect, it, afterAll } from "vitest";
import { ready, closeStack } from "./p1-harness";

await ready();

// App modules — imported only after the environment is pinned.
const reportsApi = await import("@/app/api/reports/route");
const modQueueApi = await import("@/app/api/moderation/reports/route");
const modDecisionApi = await import(
  "@/app/api/moderation/reports/[id]/decision/route"
);
const adminUsersApi = await import("@/app/api/admin/users/route");
const adminUserApi = await import("@/app/api/admin/users/[id]/route");
const adminStatusApi = await import("@/app/api/admin/users/[id]/status/route");
const adminRoleApi = await import("@/app/api/admin/users/[id]/role/route");
const charactersApi = await import("@/app/api/characters/route");

const { createAuth } = await import("@/lib/auth");
const { signInCookieHeaders } = await import("./helpers");
const db = await import("@/lib/db");
const { drizzle } = await import("drizzle-orm/pglite");
import { eq, inArray as inArray_ } from "drizzle-orm";

const BASE = "http://localhost:3000";

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

/** Direct DB access for status/role seeding and state assertions. */
async function harnessDb() {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  return { client, db: drizzle(client, { schema: schemaNS }), schema: schemaNS };
}

async function signUp(auth: ReturnType<typeof createAuth>, name: string, email: string) {
  await auth.api.signUpEmail({
    body: { name, email, password: "correct-horse-battery-staple" },
  });
}

async function userIdByEmail(email: string): Promise<string> {
  const { db: hdb, schema } = await harnessDb();
  const [row] = await hdb
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email));
  if (!row) throw new Error(`user ${email} not found`);
  return row.id;
}

describe("P3 trust plane — reports, moderation, admin users, auth gate", () => {
  let auth: ReturnType<typeof createAuth>;
  let reporterCookie: Headers;
  let victimCookie: Headers;
  let modCookie: Headers;
  let adminCookie: Headers;
  let superCookie: Headers;
  let victimId: string;
  let characterId: string;

  it("seeds five users across the role ladder", async () => {
    const { client } = await ready();
    const schemaNS = await import("@/lib/db/schema");
    auth = createAuth(drizzle(client, { schema: schemaNS }) as never);
    await signUp(auth, "Reporter", "reporter@p3.test");
    await signUp(auth, "Victim", "victim@p3.test");
    await signUp(auth, "Mod", "mod@p3.test");
    await signUp(auth, "Admin", "admin@p3.test");
    await signUp(auth, "Super", "super@p3.test");

    const hdb = await harnessDb();
    // Roles first (MFA not yet enabled — sign-in must not trigger the 2FA
    // challenge in this suite; the real enrollment round-trip is covered by
    // p3-mfa.test.ts).
    await hdb.db.update(hdb.schema.user).set({ role: "MODERATOR" }).where(eq(hdb.schema.user.email, "mod@p3.test"));
    await hdb.db.update(hdb.schema.user).set({ role: "ADMIN" }).where(eq(hdb.schema.user.email, "admin@p3.test"));
    await hdb.db.update(hdb.schema.user).set({ role: "SUPER_ADMIN" }).where(eq(hdb.schema.user.email, "super@p3.test"));

    // Cookies come through the singleton-compatible instance (same AUTH_SECRET).
    reporterCookie = await signInCookieHeaders(auth as never, "reporter@p3.test", "correct-horse-battery-staple");
    victimCookie = await signInCookieHeaders(auth as never, "victim@p3.test", "correct-horse-battery-staple");
    modCookie = await signInCookieHeaders(auth as never, "mod@p3.test", "correct-horse-battery-staple");
    adminCookie = await signInCookieHeaders(auth as never, "admin@p3.test", "correct-horse-battery-staple");
    superCookie = await signInCookieHeaders(auth as never, "super@p3.test", "correct-horse-battery-staple");

    // Now flip MFA on for the elevated roles (simulating completed TOTP
    // enrollments). Sessions signed in above stay valid — the MFA gate reads
    // the live user row at request time.
    await hdb.db
      .update(hdb.schema.user)
      .set({ twoFactorEnabled: true })
      .where(inArray_(hdb.schema.user.email, ["mod@p3.test", "admin@p3.test", "super@p3.test"]));

    victimId = await userIdByEmail("victim@p3.test");
  });

  it("victim creates a character (the report target)", async () => {
    const res = await charactersApi.POST(
      jsonRequest("/api/characters", "POST", { name: "BadCharacter" }, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    characterId = data.character.id as string;
  });

  // ── Report intake ────────────────────────────────────────────────────────

  it("rejects unauthenticated report creation", async () => {
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "HARASSMENT",
        targetType: "character",
        targetId: characterId,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("requires details for reason OTHER", async () => {
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "OTHER",
        targetType: "character",
        targetId: characterId,
      }, { cookie: reporterCookie.get("cookie")! }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("details_required");
  });

  it("rejects nonexistent targets", async () => {
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "HARASSMENT",
        targetType: "character",
        targetId: "00000000-0000-4000-8000-000000000000",
      }, { cookie: reporterCookie.get("cookie")! }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("target_not_found");
  });

  it("rejects self-reports", async () => {
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "IMPERSONATION",
        targetType: "user",
        targetId: await userIdByEmail("reporter@p3.test"),
      }, { cookie: reporterCookie.get("cookie")! }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("self_report");
  });

  it("creates a report on a character and audits it", async () => {
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "UNAUTHORIZED_LIKENESS",
        targetType: "character",
        targetId: characterId,
        details: "This character uses my photo without permission.",
      }, { cookie: reporterCookie.get("cookie")! }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();

    const hdb = await harnessDb();
    const [row] = await hdb.db
      .select()
      .from(hdb.schema.reports)
      .where(eq(hdb.schema.reports.id, data.report.id));
    expect(row.status).toBe("OPEN");
    expect(row.reason).toBe("UNAUTHORIZED_LIKENESS");
    // targetUserId denormalized at intake for enforcement
    expect(row.targetUserId).toBe(victimId);
    const [auditRow] = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.action, "moderation.report.create"));
    expect(auditRow).toBeTruthy();
  });

  // ── Queue permissions ───────────────────────────────────────────────────

  it("blocks plain users from the moderation queue", async () => {
    const res = await modQueueApi.GET(
      jsonRequest("/api/moderation/reports?status=OPEN", "GET", undefined, {
        cookie: reporterCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("shows the OPEN queue to moderators", async () => {
    const res = await modQueueApi.GET(
      jsonRequest("/api/moderation/reports?status=OPEN", "GET", undefined, {
        cookie: modCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.reports).toHaveLength(1);
    expect(data.reports[0].reason).toBe("UNAUTHORIZED_LIKENESS");
  });

  // ── Decisions and enforcement ────────────────────────────────────────────

  let reportId: string;

  it("finds the report id from the queue", async () => {
    const res = await modQueueApi.GET(
      jsonRequest("/api/moderation/reports?status=OPEN", "GET", undefined, {
        cookie: modCookie.get("cookie")!,
      }),
    );
    reportId = (await res.json()).reports[0].id as string;
  });

  it("blocks plain users from deciding reports", async () => {
    const res = await modDecisionApi.POST(
      jsonRequest(`/api/moderation/reports/${reportId}/decision`, "POST", {
        outcome: "DISMISSED",
        notes: "nope",
      }, { cookie: reporterCookie.get("cookie")! }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(res.status).toBe(403);
  });

  it("requires documentation for enforcement decisions", async () => {
    const res = await modDecisionApi.POST(
      jsonRequest(`/api/moderation/reports/${reportId}/decision`, "POST", {
        outcome: "RESOLVED",
        action: "BAN",
        notes: "",
      }, { cookie: modCookie.get("cookie")! }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("notes_required");
  });

  it("resolves with BAN: status flips, sessions revoked, audit written", async () => {
    // Victim must have an active session to prove revocation.
    const hdb = await harnessDb();
    const before = await hdb.db
      .select({ id: hdb.schema.session.id })
      .from(hdb.schema.session)
      .where(eq(hdb.schema.session.userId, victimId));
    expect(before.length).toBeGreaterThan(0);

    const res = await modDecisionApi.POST(
      jsonRequest(`/api/moderation/reports/${reportId}/decision`, "POST", {
        outcome: "RESOLVED",
        action: "BAN",
        notes: "Confirmed unauthorized likeness — permanent ban per policy.",
      }, { cookie: modCookie.get("cookie")! }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(res.status).toBe(200);

    const [victim] = await hdb.db
      .select({ status: hdb.schema.user.status })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.id, victimId));
    expect(victim.status).toBe("BANNED");

    const after = await hdb.db
      .select({ id: hdb.schema.session.id })
      .from(hdb.schema.session)
      .where(eq(hdb.schema.session.userId, victimId));
    expect(after).toHaveLength(0);

    const [report] = await hdb.db
      .select()
      .from(hdb.schema.reports)
      .where(eq(hdb.schema.reports.id, reportId));
    expect(report.status).toBe("RESOLVED");
    expect(report.decisionAction).toBe("BAN");
    expect(report.decisionNotes).toContain("permanent ban");

    const [banAudit] = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.action, "moderation.ban"));
    expect(banAudit.targetId).toBe(victimId);
  });

  it("banned users are locked out of the API (revoked cookie → 401)", async () => {
    const res = await charactersApi.GET(
      jsonRequest("/api/characters", "GET", undefined, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("banned users cannot sign back in (session gate)", async () => {
    const res = await auth.api.signInEmail({
      body: { email: "victim@p3.test", password: "correct-horse-battery-staple" },
      asResponse: true,
    });
    const pair = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="));
    expect(pair).toBeUndefined();

    const hdb = await harnessDb();
    const [denied] = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.action, "auth.sign_in.denied"));
    expect(denied.outcome).toBe("DENIED");
    expect(denied.metadata).toMatchObject({ status: "BANNED" });
  });

  it("refuses to decide an already-decided report", async () => {
    const res = await modDecisionApi.POST(
      jsonRequest(`/api/moderation/reports/${reportId}/decision`, "POST", {
        outcome: "DISMISSED",
        notes: "re-decide attempt",
      }, { cookie: modCookie.get("cookie")! }),
      { params: Promise.resolve({ id: reportId }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_decided");
  });

  it("dismisses a second report without enforcement", async () => {
    // Second report: reporter reports victim directly (user target).
    const res1 = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "SCAM",
        targetType: "user",
        targetId: victimId,
      }, { cookie: reporterCookie.get("cookie")! }),
    );
    expect(res1.status).toBe(201);
    const id2 = (await res1.json()).report.id as string;

    const res2 = await modDecisionApi.POST(
      jsonRequest(`/api/moderation/reports/${id2}/decision`, "POST", {
        outcome: "DISMISSED",
        notes: "Not enough evidence.",
      }, { cookie: modCookie.get("cookie")! }),
      { params: Promise.resolve({ id: id2 }) },
    );
    expect(res2.status).toBe(200);

    const hdb = await harnessDb();
    const [victim] = await hdb.db
      .select({ status: hdb.schema.user.status })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.id, victimId));
    expect(victim.status).toBe("BANNED"); // unchanged
  });

  // ── Admin user management ───────────────────────────────────────────────

  it("ADMIN can search users and inspect account state", async () => {
    const res = await adminUsersApi.GET(
      jsonRequest("/api/admin/users?q=victim", "GET", undefined, {
        cookie: adminCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(1);
    expect(data.users[0].email).toBe("victim@p3.test");
    expect(data.users[0]).not.toHaveProperty("password");

    const res2 = await adminUserApi.GET(
      jsonRequest(`/api/admin/users/${victimId}`, "GET", undefined, {
        cookie: adminCookie.get("cookie")!,
      }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res2.status).toBe(200);
    const detail = await res2.json();
    expect(detail.user.email).toBe("victim@p3.test");
    expect(detail.sessions).toEqual([]);
    expect(detail.usage.reportsAgainst).toBeGreaterThanOrEqual(1);
    expect(detail.usage.characters).toBe(1);
  });

  it("plain users and moderators cannot manage users", async () => {
    const res = await adminUsersApi.GET(
      jsonRequest("/api/admin/users", "GET", undefined, {
        cookie: modCookie.get("cookie")!,
      }),
    );
    // MODERATOR lacks both support:users:view and users:manage
    expect(res.status).toBe(403);

    const res2 = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "ACTIVE",
      }, { cookie: modCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res2.status).toBe(403);
  });

  it("only SUPER_ADMIN can unban a BANNED account", async () => {
    const res = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "ACTIVE",
        reason: "appeal accepted",
      }, { cookie: adminCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("transition_not_allowed");

    const res2 = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "ACTIVE",
        reason: "appeal accepted after review",
      }, { cookie: superCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res2.status).toBe(200);
    expect((await res2.json()).user.status).toBe("ACTIVE");
  });

  it("suspension revokes sessions (stale cookie → 401)", async () => {
    // Victim signs back in after the unban.
    victimCookie = await signInCookieHeaders(auth as never, "victim@p3.test", "correct-horse-battery-staple");

    const res = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "SUSPENDED",
        reason: "pending investigation",
      }, { cookie: adminCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res.status).toBe(200);

    const res2 = await charactersApi.GET(
      jsonRequest("/api/characters", "GET", undefined, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(res2.status).toBe(401);
  });

  it("rejects no-op and impossible transitions", async () => {
    const res = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "SUSPENDED",
      }, { cookie: adminCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_op");
  });

  it("restores the suspended account via ADMIN", async () => {
    const res = await adminStatusApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/status`, "POST", {
        status: "ACTIVE",
        reason: "investigation closed",
      }, { cookie: adminCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user.status).toBe("ACTIVE");
  });

  it("role management: SUPER_ADMIN only, never on self", async () => {
    const superId = await userIdByEmail("super@p3.test");

    const denied = await adminRoleApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/role`, "POST", {
        role: "MODERATOR",
      }, { cookie: adminCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(denied.status).toBe(403);

    const self = await adminRoleApi.POST(
      jsonRequest(`/api/admin/users/${superId}/role`, "POST", {
        role: "ADMIN",
      }, { cookie: superCookie.get("cookie")! }),
      { params: Promise.resolve({ id: superId }) },
    );
    expect(self.status).toBe(400);
    expect((await self.json()).error).toBe("self_role_change");

    const ok = await adminRoleApi.POST(
      jsonRequest(`/api/admin/users/${victimId}/role`, "POST", {
        role: "MODERATOR",
      }, { cookie: superCookie.get("cookie")! }),
      { params: Promise.resolve({ id: victimId }) },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.role).toBe("MODERATOR");

    // Role change revoked the victim's sessions — they must re-authenticate.
    const hdb = await harnessDb();
    const sessions = await hdb.db
      .select({ id: hdb.schema.session.id })
      .from(hdb.schema.session)
      .where(eq(hdb.schema.session.userId, victimId));
    expect(sessions).toHaveLength(0);

    const [roleAudit] = await hdb.db
      .select()
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.action, "admin.user.role_change"));
    expect(roleAudit.metadata).toMatchObject({ from: "USER", to: "MODERATOR" });
  });

  it("every admin status/role change left an audit row", async () => {
    const hdb = await harnessDb();
    const rows = await hdb.db
      .select({ action: hdb.schema.auditLog.action })
      .from(hdb.schema.auditLog)
      .where(eq(hdb.schema.auditLog.actorEmail, "admin@p3.test"));
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("admin.user.status.suspended");
    expect(actions).toContain("admin.user.status.active");
  });

  it("defense-in-depth: a valid session on a non-ACTIVE account is 403", async () => {
    // Simulate a status change that did not revoke sessions (legacy row or
    // future code path): a still-valid cookie MUST hit the status gate.
    // The victim is MODERATOR/ACTIVE by now, so flip SUSPENDED after sign-in.
    const hdb = await harnessDb();
    victimCookie = await signInCookieHeaders(auth as never, "victim@p3.test", "correct-horse-battery-staple");
    await hdb.db.update(hdb.schema.user).set({ status: "SUSPENDED" }).where(eq(hdb.schema.user.id, victimId));
    const res = await charactersApi.GET(
      jsonRequest("/api/characters", "GET", undefined, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("account_suspended");
    // cleanup: restore ACTIVE and drop the test session
    await hdb.db.update(hdb.schema.user).set({ status: "ACTIVE" }).where(eq(hdb.schema.user.id, victimId));
    await hdb.db.delete(hdb.schema.session).where(eq(hdb.schema.session.userId, victimId));
  });

  afterAll(async () => {
    await closeStack();
  });
});
