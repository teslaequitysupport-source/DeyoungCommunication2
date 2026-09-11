/**
 * Apply Drizzle migrations from ./drizzle to the configured Postgres.
 *
 *   - DATABASE_URL → any Postgres (dev socket service or Neon).
 *   - If the target is the local pglite-db socket service and it is not
 *     running, this script starts it (detached) and waits for readiness,
 *     so `db:push` inside .zscripts/dev.sh always succeeds in-order.
 *
 * Usage: bun run scripts/db/migrate.ts
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { spawn } from "node:child_process";
import net from "node:net";
import { join } from "node:path";

const MIGRATIONS_FOLDER = join(process.cwd(), "drizzle");

/** Accept only postgres URLs; fall back to the local pglite-db socket. */
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (
    raw &&
    (raw.startsWith("postgres://") || raw.startsWith("postgresql://"))
  ) {
    return raw;
  }
  if (raw) {
    console.warn(
      `[migrate] ignoring non-postgres DATABASE_URL (${raw.slice(0, 48)}) — using local pglite-db socket`,
    );
  }
  return "postgresql://127.0.0.1:6543/postgres";
}

function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`pglite-db service did not become ready on ${host}:${port}`);
}

/** Start the local pglite-db service if we target it and it is down. */
async function ensureLocalService(url: URL): Promise<void> {
  const host = url.hostname;
  const port = Number(url.port || 5432);
  const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLocal) return; // external Postgres (e.g. Neon) — nothing to start
  if (await isPortOpen(host, port)) return;

  const serviceDir = join(process.cwd(), "mini-services", "pglite-db");
  console.log(`[migrate] starting pglite-db service for ${host}:${port}`);
  const child = spawn("bun", ["run", "start"], {
    cwd: serviceDir,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  await waitForPort(host, port, 30_000);
}

async function main() {
  const url = new URL(resolveDatabaseUrl());
  await ensureLocalService(url);

  const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log(`[migrate] migrations applied to ${url.hostname}:${url.port || 5432}`);
  await pool.end();
}

main().catch((error) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
