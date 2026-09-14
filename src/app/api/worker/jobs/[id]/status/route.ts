/**
 * Worker job status transitions:
 *   { phase: "STARTED" }                       RESERVED → RUNNING
 *   { phase: "SESSION_READY" }                 live session LOADING → READY
 *   { phase: "SESSION_LIVE" }                  live session → LIVE (frames flowing)
 *   { phase: "SESSION_DEGRADED" }              media path degraded
 */

import { getDb } from "@/lib/db";
import { startJob } from "@/lib/jobs/queue";
import {
  sessionMediaDegraded,
  sessionWentLive,
  workerSessionReady,
} from "@/lib/sessions/state-machine";
import { authenticateWorker } from "@/lib/workers/registry";
import { apiError, jsonResponse, readJson, workerAuthFrom } from "@/lib/api-helpers";
import { z } from "zod";

const statusSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("STARTED") }),
  z.object({ phase: z.literal("SESSION_READY"), sessionId: z.string().uuid() }),
  z.object({ phase: z.literal("SESSION_LIVE"), sessionId: z.string().uuid() }),
  z.object({ phase: z.literal("SESSION_DEGRADED"), sessionId: z.string().uuid() }),
]);

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
  const parsed = statusSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Unknown status phase.");
  }

  switch (parsed.data.phase) {
    case "STARTED": {
      const job = await startJob(getDb(), id, auth.worker.id);
      if (!job) return apiError(409, "conflict", "Job is not in RESERVED state for this worker.");
      return jsonResponse({ job });
    }
    case "SESSION_READY": {
      await workerSessionReady(getDb(), parsed.data.sessionId);
      return jsonResponse({ ok: true });
    }
    case "SESSION_LIVE": {
      await sessionWentLive(getDb(), parsed.data.sessionId);
      return jsonResponse({ ok: true });
    }
    case "SESSION_DEGRADED": {
      await sessionMediaDegraded(getDb(), parsed.data.sessionId);
      return jsonResponse({ ok: true });
    }
  }
}
