/**
 * P3c rate-limit tests — DB-backed fixed windows (spec §30: API abuse +
 * rate-limit bypass resistance) and the wired API surfaces.
 */

import { describe, expect, it, afterAll } from "vitest";
import { ready, closeStack } from "./p1-harness";

await ready();

const reportsApi = await import("@/app/api/reports/route");
const charactersApi = await import("@/app/api/characters/route");

const { createAuth } = await import("@/lib/auth");
const { signInCookieHeaders } = await import("./helpers");
const { checkRateLimit, RATE_LIMIT_POLICIES } = await import("@/lib/rate-limits");
const { drizzle } = await import("drizzle-orm/pglite");
const { eq } = await import("drizzle-orm");

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

async function harnessDb() {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  return { client, db: drizzle(client, { schema: schemaNS }), schema: schemaNS };
}

describe("P3c rate limits", () => {
  let auth: ReturnType<typeof createAuth>;
  let reporterCookie: Headers;
  let victimId: string;
  let characterId: string;

  it("seeds reporter + victim with a character", async () => {
    const { client } = await ready();
    const schemaNS = await import("@/lib/db/schema");
    auth = createAuth(drizzle(client, { schema: schemaNS }) as never);
    await auth.api.signUpEmail({
      body: { name: "Flooder", email: "flooder@p3.test", password: "correct-horse-battery-staple" },
    });
    await auth.api.signUpEmail({
      body: { name: "Target", email: "target@p3.test", password: "correct-horse-battery-staple" },
    });
    reporterCookie = await signInCookieHeaders(auth as never, "flooder@p3.test", "correct-horse-battery-staple");
    const victimCookie = await signInCookieHeaders(auth as never, "target@p3.test", "correct-horse-battery-staple");

    const hdb = await harnessDb();
    const [victim] = await hdb.db
      .select({ id: hdb.schema.user.id })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "target@p3.test"));
    victimId = victim.id;

    const res = await charactersApi.POST(
      jsonRequest("/api/characters", "POST", { name: "TargetChar" }, {
        cookie: victimCookie.get("cookie")!,
      }),
    );
    characterId = ((await res.json()).character.id) as string;
  });

  it("counts hits and blocks at the policy boundary", async () => {
    const hdb = await harnessDb();
    const { limit } = RATE_LIMIT_POLICIES.reports;

    for (let i = 1; i <= limit; i++) {
      const r = await checkRateLimit(hdb.db, "reports", "unit-user-1");
      expect(r.allowed).toBe(true);
      expect(r.count).toBe(i);
    }
    const denied = await checkRateLimit(hdb.db, "reports", "unit-user-1");
    expect(denied.allowed).toBe(false);
    expect(denied.count).toBe(limit + 1);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(RATE_LIMIT_POLICIES.reports.windowMs / 1000));
  });

  it("denied calls still count (boundary probing is not free)", async () => {
    const hdb = await harnessDb();
    const before = await checkRateLimit(hdb.db, "reports", "unit-user-2");
    const after = await checkRateLimit(hdb.db, "reports", "unit-user-2");
    expect(after.count).toBe(before.count + 1);
  });

  it("windows are independent per identity and reset over time", async () => {
    const hdb = await harnessDb();
    // Different identity: unaffected by unit-user-1's exhausted budget.
    const other = await checkRateLimit(hdb.db, "reports", "unit-user-3");
    expect(other.allowed).toBe(true);

    // Time-travel past the window: a fresh window starts.
    const now = new Date();
    const first = await checkRateLimit(hdb.db, "reports", "unit-user-4", now);
    expect(first.count).toBe(1);
    const later = await checkRateLimit(
      hdb.db,
      "reports",
      "unit-user-4",
      new Date(now.getTime() + RATE_LIMIT_POLICIES.reports.windowMs + 1000),
    );
    expect(later.count).toBe(1); // fresh window
    expect(later.allowed).toBe(true);
  });

  it("wired route: 429 with Retry-After after the 10th report; invalid payloads count too", async () => {
    const { limit } = RATE_LIMIT_POLICIES.reports;
    const cookie = reporterCookie.get("cookie")!;

    // Fill the budget with valid reports.
    for (let i = 0; i < limit - 2; i++) {
      const res = await reportsApi.POST(
        jsonRequest("/api/reports", "POST", {
          reason: "HARASSMENT",
          targetType: "character",
          targetId: characterId,
        }, { cookie }),
      );
      expect(res.status).toBe(201);
    }

    // Two more hits arrive as INVALID payloads — they must still count.
    for (let i = 0; i < 2; i++) {
      const res = await reportsApi.POST(
        jsonRequest("/api/reports", "POST", {
          reason: "NOT_A_REASON",
          targetType: "character",
          targetId: characterId,
        }, { cookie }),
      );
      expect(res.status).toBe(400);
    }

    // Budget exhausted: even a VALID report is now 429.
    const res = await reportsApi.POST(
      jsonRequest("/api/reports", "POST", {
        reason: "HARASSMENT",
        targetType: "character",
        targetId: characterId,
      }, { cookie }),
    );
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");

    // A different user is not affected (per-identity scoping).
    const hdb = await harnessDb();
    const scoped = await checkRateLimit(hdb.db, "reports", victimId);
    expect(scoped.allowed).toBe(true);
  });

  afterAll(async () => {
    await closeStack();
  });
});
