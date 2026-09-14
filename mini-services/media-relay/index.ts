/**
 * media-relay — the development media plane (socket.io).
 *
 * Role in the architecture (approved report Ch. 5/9): the production media
 * plane is LiveKit (WebRTC SFU). This sandbox cannot forward UDP media
 * through its single-port HTTP gateway, so live frames travel over a
 * WebSocket relay instead — a REAL transport doing REAL work (frames in,
 * transformed frames out), clearly labeled "dev transport" everywhere it
 * is surfaced. The browser and worker both authenticate with short-lived
 * HMAC tickets minted by the control plane (session-scoped), and session
 * state events are read from Postgres — the relay stores no state of its
 * own beyond room membership.
 *
 * Port: 3031. Browsers connect through the gateway (io('/?XTransformPort=3031'));
 * workers connect directly (http://127.0.0.1:3031).
 */

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { Server, type Socket } from "socket.io";

const PORT = 3031;
const DATABASE_URL =
  process.env.DATABASE_URL?.startsWith("postgres")
    ? process.env.DATABASE_URL
    : "postgresql://127.0.0.1:6543/postgres";

// ── Ticket verification (same scheme as src/lib/realtime/tickets.ts) ───────

interface RealtimeTicket {
  sid: string;
  role: "publisher" | "worker";
  uid?: string;
  wid?: string;
  e: number;
}

function verifyTicket(ticket: unknown): RealtimeTicket | null {
  if (typeof ticket !== "string") return null;
  const secret = process.env.REALTIME_TICKET_SECRET;
  if (!secret) {
    console.error("[media-relay] REALTIME_TICKET_SECRET is not set");
    return null;
  }
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as RealtimeTicket;
    if (payload.e < Date.now()) return null;
    if (payload.role !== "publisher" && payload.role !== "worker") return null;
    if (!payload.sid) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Server ────────────────────────────────────────────────────────────────

const httpServer = createServer((req, res) => {
  // Liveness endpoint (same-origin gateway probes).
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: io.sockets.adapter.rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: true, methods: ["GET", "POST"] },
  pingTimeout: 20_000,
  pingInterval: 10_000,
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB per frame guard
});

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

interface RoomState {
  lastStatus: string | null;
  lastJobStatus: string | null;
  workerHeartbeatAgeMs: number | null;
  timer: NodeJS.Timeout;
}

const rooms = new Map<string, RoomState>();

function roomFor(sid: string): string {
  return `session:${sid}`;
}

io.on("connection", (socket: Socket) => {
  const ticket = verifyTicket(socket.handshake.auth?.ticket);
  if (!ticket) {
    console.warn(`[media-relay] rejected connection (bad/expired ticket) sid=${socket.id}`);
    socket.disconnect(true);
    return;
  }
  const room = roomFor(ticket.sid);
  socket.data.role = ticket.role;
  socket.data.sid = ticket.sid;
  socket.join(room);

  console.log(`[media-relay] ${ticket.role} joined ${room}`);

  if (!rooms.has(ticket.sid)) {
    startRoomPolling(ticket.sid);
  }

  if (ticket.role === "publisher") {
    io.to(room).emit("publisher-joined");

    socket.on("frame", (frame: Buffer) => {
      // Route to workers in the room only.
      io.to(room).emit("frame", frame);
    });
  } else {
    socket.on("frame", (frame: Buffer) => {
      // Route to publishers in the room only.
      io.to(room).emit("frame", frame);
    });
    socket.on("stats", (stats: unknown) => {
      io.to(room).emit("stats", stats);
    });
  }

  socket.on("disconnect", () => {
    console.log(`[media-relay] ${ticket.role} left ${room}`);
    const siblings = [...io.sockets.adapter.rooms.get(room) ?? []];
    const publishersLeft = !siblings.some((id) => {
      const s = io.sockets.sockets.get(id);
      return s?.data.role === "publisher";
    });
    const workersLeft = !siblings.some((id) => {
      const s = io.sockets.sockets.get(id);
      return s?.data.role === "worker";
    });
    if (ticket.role === "publisher" && publishersLeft) {
      io.to(room).emit("publisher-left");
    }
    if (workersLeft) {
      stopRoomPollingIfEmpty(ticket.sid);
    }
  });
});

function startRoomPolling(sid: string): void {
  const state: RoomState = {
    lastStatus: null,
    lastJobStatus: null,
    workerHeartbeatAgeMs: null,
    timer: setInterval(async () => {
      try {
        const res = await pool.query<{
          status: string;
          job_status: string | null;
          heartbeat_age_ms: number | null;
        }>(
          `SELECT s.status::text AS status,
                  j.status::text AS job_status,
                  CASE WHEN w.last_heartbeat_at IS NULL THEN NULL
                       ELSE (extract(epoch from (now() - w.last_heartbeat_at)) * 1000)::int END AS heartbeat_age_ms
             FROM live_sessions s
             LEFT JOIN LATERAL (
               SELECT status FROM jobs
                WHERE live_session_id = s.id
                ORDER BY created_at DESC LIMIT 1
             ) j ON true
             LEFT JOIN workers w ON w.id = s.worker_id
            WHERE s.id = $1`,
          [sid],
        );
        const row = res.rows[0];
        if (!row) {
          io.to(roomFor(sid)).emit("session-state", { status: "GONE" });
          stopRoomPollingIfEmpty(sid);
          return;
        }
        // Coarse heartbeat bucket: exact ms would re-emit every poll.
        const heartbeatBucket =
          row.heartbeat_age_ms === null ? null : row.heartbeat_age_ms > 5_000 ? 1 : 0;
        const changed =
          row.status !== state.lastStatus ||
          row.job_status !== state.lastJobStatus ||
          heartbeatBucket !== state.workerHeartbeatAgeMs;
        if (changed) {
          state.lastStatus = row.status;
          state.lastJobStatus = row.job_status;
          state.workerHeartbeatAgeMs = heartbeatBucket;
          io.to(roomFor(sid)).emit("session-state", {
            status: row.status,
            jobStatus: row.job_status,
            workerHeartbeatAgeMs: row.heartbeat_age_ms,
          });
        }
      } catch (error) {
        console.error(`[media-relay] poll failed for ${sid}: ${String(error)}`);
      }
    }, 1000),
  };
  rooms.set(sid, state);
}

function stopRoomPollingIfEmpty(sid: string): void {
  const room = io.sockets.adapter.rooms.get(roomFor(sid));
  if (!room || room.size === 0) {
    const state = rooms.get(sid);
    if (state) {
      clearInterval(state.timer);
      rooms.delete(sid);
    }
  }
}

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[media-relay] listening on 127.0.0.1:${PORT} (path /)`);
  console.log(`[media-relay] database: ${DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);
});

const shutdown = () => {
  console.log("[media-relay] shutting down");
  for (const state of rooms.values()) clearInterval(state.timer);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
