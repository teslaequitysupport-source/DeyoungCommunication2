/**
 * HMAC tickets — the local-dev equivalent of presigned URLs.
 *
 * A ticket binds: asset id, user, kind, declared MIME, declared size,
 * optional character binding, expiry. It is signed with
 * STORAGE_TICKET_SECRET (server-only) and verified constant-time. Tickets
 * are single-purpose upload authorizations, not session credentials.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TicketPayload } from "@/lib/storage/types";

function secret(): string {
  const value = process.env.STORAGE_TICKET_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "STORAGE_TICKET_SECRET must be set (>= 16 chars) — see .env.example",
    );
  }
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signTicket(payload: TicketPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyTicket(ticket: string): TicketPayload | null {
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
    ) as TicketPayload;
    if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
    if (payload.mode !== "server") return null;
    return payload;
  } catch {
    return null;
  }
}

/** Download tickets share the signing scheme with a distinct subject. */
export interface DownloadTicketPayload {
  k: string; // storage key
  u: string; // user id
  e: number; // expiry epoch ms
  d: "download";
}

export function signDownloadTicket(payload: DownloadTicketPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyDownloadTicket(
  ticket: string,
): DownloadTicketPayload | null {
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
    ) as DownloadTicketPayload;
    if (payload.d !== "download") return null;
    if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
