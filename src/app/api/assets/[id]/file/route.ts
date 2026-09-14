/**
 * Asset file serving — two authorized reader classes:
 *   1. the owner (session cookie): any of their own assets;
 *   2. an authenticated worker: only assets referenced by a job currently
 *      assigned to it (inputRefs/outputRefs) — BOLA-safe by construction.
 * Nothing is public; no permanent URLs.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, jobs } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import {
  apiError,
  getApiUser,
  workerAuthFrom,
} from "@/lib/api-helpers";
import { authenticateWorker } from "@/lib/workers/registry";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);

  const user = await getApiUser(request);
  if (user) {
    const [asset] = await getDb()
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.userId, user.id)))
      .limit(1);
    if (!asset) return apiError(404, "not_found", "Asset not found.");
    return serveAsset(asset.storageKey, asset.mimeType, url.searchParams.get("download") === "1");
  }

  // Worker path.
  const { name, credential } = workerAuthFrom(request);
  const authResult = await authenticateWorker(getDb(), name, credential);
  if (!authResult.ok) {
    return apiError(401, "unauthorized", "Worker authentication failed.");
  }

  const assetIdRef = `asset:${id}`;
  const assigned = await getDb()
    .select({ inputRefs: jobs.inputRefs })
    .from(jobs)
    .where(
      and(
        eq(jobs.workerId, authResult.worker.id),
        inArray(jobs.status, ["RESERVED", "RUNNING"] as never[]),
      ),
    );
  const referenced = assigned.some((job) =>
    Object.values(job.inputRefs ?? {}).some((v) => v === assetIdRef || v === id),
  );
  if (!referenced) {
    return apiError(403, "forbidden", "Asset is not part of this worker's assigned job.");
  }

  const [asset] = await getDb()
    .select()
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1);
  if (!asset) return apiError(404, "not_found", "Asset not found.");
  return serveAsset(asset.storageKey, asset.mimeType, url.searchParams.get("download") === "1");
}

function serveAsset(key: string, mime: string, asDownload: boolean): Response {
  // Streaming from the storage adapter inside the Response body callback.
  const storage = getStorage();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const bytes = await storage.getObject(key);
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": mime,
      "cache-control": "private, max-age=60",
      ...(asDownload ? { "content-disposition": "attachment" } : {}),
    },
  });
}
