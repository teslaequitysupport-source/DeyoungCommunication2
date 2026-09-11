/**
 * Auth integration tests — real Better Auth flows against a fresh,
 * migrated, in-memory Postgres (PGlite). No mocks.
 *
 * P0 exit criterion: "Auth flows TESTED (integration)".
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestStack,
  signInCookieHeaders,
  type TestStack,
} from "./helpers";
import { account, auditLog, session, user } from "@/lib/db/schema";

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.client.close();
});

const EMAIL = "founder@test.local";
const PASSWORD = "correct-horse-battery";

describe("sign-up", () => {
  it("creates a user with the default role and status, and returns a session token", async () => {
    const result = await stack.auth.api.signUpEmail({
      body: { name: "Test Founder", email: EMAIL, password: PASSWORD },
    });

    expect(result.user.id).toBeTruthy();
    expect(result.user.email).toBe(EMAIL);
    expect(result.user.role).toBe("USER");
    expect(result.user.status).toBe("ACTIVE");
    expect(result.user.emailVerified).toBe(false);
    expect(typeof result.token).toBe("string");

    // Database truth: user + credential account + live session rows exist.
    const users = await stack.db.select().from(user).where(eq(user.email, EMAIL));
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("USER");

    const accounts = await stack.db
      .select()
      .from(account)
      .where(eq(account.userId, result.user.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe("credential");
    expect(accounts[0].password).toBeTruthy(); // hashed, never plaintext-comparable

    const sessions = await stack.db
      .select()
      .from(session)
      .where(eq(session.userId, result.user.id));
    expect(sessions).toHaveLength(1); // auto sign-in on sign-up
  });

  it("appends an auth.sign_up audit entry", async () => {
    const entries = await stack.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_up"));
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe("SUCCESS");
    expect(entries[0].actorEmail).toBe(EMAIL);
    expect(entries[0].actorRole).toBe("USER");
  });

  it("rejects duplicate email addresses", async () => {
    await expect(
      stack.auth.api.signUpEmail({
        body: { name: "Clone", email: EMAIL, password: PASSWORD },
      }),
    ).rejects.toMatchObject({
      body: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
    });
  });

  it("rejects passwords shorter than the minimum length", async () => {
    await expect(
      stack.auth.api.signUpEmail({
        body: { name: "Short", email: "short@test.local", password: "short" },
      }),
    ).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    });
  });
});

describe("sign-in", () => {
  it("returns a token and the user for correct credentials", async () => {
    const result = await stack.auth.api.signInEmail({
      body: { email: EMAIL, password: PASSWORD },
    });
    expect(result.user.email).toBe(EMAIL);
    expect(typeof result.token).toBe("string");
  });

  it("rejects a wrong password with INVALID_EMAIL_OR_PASSWORD", async () => {
    await expect(
      stack.auth.api.signInEmail({
        body: { email: EMAIL, password: "definitely-not-the-password" },
      }),
    ).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });

  it("rejects an unknown email", async () => {
    await expect(
      stack.auth.api.signInEmail({
        body: { email: "ghost@test.local", password: PASSWORD },
      }),
    ).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });

  it("appends an auth.sign_in audit entry per successful sign-in", async () => {
    const entries = await stack.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_in"));
    // sign-up auto sign-in (1) + explicit sign-in in the test above (1) = 2
    expect(entries.length).toBe(2);
  });
});

describe("session lifecycle", () => {
  it("resolves the session (with role) from the real session cookie", async () => {
    const headers = await signInCookieHeaders(stack.auth, EMAIL, PASSWORD);
    const result = await stack.auth.api.getSession({ headers });
    expect(result).not.toBeNull();
    expect(result?.user.email).toBe(EMAIL);
    expect(result?.user.role).toBe("USER");
    expect(result?.session).toBeTruthy();
  });

  it("returns null for an invalid session cookie", async () => {
    const result = await stack.auth.api.getSession({
      headers: new Headers({
        cookie: "better-auth.session_token=forged-token-value",
      }),
    });
    expect(result).toBeNull();
  });

  it("sign-out invalidates the session and appends an auth.sign_out audit entry", async () => {
    const headers = await signInCookieHeaders(stack.auth, EMAIL, PASSWORD);

    const before = await stack.auth.api.getSession({ headers });
    expect(before?.user.email).toBe(EMAIL);

    await stack.auth.api.signOut({ headers });

    const after = await stack.auth.api.getSession({ headers });
    expect(after).toBeNull();

    const signOuts = await stack.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_out"));
    expect(signOuts).toHaveLength(1);
    expect(signOuts[0].actorId).toBe(before?.user.id);
  });
});
