/**
 * pglite-db — the development Postgres server (mini service).
 *
 * ONE embedded Postgres (PGlite), file-persisted, exposed over the real
 * PostgreSQL wire protocol so the Next.js app connects through standard
 * node-postgres — the identical code path used for Neon in deployment.
 *
 * Why a service instead of in-process PGlite: Next 16 Turbopack dev
 * evaluates each route's module graph in an isolated context, so an
 * in-process singleton guard cannot be shared — the app would create one
 * PGlite per route on the same data directory and the racing boots abort
 * (RuntimeError: Aborted(), verified empirically). A single server process
 * with multiple standard clients is the supported topology.
 *
 * Data directory: <repo>/db/platform-dev (PGLITE_PATH overrides).
 * Port: 6543 (PGLITE_SOCKET_PORT overrides). If the port is already
 * serving, this process exits cleanly so duplicate starts are no-ops.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { join } from "node:path";
import net from "node:net";

const PORT = Number(process.env.PGLITE_SOCKET_PORT ?? 6543);
const HOST = "127.0.0.1";
const DATA_DIR =
  process.env.PGLITE_PATH ?? join(process.cwd(), "..", "..", "db", "platform-dev");

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

// Already running? Exit cleanly (dev.sh may start this service twice).
if (await isPortOpen(HOST, PORT)) {
  console.log(`[pglite-db] already running on ${HOST}:${PORT} — exiting duplicate`);
  process.exit(0);
}

const db = await PGlite.create(DATA_DIR);
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: HOST,
  // Multiple node-postgres pools connect concurrently; the server
  // multiplexes them onto PGlite's serialized query queue.
  maxConnections: 16,
});

server.addEventListener("error", (event) => {
  console.error("[pglite-db] server error:", (event as ErrorEvent).message);
});

try {
  await server.start();
} catch (error) {
  if (await isPortOpen(HOST, PORT)) {
    console.log(`[pglite-db] already running on ${HOST}:${PORT} — exiting duplicate`);
    process.exit(0);
  }
  console.error("[pglite-db] failed to start:", error);
  process.exit(1);
}

console.log(
  `[pglite-db] Postgres wire server listening on ${HOST}:${PORT} (data: ${DATA_DIR})`,
);

// Clean shutdown flushes the data directory — never rely on kill -9.
const shutdown = async (signal: string) => {
  console.log(`[pglite-db] ${signal} received — stopping and flushing`);
  try {
    await server.stop();
    await db.close();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
