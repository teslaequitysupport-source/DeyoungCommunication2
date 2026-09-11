/**
 * Worker output upload — a worker-authenticated way to persist job output
 * assets (spec §14): raw bytes + declared kind/mime, validated like every
 * other upload (magic bytes, size limits), stored, and owned by the job's
 * user. The worker holds no user credentials, ever.
 */

import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobs, liveSessions } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import {
  declaredMatchesSniffed,
  isAssetKind,
  sniffMime,
  storageKeyFor,
  validateUploadDeclaration,
} from "@/lib/storage";
import { finalizeAssetUpload } from "@/lib/assets";
import { authenticateWorker } from "@/lib/workers/registry";
import { apiError, jsonResponse, workerAuthFrom } from "@/lib/api-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { name, credential } = workerAuthFrom(request);
  const auth = await authenticateWorker(getDb(), name, credential);
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Worker authentication failed.");
  }

  const { id } = await params;
  const [job] = await getDb()
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, id),
        eq(jobs.workerId, auth.worker.id),
        inArray(jobs.status, ["RESERVED", "RUNNING"] as never[]),
      ),
    )
    .limit(1);
  if (!job) {
    return apiError(404, "not_found", "No such assigned job in a running state.");
  }

  const kindHeader = request.headers.get("x-asset-kind") ?? "RENDER_OUTPUT";
  const mimeType = request.headers.get("content-type") ?? "application/octet-stream";
  if (!isAssetKind(kindHeader)) {
    return apiError(400, "invalid_input", `Unknown asset kind "${kindHeader}".`);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  const validation = validateUploadDeclaration(kindHeader, mimeType, bytes.byteLength);
  if (!validation.ok || !validation.extension) {
    return apiError(400, validation.failure ?? "invalid_input", "Output rejected by validation rules.");
  }
  const sniffed = sniffMime(bytes);
  if (!sniffed || !declaredMatchesSniffed(mimeType, sniffed)) {
    return apiError(400, "magic_bytes_mismatch", "Output content does not match the declared type.");
  }

  // Bind render outputs to the session's character when one exists.
  let characterId: string | null = null;
  if (job.liveSessionId) {
    const [session] = await getDb()
      .select({ characterId: liveSessions.characterId })
      .from(liveSessions)
      .where(eq(liveSessions.id, job.liveSessionId))
      .limit(1);
    characterId = session?.characterId ?? null;
  }

  const assetId = randomUUID();
  const storageKey = storageKeyFor({
    userId: job.userId,
    assetId,
    extension: validation.extension,
  });
  const storage = getStorage();
  await storage.putObject(storageKey, bytes, mimeType);

  const asset = await finalizeAssetUpload(getDb(), {
    ticket: {
      a: assetId,
      u: job.userId,
      k: kindHeader as never,
      m: mimeType,
      s: bytes.byteLength,
      c: characterId,
      e: Date.now() + 60_000,
      mode: "server",
    },
    storageKey,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });

  return jsonResponse({ asset });
}
