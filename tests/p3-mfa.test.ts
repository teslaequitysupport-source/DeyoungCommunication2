/**
 * P3b MFA tests — Better Auth twoFactor plugin (TOTP) + the requireMfa gate
 * on elevated surfaces (spec §26/§28).
 *
 * The full enrollment round-trip uses the plugin's own endpoints
 * (enableTwoFactor → generateTOTP → verifyTOTP), so the codes are real.
 */

import { describe, expect, it, afterAll } from "vitest";
import { ready, closeStack } from "./p1-harness";

await ready();

const adminUsersApi = await import("@/app/api/admin/users/route");
const { createAuth } = await import("@/lib/auth");
const { signInCookieHeaders } = await import("./helpers");
const { base32 } = await import("@better-auth/utils/base32");
const { drizzle } = await import("drizzle-orm/pglite");
const { eq } = await import("drizzle-orm");

const BASE = "http://localhost:3000";
const PASSWORD = "correct-horse-battery-staple";

function jsonGet(path: string, cookie: string): Request {
  return new Request(`${BASE}${path}`, {
    method: "GET",
    headers: { cookie },
  });
}

async function harnessDb() {
  const { client } = await ready();
  const schemaNS = await import("@/lib/db/schema");
  return { client, db: drizzle(client, { schema: schemaNS }), schema: schemaNS };
}

/**
 * Parse the secret out of an otpauth:// URI and base32-DECODE it.
 *
 * The plugin puts base32.encode(rawSecret) into the URI (authenticator-app
 * convention), while auth.api.generateTOTP expects the RAW secret — the same
 * transformation any authenticator app performs on scan.
 */
function secretFromUri(uri: string): string {
  const match = /[?&]secret=([^&]+)/.exec(uri);
  if (!match) throw new Error(`no secret in totpURI: ${uri}`);
  const decoded = base32.decode(decodeURIComponent(match[1]));
  return new TextDecoder().decode(decoded);
}

