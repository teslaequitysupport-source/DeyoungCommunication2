/**
 * HEARTBEAT: liveness + load. The response carries control-plane commands
 * the worker must honor (e.g. DRAIN requested) so administrative actions
 * reach running workers without another channel.
 */

import { getDb } from "@/lib/db";
import { workerHeartbeat } from "@/lib/workers/registry";
import { apiError, jsonResponse, readJson, workerAuthFrom } from "@/lib/api-helpers";
import { authenticateWorker } from "@/lib/workers/registry";
import { z } from "zod";

const heartbeatSchema = z.object({
  activeJobs: z.number().int().min(0).max(1000),
  heartbeatLatencyMs: z.number().int().min(0).max(60000).nullish(),
});

export async function POST(request: Request) {
  const { name, credential } = workerAuthFrom(request);
  const auth = await authenticateWorker(getDb(), name, credential);
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Worker authentication failed.");
  }

  const parsed = heartbeatSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "activeJobs is required.");
  }

  await workerHeartbeat(getDb(), {
    workerId: auth.worker.id,
    activeJobs: parsed.data.activeJobs,
    heartbeatLatencyMs: parsed.data.heartbeatLatencyMs ?? null,
  });

  return jsonResponse({
    ok: true,
    status: auth.worker.status,
    commands: {
      drain: auth.worker.status === "DRAINING",
    },
  });
}
