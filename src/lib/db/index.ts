/**
 * Database client — node-postgres against Postgres.
 *
 *   - Development (this sandbox): mini-service `pglite-db` exposes ONE
 *     embedded Postgres (PGlite) over the real PostgreSQL wire protocol on
 *     127.0.0.1:6543. The app connects as an ordinary postgres client.
 *   - Deployment: Neon Postgres. Same driver, same schema, same migrations.
 *
 * Why not in-process PGlite in the app: Next 16 Turbopack dev evaluates
 * each route's module graph in an isolated context (per-route globalThis,
 * process, and externalized-module copies), so no in-process singleton can
 * be shared — each route would spawn its own PGlite on the same data
 * directory and the racing boots abort. A single DB server with multiple
 * standard clients is the supported topology. (Integration tests still use
 * private in-memory PGlite instances directly — see tests/helpers.ts.)
 *
 * DATABASE_URL is required; the local-socket default is provided for the
 * sandbox. `bun run db:migrate` ensures the local service is running
 * before applying migrations.
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/** Local pglite-db socket service default (see mini-services/pglite-db). */
export const LOCAL_SOCKET_DATABASE_URL =
  "postgresql://127.0.0.1:6543/postgres";

/**
 * Resolve the effective Postgres URL. Any DATABASE_URL that is not a
 * postgres:// URL (e.g. a stale scaffold `file:` value exported by the
 * sandbox shell) falls back to the local socket service rather than
 * producing a silently-wrong connection target.
 */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (
    raw &&
    (raw.startsWith("postgres://") || raw.startsWith("postgresql://"))
  ) {
    return raw;
  }
  if (raw) {
    // Only warn when someone explicitly set a non-postgres value.
    console.warn(
      `[db] ignoring non-postgres DATABASE_URL (${raw.slice(0, 48)}) — using local pglite-db socket`,
    );
  }
  return LOCAL_SOCKET_DATABASE_URL;
}

/**
 * Derive node-postgres `ssl` options from the DATABASE_URL. node-postgres
 * ignores a `sslmode=` query parameter (that is a libpq feature), so URLs
 * like Railway's external `...?sslmode=require` would silently connect in
 * cleartext or fail. Internal URLs without sslmode stay plain — the common
 * Railway/Neon internal-network case.
 */
export function sslForUrl(url: string):
  | undefined
  | { rejectUnauthorized: false } {
  try {
    const parsed = new URL(url);
    const sslmode = parsed.searchParams.get("sslmode");
    if (sslmode && sslmode !== "disable") {
      // Managed providers (Railway / Neon) issue certificates that do not
      // match the hostname for internal routes; require encryption but do
      // not pin the CA — the documented setting for both providers.
      return { rejectUnauthorized: false };
    }
  } catch {
    // Not a parseable URL — let the driver handle it.
  }
  return undefined;
}

function createDb() {
  const url = resolveDatabaseUrl();
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: sslForUrl(url),
  });
  return drizzle(pool, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;

/**
 * Any Drizzle Postgres handle the platform code accepts: the app's
 * node-postgres instance (socket service / Neon) or a private in-memory
 * PGlite instance built directly by the integration tests. Same schema,
 * same SQL — only the driver transport differs.
 */
export type PlatformDatabase = AppDatabase | PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __platformDb?: AppDatabase;
};

/** App-wide singleton per module context. Pools are cheap and safe to share. */
export function getDb(): AppDatabase {
  if (!globalForDb.__platformDb) {
    globalForDb.__platformDb = createDb();
  }
  return globalForDb.__platformDb;
}

export { schema };
