/**
 * Asset upload presign — validates the upload declaration and returns the
 * upload directive (spec §14): a ticketed server PUT (local-dev storage)
 * or a presigned R2 PUT when R2 is configured. MIME + size are validated
 * before any URL is minted; magic bytes are checked at upload/confirm.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getStorage, isAssetKind, validateUploadDeclaration } from "@/lib/storage";
import {
  apiError,
  getApiUser,
  jsonResponse,
  rateLimited,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/rate-limits";
import { characterExistsForUser } from "@/lib/assets";
import { z } from "zod";

const presignSchema = z.object({
  kind: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  characterId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rate = await checkRateLimit(getDb(), "presign", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = presignSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "kind, mimeType and sizeBytes are required.");
  }
  const { kind, mimeType, sizeBytes, characterId } = parsed.data;

  if (!isAssetKind(kind)) {
    return apiError(400, "invalid_input", `Unknown asset kind "${kind}".`);
  }
  const validation = validateUploadDeclaration(kind, mimeType, sizeBytes);
  if (!validation.ok) {
    return apiError(400, validation.failure ?? "invalid_input", "Upload rejected by validation rules.");
  }

  if (characterId) {
    const owns = await characterExistsForUser(getDb(), characterId, user.id);
    if (!owns) return apiError(404, "not_found", "Character not found.");
  }

  const storage = getStorage();
  const assetId = randomUUID();
  const directive = await storage.createUploadTicket({
    assetId,
    userId: user.id,
    kind,
    mimeType,
    sizeBytes,
    characterId: characterId ?? null,
  });

  return jsonResponse({
    assetId,
    mode: directive.mode,
    uploadUrl: directive.uploadUrl,
    ticket: directive.ticket,
    expiresAt: directive.expiresAt,
    storage: storage.kind,
  });
}
