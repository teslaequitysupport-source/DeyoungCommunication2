/**
 * Client-safe API payload types shared by the app views. Server-only
 * modules are never imported from here.
 */

export interface CharacterRecord {
  id: string;
  name: string;
  appearanceConfig: {
    style?: string;
    hue?: number;
    saturation?: number;
    vignette?: boolean;
    [key: string]: unknown;
  };
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  kind: "FACE_IMAGE" | "VOICE_SAMPLE" | "VIDEO_CLIP" | "RENDER_OUTPUT" | "OTHER";
  characterId: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  purpose: string;
  status: "GRANTED" | "WITHDRAWN";
  scope: Record<string, unknown>;
  policyVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
  expiresAt: string | null;
}

export interface JobView {
  id: string;
  type: string;
  status:
    | "QUEUED"
    | "RESERVED"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";
  priority: number;
  retryCount: number;
  workerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  result: Record<string, unknown> | null;
  failureInfo: Record<string, unknown> | null;
}

export interface SessionView {
  id: string;
  characterId: string | null;
  status: string;
  workerId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  job?: JobView | null;
}

export interface ConsentPurposeInfo {
  purpose: string;
  label: string;
  description: string;
  scope: Record<string, string>;
}

export interface SessionStateEvent {
  status?: string;
  jobStatus?: string | null;
  workerHeartbeatAgeMs?: number | null;
}

export interface WorkerStats {
  fpsIn: number;
  fpsOut: number;
  transformMs: number;
  framesIn: number;
  framesOut: number;
  framesCorrupt: number;
}

export const LIVE_STATES = [
  "CREATED",
  "VALIDATING",
  "WAITING_FOR_WORKER",
  "WORKER_ASSIGNED",
  "LOADING",
  "READY",
  "LIVE",
  "DEGRADED",
  "RECOVERING",
  "STOPPING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export function stateLabel(status: string): string {
  switch (status) {
    case "WAITING_FOR_WORKER":
      return "Finding a compatible worker";
    case "WORKER_ASSIGNED":
      return "Worker assigned";
    case "LOADING":
      return "Worker loading";
    case "READY":
      return "Worker ready — waiting for your camera frames";
    case "LIVE":
      return "Live";
    case "DEGRADED":
      return "Connection degraded — recovering";
    case "RECOVERING":
      return "Recovering";
    case "STOPPING":
      return "Stopping";
    default:
      return status
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}
