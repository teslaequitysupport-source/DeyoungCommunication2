/**
 * Session socket — the mobile side of the SAME media-relay protocol the
 * web client speaks (socket.io, ticket auth, binary frame events):
 *
 *   POST /api/realtime/ticket { sessionId } → { ticket }
 *   connect relay with auth { ticket }
 *   emit  "frame"  <binary JPEG>       (camera → worker)
 *   on    "frame"  <binary JPEG>       (worker → transformed preview)
 *   on    "session-state" { status }   (server-authoritative truth)
 *   on    "stats" { fps, latencyMs }   (real worker stats, never invented)
 *
 * Capture pacing is honest backpressure: while one frame is in flight the
 * capture loop skips — the effective frame rate is whatever the network +
 * worker actually sustain, surfaced in the UI.
 */

import { io, type Socket } from "socket.io-client";
import { api, relayUrl } from "./api";

export interface SessionStateEvent {
  sessionId?: string;
  status?: string;
  message?: string;
}

export interface WorkerStats {
  fps: number;
  latencyMs?: number;
}

export interface RelayEvents {
  onState: (event: SessionStateEvent) => void;
  onStats: (stats: WorkerStats) => void;
  onFrame: (jpeg: Uint8Array) => void;
  onConnectionChange: (connected: boolean) => void;
}

export class SessionSocket {
  private socket: Socket | null = null;

  async connect(sessionId: string, events: RelayEvents): Promise<void> {
    const ticketRes = await api<{ ticket: string }>("/api/realtime/ticket", {
      method: "POST",
      body: { sessionId },
    });
    if (ticketRes.status !== 200 || !ticketRes.data?.ticket) {
      throw new Error("Could not obtain a realtime ticket for this session.");
    }

    const socket = io(relayUrl(), {
      transports: ["websocket", "polling"],
      auth: { ticket: ticketRes.data.ticket },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });
    this.socket = socket;

    socket.on("connect", () => events.onConnectionChange(true));
    socket.on("disconnect", () => events.onConnectionChange(false));
    socket.on("connect_error", () => events.onConnectionChange(false));
    socket.on("session-state", (update: SessionStateEvent) =>
      events.onState(update),
    );
    socket.on("stats", (s: WorkerStats) => events.onStats(s));
    socket.on("frame", (frame: ArrayBuffer | Uint8Array) => {
      events.onFrame(
        frame instanceof Uint8Array ? frame : new Uint8Array(frame),
      );
    });
  }

  sendFrame(jpeg: Uint8Array): void {
    this.socket?.emit("frame", jpeg);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

/** ArrayBuffer → base64 without Buffer (React Native safe). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[b2 & 63] : "=";
  }
  return out;
}

export function jpegDataUri(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
}