describe("P3b MFA — TOTP enrollment + requireMfa gate", () => {
  let auth: ReturnType<typeof createAuth>;
  let noMfaAdminCookie: Headers;
  let supportCookie: Headers;
  let noMfaAdminId: string;

  it("seeds an ADMIN without MFA and a SUPPORT user", async () => {
    const { client } = await ready();
    const schemaNS = await import("@/lib/db/schema");
    auth = createAuth(drizzle(client, { schema: schemaNS }) as never);
    await auth.api.signUpEmail({
      body: { name: "NoMfa Admin", email: "nomfa@p3.test", password: PASSWORD },
    });
    await auth.api.signUpEmail({
      body: { name: "Supporter", email: "support@p3.test", password: PASSWORD },
    });
    await auth.api.signUpEmail({
      body: { name: "Mfa Admin", email: "mfa@p3.test", password: PASSWORD },
    });

    const hdb = await harnessDb();
    await hdb.db.update(hdb.schema.user).set({ role: "ADMIN" }).where(eq(hdb.schema.user.email, "nomfa@p3.test"));
    await hdb.db.update(hdb.schema.user).set({ role: "SUPPORT" }).where(eq(hdb.schema.user.email, "support@p3.test"));
    await hdb.db.update(hdb.schema.user).set({ role: "ADMIN" }).where(eq(hdb.schema.user.email, "mfa@p3.test"));
    const [row] = await hdb.db
      .select({ id: hdb.schema.user.id })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "nomfa@p3.test"));
    noMfaAdminId = row.id;

    noMfaAdminCookie = await signInCookieHeaders(auth as never, "nomfa@p3.test", PASSWORD);
    supportCookie = await signInCookieHeaders(auth as never, "support@p3.test", PASSWORD);
  });

  it("blocks elevated roles without verified MFA (mfa_required)", async () => {
    const res = await adminUsersApi.GET(
      jsonGet("/api/admin/users", noMfaAdminCookie.get("cookie")!),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("mfa_required");
  });

  it("read-only SUPPORT passes without MFA", async () => {
    const res = await adminUsersApi.GET(
      jsonGet("/api/admin/users", supportCookie.get("cookie")!),
    );
    expect(res.status).toBe(200);
  });

  it("full TOTP enrollment + 2FA sign-in unlocks admin surfaces", async () => {
    let cookie = (await signInCookieHeaders(auth as never, "mfa@p3.test", PASSWORD)).get("cookie")!;

    // 1. enableTwoFactor → secret via totpURI (session is rotated here).
    const enable = await auth.api.enableTwoFactor({
      headers: new Headers({ cookie }),
      body: { password: PASSWORD, method: "totp" },
    });
    if (enable.method !== "totp" || !enable.totpURI) {
      throw new Error("enableTwoFactor did not return a TOTP enrollment");
    }
    const secret = secretFromUri(enable.totpURI);
    expect(secret.length).toBeGreaterThan(10);

    // 2. A real code for this secret, straight from the plugin.
    const { code } = await auth.api.generateTOTP({ body: { secret } });
    expect(code).toMatch(/^\d{6}$/);

    // 3. enableTwoFactor rotated the session — sign in fresh, then verify
    //    the enrollment (this is the “prove you saved the secret” step).
    cookie = (await signInCookieHeaders(auth as never, "mfa@p3.test", PASSWORD)).get("cookie")!;
    const verify = await auth.api.verifyTOTP({
      headers: new Headers({ cookie }),
      body: { code },
    });
    expect(verify).toBeTruthy();

    // 4. twoFactorEnabled persisted on the user row.
    const hdb = await harnessDb();
    const [row] = await hdb.db
      .select({ enabled: hdb.schema.user.twoFactorEnabled })
      .from(hdb.schema.user)
      .where(eq(hdb.schema.user.email, "mfa@p3.test"));
    expect(row.enabled).toBe(true);

    // 5. From now on sign-in REQUIRES the challenge: signInEmail deletes the
    //    session, sets a signed two_factor cookie, and returns a redirect.
    const signInRes = await auth.api.signInEmail({
      body: { email: "mfa@p3.test", password: PASSWORD },
      asResponse: true,
    });
    const signInBody = (await signInRes.clone().json()) as {
      twoFactorRedirect?: boolean;
      twoFactorMethods?: string[];
    };
    expect(signInBody.twoFactorRedirect).toBe(true);
    expect(signInBody.twoFactorMethods).toContain("totp");
    const twoFactorCookie = signInRes.headers
      .getSetCookie()
      .find((c) => c.includes("two_factor="))
      ?.split(";")[0];
    expect(twoFactorCookie).toBeTruthy();

    // 6. A wrong code during the challenge is rejected — then the right one
    //    completes the sign-in (attempt budget allows the retry).
    await expect(
      auth.api.verifyTOTP({
        headers: new Headers({ cookie: twoFactorCookie! }),
        body: { code: "000000" },
      }),
    ).rejects.toThrow();

    const { code: freshCode } = await auth.api.generateTOTP({ body: { secret } });
    const verifyRes = await auth.api.verifyTOTP({
      headers: new Headers({ cookie: twoFactorCookie! }),
      body: { code: freshCode },
      asResponse: true,
    });
    const sessionPair = verifyRes.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="))
      ?.split(";")[0];
    expect(sessionPair).toBeTruthy();

    // 7. The fully authenticated session clears the MFA gate.
    const res = await adminUsersApi.GET(jsonGet("/api/admin/users", sessionPair!));
    expect(res.status).toBe(200);
    const users = (await res.json()) as { users: unknown[] };
    expect(Array.isArray(users.users)).toBe(true);
  });

  it("audit + user rows stay consistent after enrollment", async () => {
    const hdb = await harnessDb();
    const [tf] = await hdb.db
      .select()
      .from(hdb.schema.twoFactor)
      .where(eq(hdb.schema.twoFactor.userId, noMfaAdminId));
    // The no-MFA admin never enrolled: no row.
    expect(tf).toBeUndefined();
  });

  afterAll(async () => {
    await closeStack();
  });
});
