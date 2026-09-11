/**
 * Storage plane — metadata in Postgres, objects in object storage
 * (report Ch. 10; spec §14).
 *
 * Two adapters behind ONE interface:
 *   - `local-dev`: this repository's development object store on the local
 *     filesystem. Browser uploads go through a PUT endpoint authenticated
 *     by a short-lived HMAC ticket — the same presigned-URL *contract* as
 *     R2, so the client flow is identical.
 *   - `r2`: Cloudflare R2 with SigV4 presigned PUT/GET URLs. Activated by
 *     the R2_* environment block. IMPLEMENTED but REQUIRES EXTERNAL
 *     CREDENTIAL to exercise — status honestly reported, never faked.
 */

import type { AssetKind } from "@/lib/storage/kinds";

export interface UploadTicketInput {
  assetId: string;
  userId: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  characterId?: string | null;
  ttlSeconds?: number;
}

/** What a client needs to perform the upload. */
export interface UploadDirective {
  mode: "server" | "direct";
  /** `server`: same-origin path with the ticket query param. */
  uploadUrl: string;
  /** `direct`: headers the client must send with the presigned PUT. */
  headers?: Record<string, string>;
  ticket: string;
  expiresAt: string;
}

export interface TicketPayload {
  a: string; // assetId
  u: string; // userId
  k: AssetKind;
  m: string; // mimeType
  s: number; // sizeBytes
  c: string | null; // characterId
  e: number; // expiry epoch ms
  mode: "server" | "direct";
}

/** Server-chosen storage root (local-dev) or null in R2 mode. */
export const STORAGE_UPLOAD_LIMIT_BYTES = 200 * 1024 * 1024;

export interface StorageAdapter {
  readonly kind: "local-dev" | "r2";
  /** Mint the upload directive for a client. */
  createUploadTicket(input: UploadTicketInput): Promise<UploadDirective>;
  /** Verify a ticket string (local-dev only; R2 trusts SigV4 itself). */
  verifyTicket(ticket: string): TicketPayload | null;
  /** Server-side object read (local FS or R2 GET). */
  getObject(key: string): Promise<Uint8Array>;
  /** First N bytes — magic-byte validation for direct (R2) uploads. */
  peekObject(key: string, bytes: number): Promise<Uint8Array | null>;
  /** Server-side object stat. */
  headObject(key: string): Promise<{ size: number } | null>;
  /** Server-side object write (worker results). */
  putObject(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
}
