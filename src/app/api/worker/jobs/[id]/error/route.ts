/**
 * ERROR: structured failure. The queue decides requeue-vs-terminal using
 * the job type's retry budget (idempotency keys make retries safe).
 */

import { getDb } from "@/lib/db";
import { failJob } from "@/lib/jobs/queue";
import { authenticateWorker } from "@/lib/workers/registry";
import { apiError, jsonResponse, readJson, workerAuthFrom } from "@/lib/api-helpers";
import { z } from "zod";

const errorSchema = z.object({
  failureInfo: z.record(z.string(), z.unknown()),
  requeue: z.boolean().optional(),
});

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
  const parsed = errorSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "failureInfo is required.");
  }

  const job = await failJob(getDb(), {
    jobId: id,
    workerId: auth.worker.id,
    failureInfo: parsed.data.failureInfo,
    requeue: parsed.data.requeue,
  });
  if (!job) {
    return apiError(409, "conflict", "Job is not in a failable state for this worker.");
  }
  return jsonResponse({ job });
}
