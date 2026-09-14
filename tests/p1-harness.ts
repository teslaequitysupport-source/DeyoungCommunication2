/**
 * P1 test harness — an isolated Postgres (PGlite over a real wire-protocol
 * socket) so that API ROUTE HANDLERS can be invoked directly with real
 * Request objects while sharing one private database.
 *
 * Usage contract (important — read before editing):
 *   1. Only import THIS module statically in a test file.
 *   2. `await ready()` (top-level await) BEFORE dynamically importing ANY
 *      app module: the environment must be pinned first, or singletons
 *      (db pool, auth) bind to the wrong database.
 *   3. Register `afterAll(closeStack)` so the socket server does not keep
 *      the vitest fork alive (a leaked server blocks the port for the
 *      next file).
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const PORT_CANDIDATES = [6599, 6598, 6597, 6596, 6595];

function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(400, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export interface P1Stack {
  client: PGlite;
  databaseUrl: string;
  storageRoot: string;
  server: PGLiteSocketServer;
  close(): Promise<void>;
}

async function boot(): Promise<P1Stack> {
  const port =
    PORT_CANDIDATES.find(async (p) => !(await isPortOpen("127.0.0.1", p))) ??
    PORT_CANDIDATES[PORT_CANDIDATES.length - 1];
  if (await isPortOpen("127.0.0.1", port)) {
    throw new Error("all harness ports are busy (zombie test processes?)");
  }

  const client = new PGlite(); // in-memory
  await migrate(drizzle(client), {
    migrationsFolder: join(process.cwd(), "drizzle"),
  });

  const server = new PGLiteSocketServer({
    db: client,
    port,
    host: "127.0.0.1",
    maxConnections: 16,
  });
  await server.start();

  const storageRoot = mkdtempSync(join(tmpdir(), "p1-object-store-"));

  // A reused vitest fork can carry a stale app pool in globalThis (bound to
  // the dev socket at :6543 by an earlier file). Drop it so this file's
  // freshly imported modules build their pool against OUR database.
  delete (globalThis as { __platformDb?: unknown }).__platformDb;

  process.env.DATABASE_URL = `postgresql://127.0.0.1:${port}/postgres`;
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "p1-test-auth-secret-0123456789ab";
  process.env.STORAGE_TICKET_SECRET =
    process.env.STORAGE_TICKET_SECRET ?? "p1-test-storage-secret-0123456789ab";
  process.env.REALTIME_TICKET_SECRET =
    process.env.REALTIME_TICKET_SECRET ?? "p1-test-realtime-secret-0123456789ab";
  process.env.STORAGE_LOCAL_ROOT = storageRoot;

  return {
    client,
    databaseUrl: process.env.DATABASE_URL,
    storageRoot,
    server,
    async close() {
      // Drop the app pool first so no query races the server shutdown.
      const globalForDb = globalThis as {
        __platformDb?: unknown;
      };
      const pool = globalForDb.__platformDb as
        | { $client?: { end?: () => Promise<void> } }
        | undefined;
      delete globalForDb.__platformDb;
      try {
        await pool?.$client?.end?.();
      } catch {
        // pool already gone
      }
      await server.stop();
      await client.close();
      rmSync(storageRoot, { recursive: true, force: true });
    },
  };
}

let stackPromise: Promise<P1Stack> | null = null;

/** Shared per test file (vitest runs each file in its own fork). */
export function ready(): Promise<P1Stack> {
  if (!stackPromise) stackPromise = boot();
  return stackPromise;
}

/** Idempotent shutdown for afterAll registration. */
export async function closeStack(): Promise<void> {
  if (!stackPromise) return;
  const stack = await stackPromise;
  await stack.close();
  stackPromise = null;
}
