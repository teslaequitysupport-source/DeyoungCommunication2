/**
 * Control-plane client for workers — the HTTP surface of
 * WORKER-PROTOCOL.md. Zero database access by design: workers speak the
 * protocol, nothing else.
 */

export interface WorkerAnnounce {
  provider: string;
  gpuType?: string | null;
  vramMb?: number | null;
  region?: string | null;
  version?: string;
  capabilities: string[];
  models?: string[];
}

export interface ClaimedJob {
  id: string;
  userId: string;
  liveSessionId: string | null;
  type: string;
  status: string;
  priority: number;
  inputRefs: Record<string, unknown>;
  workerId: string | null;
  idempotencyKey: string;
  retryCount: number;
}

export interface AllocateBatch {
  kind: "batch";
  requiredCapability: string;
  inputs: Array<{ assetId: string; downloadPath: string }>;
  storage: string;
}

export interface AllocateLive {
  kind: "live";
  requiredCapability: string;
  session: { id: string; status: string; roomRef: string | null } | null;
  character: {
    id: string;
    name: string;
    appearance: Record<string, unknown>;
  } | null;
  inputs: Array<{ assetId: string; downloadPath: string }>;
  storage: string;
  realtime: {
    transport: "socketio-relay";
    ticket: string;
  };
}

export type Allocate = AllocateBatch | AllocateLive;

export class ControlPlaneClient {
  constructor(
    public readonly baseUrl: string,
    public readonly name: string,
    public readonly credential: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "x-worker-name": this.name,
      authorization: `Bearer ${this.credential}`,
      "content-type": "application/json",
      ...extra,
    };
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<{ ok: boolean; status: number; data: T | { error: string; message: string } }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: this.headers(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { error: "bad_json", message: `status ${res.status}` };
    }
    return { ok: res.ok, status: res.status, data: data as never };
  }

  async register(announce: WorkerAnnounce) {
    return this.request<{ worker: unknown }>("/api/worker/register", {
      method: "POST",
      body: announce,
    });
  }

  async heartbeat(activeJobs: number, heartbeatLatencyMs: number | null) {
    return this.request<{ ok: boolean; commands: { drain: boolean } }>(
      "/api/worker/heartbeat",
      { method: "POST", body: { activeJobs, heartbeatLatencyMs } },
    );
  }

  async claim() {
    return this.request<{ job: ClaimedJob | null; allocate?: Allocate; command?: string }>(
      "/api/worker/claim",
      { method: "POST", body: {} },
    );
  }

  async jobStarted(jobId: string) {
    return this.request<{ job: ClaimedJob }>(`/api/worker/jobs/${jobId}/status`, {
      method: "POST",
      body: { phase: "STARTED" },
    });
  }

  async jobResult(
    jobId: string,
    payload: {
      result?: Record<string, unknown>;
      usage?: Record<string, unknown>;
      costUsd?: string;
    },
  ) {
    return this.request<{ job: ClaimedJob }>(`/api/worker/jobs/${jobId}/result`, {
      method: "POST",
      body: payload,
    });
  }

  async jobError(
    jobId: string,
    failureInfo: Record<string, unknown>,
    requeue?: boolean,
  ) {
    return this.request<{ job: ClaimedJob }>(`/api/worker/jobs/${jobId}/error`, {
      method: "POST",
      body: { failureInfo, requeue },
    });
  }

  async control(action: "drain" | "shutdown") {
    return this.request<{ ok: boolean }>("/api/worker/control", {
      method: "POST",
      body: { action },
    });
  }

  /** Download an assigned input asset (worker-authenticated). */
  async downloadAsset(
    path: string,
  ): Promise<{ ok: boolean; status: number; bytes: Buffer | null }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) return { ok: false, status: res.status, bytes: null };
    return {
      ok: true,
      status: res.status,
      bytes: Buffer.from(await res.arrayBuffer()),
    };
  }

  /** Status phase helper for live sessions (correct job path variant). */
  async sessionPhase(
    jobId: string,
    phase: "SESSION_READY" | "SESSION_LIVE" | "SESSION_DEGRADED",
    sessionId: string,
  ) {
    return this.request<{ ok: boolean }>(`/api/worker/jobs/${jobId}/status`, {
      method: "POST",
      body: { phase, sessionId },
    });
  }
}
