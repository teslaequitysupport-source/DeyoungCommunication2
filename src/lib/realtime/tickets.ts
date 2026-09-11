/**
 * Realtime tickets — short-lived HMAC authorizations for the media relay
 * (socket.io mini-service), mirroring the LiveKit token contract of the
 * approved architecture at the dev transport level.
 *
 *   publisher  : the session owner's browser (minted via /api/realtime/ticket)
 *   worker     : the worker that claimed the session's job (embedded in the
 *                ALLOCATE payload)
 *
 * The relay verifies the signature + expiry and joins the holder to exactly
 * one session room. Tickets are single-scope: they grant media-plane
 * membership, nothing else.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface RealtimeTicket {
  sid: string; // session id
  role: "publisher" | "worker";
  uid?: string; // user id (publisher)
  wid?: string; // worker id (worker)
  e: number; // expiry epoch ms
}

function secret(): string {
  const value = process.env.REALTIME_TICKET_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "REALTIME_TICKET_SECRET must be set (>= 16 chars) — see .env.example",
    );
  }
  return value;
}

export function mintRealtimeTicket(
  payload: Omit<RealtimeTicket, "e"> & { ttlSeconds?: number },
): string {
  const full: RealtimeTicket = {
    ...payload,
    e: Date.now() + (payload.ttlSeconds ?? 300) * 1000,
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyRealtimeTicket(ticket: string): RealtimeTicket | null {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");

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
