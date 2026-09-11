/**
 * Shared test harness: fresh in-memory Postgres (PGlite) per suite,
 * migrated from the committed Drizzle migrations, with a bound auth instance.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { join } from "node:path";
import * as schema from "@/lib/db/schema";
import { createAuth } from "@/lib/auth";
import type { PlatformDatabase } from "@/lib/db";

export interface TestStack {
  client: PGlite;
  db: PlatformDatabase;
  auth: ReturnType<typeof createAuth>;
}

export async function createTestStack(): Promise<TestStack> {
  const client = new PGlite(); // in-memory — isolated per stack
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  const auth = createAuth(db);
  return { client, db, auth };
}

export interface TestAuth {
  api: {
    signInEmail: (args: {
      body: { email: string; password: string };
      asResponse: true;
    }) => Promise<Response>;
  };
}

/**
 * Sign in and return the exact Cookie header a real browser would send.
 *
 * Better Auth signs the session cookie: the value is "<token>.<signature>",
 * and getSession verifies the signature — so tests must echo the real
 * Set-Cookie pair rather than the parsed `token` field.
 */
export async function signInCookieHeaders(
  auth: TestAuth,
  email: string,
  password: string,
): Promise<Headers> {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const pair = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.split(";")[0];
  if (!pair) throw new Error("sign-in did not set a session cookie");
  return new Headers({ cookie: pair });
}
