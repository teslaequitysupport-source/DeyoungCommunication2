/**
 * RESULT: the worker reports completion — result refs, usage, cost where
 * the provider reports it. Live sessions complete their STOPPING state.
 */

import { getDb } from "@/lib/db";
import { completeJob } from "@/lib/jobs/queue";
import { authenticateWorker } from "@/lib/workers/registry";
import { apiError, jsonResponse, readJson, workerAuthFrom } from "@/lib/api-helpers";
import { z } from "zod";

const resultSchema = z.object({
  result: z.record(z.string(), z.unknown()).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  costUsd: z.string().optional(),
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
  const parsed = resultSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Invalid RESULT payload.");
  }

  const job = await completeJob(getDb(), {
    jobId: id,
    workerId: auth.worker.id,
    result: parsed.data.result,
    usage: parsed.data.usage,
    costUsd: parsed.data.costUsd,
  });
  if (!job) {
    return apiError(409, "conflict", "Job is not in a completable state for this worker.");
  }
  return jsonResponse({ job });
}
