/**
 * Ticketed server upload (local-dev storage): PUT /api/assets/upload?ticket=…
 *
 * Ticket (HMAC, short-lived, user-scoped) → declared-vs-actual size check
 * → magic-byte sniff (content is what it claims) → object written → asset
 * row created. Replaying the same ticket is idempotent (same asset id).
 */

import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { declaredMatchesSniffed, sniffMime, storageKeyFor, validateUploadDeclaration } from "@/lib/storage";
import { finalizeAssetUpload } from "@/lib/assets";
import { apiError, jsonResponse } from "@/lib/api-helpers";

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return apiError(400, "invalid_input", "ticket is required.");

  const storage = getStorage();
  if (storage.kind !== "local-dev") {
    return apiError(400, "wrong_mode", "This endpoint serves the local-dev storage mode only.");
  }

  const payload = storage.verifyTicket(ticket);
  if (!payload) {
    return apiError(403, "invalid_ticket", "Upload ticket invalid or expired.");
  }

  const validation = validateUploadDeclaration(payload.k, payload.m, payload.s);
  if (!validation.ok || !validation.extension) {
    return apiError(400, "invalid_input", "Ticket carries an invalid declaration.");
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== payload.s) {
    return apiError(
      400,
      "size_mismatch",
      `Declared ${payload.s} bytes but sent ${bytes.byteLength}.`,
    );
  }

  const sniffed = sniffMime(bytes);
  if (!sniffed || !declaredMatchesSniffed(payload.m, sniffed)) {
    return apiError(
      400,
      "magic_bytes_mismatch",
      "Content does not match the declared type.",
    );
  }

  const storageKey = storageKeyFor({
    userId: payload.u,
    assetId: payload.a,
    extension: validation.extension,
  });
  await storage.putObject(storageKey, bytes, payload.m);

  const asset = await finalizeAssetUpload(getDb(), {
    ticket: payload,
    storageKey,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });

  return jsonResponse({ asset });
}

export async function POST(request: Request) {
  return apiError(405, "method_not_allowed", "Use PUT with a ticket.");
}
