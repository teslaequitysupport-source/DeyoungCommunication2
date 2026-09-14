/**
 * ALLOCATE via long-poll claim (WORKER-PROTOCOL.md).
 *
 * The worker holds the request open (≤ 5s in dev); when a claimable job
 * appears it is atomically reserved (FOR UPDATE SKIP LOCKED) and the
 * ALLOCATE payload returns. This gives push-like latency without
 * LISTEN/NOTIFY (unavailable on the dev Postgres) while keeping every
 * assignment durable in the jobs table.
 *
 * The payload contains everything the worker needs to execute: the job,
 * the live-session snapshot, the character's appearance config, input
 * asset ids, and — for live jobs — a media-relay ticket (the dev transport
 * equivalent of a LiveKit room token).
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { claimNextJob, type JobRecord } from "@/lib/jobs/queue";
import { jobTypeDefinition } from "@/lib/jobs/types";
import { authenticateWorker } from "@/lib/workers/registry";
import { getSession } from "@/lib/sessions/state-machine";
import { mintRealtimeTicket } from "@/lib/realtime/tickets";
import { tryAcceptWake } from "@/lib/workers/sleep";
import { apiError, jsonResponse, workerAuthFrom } from "@/lib/api-helpers";
import { storageModeLabel } from "@/lib/storage";

const POLL_INTERVAL_MS = 400;
const MAX_WAIT_MS = 5_000;

export async function POST(request: Request) {
  const { name, credential } = workerAuthFrom(request);
  const auth = await authenticateWorker(getDb(), name, credential);
  if (!auth.ok) {
    return apiError(401, "unauthorized", "Worker authentication failed.");
  }
  if (auth.worker.status === "DRAINING") {
    return jsonResponse({ job: null, command: "drain" });
  }
  if (auth.worker.status === "UNHEALTHY" || auth.worker.status === "SHUTDOWN") {
    return jsonResponse({ job: null, command: "stop" });
  }
  if (auth.worker.status === "SLEEPING") {
    // Spec §45 wake handshake: a sleeping worker that polls while a wake is
    // requested passes its health check and returns to service in the same
    // step — its next claim below executes the job that woke it. A poll
    // with no wake pending stays asleep ("cold start" is never fabricated).
    const woke = await tryAcceptWake(getDb(), auth.worker.id);
    if (!woke) {
      return jsonResponse({ job: null, command: "sleep" });
    }
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const job = await claimNextJob(getDb(), auth.worker.id);
    if (job) {
      const payload = await buildAllocatePayload(job);
      return jsonResponse({ job, allocate: payload });
    }
    if (Date.now() + POLL_INTERVAL_MS > deadline) {
      return jsonResponse({ job: null });
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function buildAllocatePayload(job: JobRecord) {
  const def = jobTypeDefinition(job.type);

  if (!job.liveSessionId) {
    return {
      kind: "batch" as const,
      requiredCapability: def.requiredCapability,
      inputs: inputAssetIds(job.inputRefs).map((id) => ({
        assetId: id,
        downloadPath: `/api/assets/${id}/file`,
      })),
      storage: storageModeLabel(),
    };
  }

  const session = await getSession(getDb(), job.liveSessionId);
  const character = session?.characterId
    ? (await getDb().select().from(characters).where(eq(characters.id, session.characterId)).limit(1))[0]
    : null;

  return {
    kind: "live" as const,
    requiredCapability: def.requiredCapability,
    session: session
      ? { id: session.id, status: session.status, roomRef: session.roomRef }
      : null,
    character: character
      ? { id: character.id, name: character.name, appearance: character.appearanceConfig }
      : null,
    inputs: inputAssetIds(job.inputRefs).map((id) => ({
      assetId: id,
      downloadPath: `/api/assets/${id}/file`,
    })),
    storage: storageModeLabel(),
    realtime: {
      // Dev transport (socket.io relay). Production swaps to a LiveKit
      // access token in this same slot — the payload contract is stable.
      transport: "socketio-relay" as const,
      ticket: mintRealtimeTicket({ sid: job.liveSessionId, role: "worker", wid: job.workerId ?? undefined }),
    },
  };
}

function inputAssetIds(inputRefs: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const value of Object.values(inputRefs ?? {})) {
    if (typeof value === "string" && value.startsWith("asset:")) {
      ids.push(value.slice("asset:".length));
    }
  }
  return ids;
}
