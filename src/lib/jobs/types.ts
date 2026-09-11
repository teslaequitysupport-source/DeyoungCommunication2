/**
 * Job type registry — the single place that defines what work exists
 * (report Ch. 9: "Every asynchronous task must have a job record").
 *
 * Rules:
 *   - A job type is only ever routed to a worker whose REGISTERed
 *     capabilities include the type's requiredCapability — hard constraint,
 *     enforced inside the claim path, never by client input.
 *   - `live` marks jobs bound to a live session; the scheduler treats their
 *     lifecycle differently (worker loss → session DEGRADED, requeue →
 *     RECOVERING) than batch jobs (plain retry).
 *   - Phase 2 adds AI model jobs (video.generate.h3 …) here — the registry
 *     is the extension point, not the worker protocol.
 */

export interface JobTypeDefinition {
  /** Capability a worker must have REGISTERed to claim this type. */
  requiredCapability: string;
  /** Bound to a live session (real-time), vs. batch processing. */
  live: boolean;
  /** Human title for UIs and audit metadata. */
  title: string;
  /** Default priority (0 lowest … 9 highest). */
  priority: number;
  /** Max safe automatic retries (idempotency key makes retries safe). */
  maxRetries: number;
}

export const JOB_TYPES = {
  "transform.image.colorgrade": {
    requiredCapability: "transform.image",
    live: false,
    title: "Image transform (dev color grade)",
    priority: 5,
    maxRetries: 3,
  },
  "transform.live.colorgrade": {
    requiredCapability: "transform.live",
    live: true,
    title: "Live camera transform (dev color grade)",
    priority: 7,
    maxRetries: 1,
  },
} as const satisfies Record<string, JobTypeDefinition>;

export type JobType = keyof typeof JOB_TYPES;

export function isJobType(value: unknown): value is JobType {
  return typeof value === "string" && value in JOB_TYPES;
}

export function jobTypeDefinition(type: string): JobTypeDefinition {
  const def = (JOB_TYPES as Record<string, JobTypeDefinition | undefined>)[type];
  if (!def) {
    throw new Error(`Unknown job type "${type}" — not present in the registry.`);
  }
  return def;
}

/**
 * The job types a worker may claim, derived from its REGISTERed
 * capabilities. Pure function — unit-testable, used by the claim path.
 */
export function claimableJobTypes(capabilities: readonly string[]): string[] {
  const caps = new Set(capabilities);
  return Object.entries(JOB_TYPES)
    .filter(([, def]) => caps.has(def.requiredCapability))
    .map(([type]) => type);
}
