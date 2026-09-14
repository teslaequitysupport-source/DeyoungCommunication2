/**
 * Worker selection (spec §8). The claim path is pull-based and already
 * enforces the capability hard-constraint server-side; this module is the
 * control-plane's own routing decision, needed at two moments:
 *
 *   1. after enqueue — is there AWAKE capacity for this job type, or must a
 *      sleeping worker be woken (cold start)?
 *   2. reporting — why is a job waiting? (observable, never guessed)
 *
 * Scoring factors (spec §8 list, mapped to what the schema honestly holds):
 *   capability   hard filter — requiredCapability ∈ worker.capabilities
 *   health       UNHEALTHY / SHUTDOWN / DRAINING are never candidates
 *   availability awake statuses preferred; sleeping only as wake fallback
 *   load          activeJobs ascending
 *   errors        errorCount ascending
 *   latency       heartbeatLatencyMs ascending
 *   heartbeat     fresher lastHeartbeatAt preferred
 *   region/gpu/vram/model — optional constraints passed by the caller
 *
 * Factors the spec lists that have no honest data yet (plan, cost, queue
 * depth per provider) are documented as P5 items — never faked.
 */

import { sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { jobTypeDefinition } from "@/lib/jobs/types";
import { requestWorkerWake } from "@/lib/workers/sleep";

/** Statuses in which a worker can accept a claim right now. */
export const AWAKE_STATUSES = [
  "IDLE",
  "RESERVED",
  "LOADING",
  "READY",
  "BUSY",
] as const;

export interface WorkerCandidate {
  id: string;
  name: string;
  provider: string;
  status: string;
  capabilities: string[];
  models: string[];
  gpuType: string | null;
  vramMb: number | null;
  region: string | null;
  activeJobs: number;
  errorCount: number;
  heartbeatLatencyMs: number | null;
  lastHeartbeatAt: Date | null;
}

export interface SelectionRequirements {
  /** Exact GPU type string match when provided. */
  gpuType?: string;
  /** Minimum VRAM in MB when provided. */
  minVramMb?: number;
  /** Region preference: matching workers sort first. */
  region?: string;
  /** Required model manifest entry (e.g. "minimax-h3:api"). */
  model?: string;
}

export type SelectionDecision =
  | { outcome: "assigned"; workerId: string; reason: "awake_capable_worker" }
  | { outcome: "wake"; workerId: string; reason: "sleeping_worker_cold_start" }
  | { outcome: "none"; reason: "no_capable_worker" };

/**
 * §8 ordering for awake candidates: fewer active jobs, fewer errors, lower
 * heartbeat latency, fresher heartbeat. Pure function — unit tested.
 */
export function compareAwakeWorkers(a: WorkerCandidate, b: WorkerCandidate): number {
  if (a.activeJobs !== b.activeJobs) return a.activeJobs - b.activeJobs;
  if (a.errorCount !== b.errorCount) return a.errorCount - b.errorCount;
  const la = a.heartbeatLatencyMs ?? Number.MAX_SAFE_INTEGER;
  const lb = b.heartbeatLatencyMs ?? Number.MAX_SAFE_INTEGER;
  if (la !== lb) return la - lb;
  const fa = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
  const fb = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
  return fb - fa;
}

/** Sleeping candidates ranked the same way — best box to boot. */
export function compareSleepingWorkers(a: WorkerCandidate, b: WorkerCandidate): number {
  return compareAwakeWorkers(a, b);
}

function meetsRequirements(
  worker: WorkerCandidate,
  requirements?: SelectionRequirements,
): boolean {
  if (!requirements) return true;
  if (requirements.gpuType && worker.gpuType !== requirements.gpuType) return false;
  if (requirements.minVramMb != null) {
    if (worker.vramMb == null || worker.vramMb < requirements.minVramMb) return false;
  }
  if (requirements.model && !worker.models.includes(requirements.model)) return false;
  return true;
}

function regionBoost(worker: WorkerCandidate, region?: string): number {
  return region && worker.region === region ? -1 : 0;
}

export async function selectWorkerForJobType(
  db: PlatformDatabase,
  type: string,
  requirements?: SelectionRequirements,
): Promise<SelectionDecision> {
  const def = jobTypeDefinition(type);

  // One pass: awake candidates, sleeping candidates; the rest (UNHEALTHY,
  // SHUTDOWN, DRAINING) are structurally excluded — health is a hard filter.
  const rows = await db.execute<{
    id: string;
    name: string;
    provider: string;
    status: string;
    capabilities: string[] | null;
    models: string[] | null;
    gpu_type: string | null;
    vram_mb: number | null;
    region: string | null;
    active_jobs: number;
    error_count: number;
    heartbeat_latency_ms: number | null;
    last_heartbeat_at: Date | null;
  }>(sql`
    SELECT id, name, provider, status, capabilities, models,
           gpu_type, vram_mb, region, active_jobs, error_count,
           heartbeat_latency_ms, last_heartbeat_at
    FROM workers
    WHERE status IN ('IDLE','RESERVED','LOADING','READY','BUSY','SLEEPING')
  `);

  const awake: WorkerCandidate[] = [];
  const sleeping: WorkerCandidate[] = [];
  for (const raw of rows.rows) {
    const worker: WorkerCandidate = {
      id: raw.id,
      name: raw.name,
      provider: raw.provider,
      status: raw.status,
      capabilities: raw.capabilities ?? [],
      models: raw.models ?? [],
      gpuType: raw.gpu_type,
      vramMb: raw.vram_mb,
      region: raw.region,
      activeJobs: Number(raw.active_jobs ?? 0),
      errorCount: Number(raw.error_count ?? 0),
      heartbeatLatencyMs: raw.heartbeat_latency_ms,
      lastHeartbeatAt: raw.last_heartbeat_at,
    };
    if (!worker.capabilities.includes(def.requiredCapability)) continue;
    if (!meetsRequirements(worker, requirements)) continue;
    if (worker.status === "SLEEPING") sleeping.push(worker);
    else awake.push(worker);
  }

  if (awake.length > 0) {
    awake.sort(
      (a, b) =>
        regionBoost(a, requirements?.region) - regionBoost(b, requirements?.region) ||
        compareAwakeWorkers(a, b),
    );
    return { outcome: "assigned", workerId: awake[0].id, reason: "awake_capable_worker" };
  }
  if (sleeping.length > 0) {
    sleeping.sort(compareSleepingWorkers);
    return {
      outcome: "wake",
      workerId: sleeping[0].id,
      reason: "sleeping_worker_cold_start",
    };
  }
  return { outcome: "none", reason: "no_capable_worker" };
}

export type RoutingOutcome = SelectionDecision & {
  jobId: string;
  jobType: string;
};

/**
 * Post-enqueue routing (spec §8 + §45): if no awake worker can serve this
 * job type but a sleeping capable one exists, request its wake. Returns
 * the decision so API responses can state plainly why a job is waiting —
 * including "cold start", never "starting soon" without a basis.
 */
export async function routeJobAfterEnqueue(
  db: PlatformDatabase,
  job: { id: string; type: string },
  options?: {
    requirements?: SelectionRequirements;
    /** Production wake invoker (RunPod etc.); dev default is the claim poll. */
    invokeWake?: (workerId: string) => Promise<void>;
  },
): Promise<RoutingOutcome> {
  const decision = await selectWorkerForJobType(db, job.type, options?.requirements);
  if (decision.outcome === "wake") {
    await requestWorkerWake(db, { workerId: decision.workerId, jobId: job.id }, options?.invokeWake);
  }
  return { ...decision, jobId: job.id, jobType: job.type };
}
