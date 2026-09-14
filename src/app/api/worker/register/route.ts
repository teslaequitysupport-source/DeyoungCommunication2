/**
 * Worker protocol — HTTP surface (WORKER-PROTOCOL.md).
 *
 * REGISTER: announce manifest against a pre-provisioned identity. The
 * credential must match the stored hash; unknown names are refused — no
 * machine can self-provision trust (spec §31).
 */

import { getDb } from "@/lib/db";
import { registerWorker } from "@/lib/workers/registry";
import { apiError, jsonResponse, readJson, workerAuthFrom } from "@/lib/api-helpers";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const registerSchema = z.object({
  provider: z.string().trim().min(1).max(60).optional(),
  gpuType: z.string().trim().max(60).nullish(),
  vramMb: z.number().int().positive().nullish(),
  region: z.string().trim().max(60).nullish(),
  version: z.string().trim().max(60).nullish(),
  capabilities: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  models: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

export async function POST(request: Request) {
  const { name, credential } = workerAuthFrom(request);
  if (!name || !credential) {
    return apiError(401, "unauthorized", "X-Worker-Name and Bearer credential are required.");
  }

  const parsed = registerSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Invalid REGISTER payload.");
  }

  const result = await registerWorker(getDb(), {
    name,
    credential,
    ...parsed.data,
  });

  if (!result.ok) {
    await recordAudit(getDb(), {
      action: "worker.register",
      targetType: "worker",
      targetId: name,
      outcome: "DENIED",
      metadata: { reason: result.reason },
    });
    const status = result.reason === "unknown_worker" ? 404 : 401;
    return apiError(
      status,
      result.reason,
      result.reason === "unknown_worker"
        ? "Worker identity not provisioned. An administrator must provision it first."
        : result.reason === "shutdown"
          ? "This worker identity is shut down. An administrator must re-enable it."
          : "Worker credential rejected.",
    );
  }

  return jsonResponse({ worker: result.worker });
}
