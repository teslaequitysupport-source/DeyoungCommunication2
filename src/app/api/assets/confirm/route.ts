/**
 * Direct-upload confirm (R2 mode): after the browser PUT its bytes to the
 * presigned R2 URL, this endpoint verifies the object really exists with
 * the declared size and magic bytes, then creates the asset row. No byte
 * travels through the app — only the first 16 for validation.
 */

import { getDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { declaredMatchesSniffed, sniffMime, storageKeyFor, validateUploadDeclaration } from "@/lib/storage";
import { finalizeAssetUpload } from "@/lib/assets";
import { apiError, getApiUser, jsonResponse, readJson, requireUser } from "@/lib/api-helpers";
import { z } from "zod";

const confirmSchema = z.object({ ticket: z.string().min(1) });

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const parsed = confirmSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "ticket is required.");
  }

  const storage = getStorage();
  if (storage.kind !== "r2") {
    return apiError(400, "wrong_mode", "This endpoint serves the R2 storage mode only.");
  }

  const payload = storage.verifyTicket(parsed.data.ticket);
  if (!payload || payload.u !== user.id) {
    return apiError(403, "invalid_ticket", "Upload ticket invalid or expired.");
  }

  const validation = validateUploadDeclaration(payload.k, payload.m, payload.s);
  if (!validation.ok || !validation.extension) {
    return apiError(400, "invalid_input", "Ticket carries an invalid declaration.");
  }

  const storageKey = storageKeyFor({
    userId: payload.u,
    assetId: payload.a,
    extension: validation.extension,
  });

  const head = await storage.headObject(storageKey);
  if (!head || head.size !== payload.s) {
    return apiError(
      400,
      "object_missing",
      "The uploaded object was not found or its size does not match the declaration.",
    );
  }

  const peek = await storage.peekObject(storageKey, 16);
  const sniffed = peek ? sniffMime(peek) : null;
  if (!sniffed || !declaredMatchesSniffed(payload.m, sniffed)) {
    return apiError(
      400,
      "magic_bytes_mismatch",
      "Object content does not match the declared type.",
    );
  }

  const asset = await finalizeAssetUpload(getDb(), {
    ticket: payload,
    storageKey,
    sha256: null, // R2 ETag is not sha256; hashing would require streaming the object
  });
  return jsonResponse({ asset });
}
