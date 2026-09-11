/**
 * H3 official API client (spec §9 — H3 is a model/capability, not the
 * architecture; approved decision: production uses the official MiniMax API
 * only, self-host commercial use requires written MiniMax permission).
 *
 * Credential placement (approved report Ch. 18 external-credential gate):
 * the key lives on the WORKER's environment — never in the control plane,
 * never in code, never in git. A worker only announces the `video.h3`
 * capability when this config resolves; otherwise H3 jobs wait honestly
 * with a "no capable worker" routing reason.
 *
 * The request/response contract follows the documented official platform
 * API shape (platform.minimax.io): create task → poll status → retrieve
 * file. Spec §9's verify-list (current docs, capabilities, licensing,
 * commercial rights, hardware, real-time support, provider restrictions)
 * must be re-verified against live documentation when real credentials
 * are provisioned; endpoint paths stay env-configurable (H3_API_BASE_URL)
 * so drift is a configuration change, not a code change.
 *
 * Unknown task statuses from the provider count as pending — the executor's
 * timeout is the honest backstop; nothing is guessed from silence.
 */

export type FetchLike = typeof fetch;

export interface H3EnvConfig {
  /** API root, e.g. https://api.minimax.io/v1 (trailing slashes stripped). */
  baseUrl: string;
  /** Worker-side secret from env — never logged, never persisted. */
  apiKey: string;
  /** Model name, e.g. "MiniMax-H3" or "MiniMax-H3-Max". */
  model: string;
  /** Optional group/account id some official endpoints require. */
  groupId?: string;
}

/**
 * Resolve H3 configuration from environment. Both H3_API_BASE_URL and
 * H3_API_KEY are required — anything less is "not configured", not a
 * half-configured worker that claims a capability it cannot honor.
 */
export function h3ConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): H3EnvConfig | null {
  const baseUrl = env.H3_API_BASE_URL?.trim();
  const apiKey = env.H3_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model: env.H3_MODEL?.trim() || "MiniMax-H3",
    groupId: env.H3_GROUP_ID?.trim() || undefined,
  };
}

/** A structured provider/transport failure — surfaces as job failureInfo. */
export class H3ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
    readonly providerStatusCode?: number,
  ) {
    super(message);
    this.name = "H3ApiError";
  }
}

interface H3BaseResp {
  status_code?: number;
  status_msg?: string;
}

/** Official-style JSON request: bearer auth, base_resp envelope checking. */
async function h3Json<T extends { base_resp?: H3BaseResp }>(
  config: H3EnvConfig,
  path: string,
  init: { method: string; body?: string },
  fetchImpl: FetchLike,
  /**
   * The query endpoint overloads base_resp: a non-zero code there can be
   * TASK-level failure info (status: "Fail"), not a transport error. Callers
   * that interpret task state opt out of the blanket envelope check and
   * handle base_resp themselves.
   */
  opts?: { envelope?: boolean },
): Promise<T> {
  const res = await fetchImpl(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body,
  });
  let json: T | null = null;
  try {
    json = (await res.json()) as T;
  } catch {
    // Non-JSON body — fall through to the HTTP status error below.
  }
  if (!res.ok) {
    throw new H3ApiError(
      json?.base_resp?.status_msg ?? `H3 API HTTP ${res.status} on ${path}`,
      res.status,
      json?.base_resp?.status_code,
    );
  }
  const base = json?.base_resp;
  if (opts?.envelope !== false) {
    if (base && typeof base.status_code === "number" && base.status_code !== 0) {
      throw new H3ApiError(
        base.status_msg ?? `H3 API status_code ${base.status_code} on ${path}`,
        res.status,
        base.status_code,
      );
    }
  }
  return json as T;
}

/** Create a video generation task; returns the provider task id. */
export async function submitH3VideoTask(
  config: H3EnvConfig,
  input: { prompt: string; firstFrameImageUrl?: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model,
    prompt: input.prompt,
  };
  if (input.firstFrameImageUrl) {
    body.first_frame_image_url = input.firstFrameImageUrl;
  }
  const json = await h3Json<{ task_id?: string } & { base_resp?: H3BaseResp }>(
    config,
    "/video_generation",
    { method: "POST", body: JSON.stringify(body) },
    fetchImpl,
  );
  if (!json.task_id) {
    throw new H3ApiError("H3 submit returned no task_id", 200);
  }
  return json.task_id;
}

export type H3TaskState =
  | { phase: "pending" }
  | { phase: "succeeded"; fileId: string }
  | { phase: "failed"; detail?: string };

/** Known pending/success/fail status strings, normalized to lowercase. */
const PENDING_STATUSES = new Set([
  "prepared",
  "queueing",
  "queued",
  "running",
  "pending",
  "processing",
  "generating",
]);
const SUCCESS_STATUSES = new Set(["success", "succeeded", "done", "completed"]);
const FAIL_STATUSES = new Set([
  "fail",
  "failed",
  "error",
  "cancelled",
  "canceled",
]);

/** Poll a task's state exactly once. */
export async function queryH3VideoTask(
  config: H3EnvConfig,
  taskId: string,
  fetchImpl: FetchLike = fetch,
): Promise<H3TaskState> {
  const json = await h3Json<{ status?: string; file_id?: string } & { base_resp?: H3BaseResp }>(
    config,
    `/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
    { method: "GET" },
    fetchImpl,
    { envelope: false },
  );
  const raw = (json.status ?? "").trim().toLowerCase();
  if (FAIL_STATUSES.has(raw)) {
    // Task-level failure: base_resp carries the provider's reason when set.
    return { phase: "failed", detail: json.base_resp?.status_msg ?? raw };
  }
  if (SUCCESS_STATUSES.has(raw) && json.file_id) {
    return { phase: "succeeded", fileId: json.file_id };
  }
  // Pending or unknown status, or success without a file yet: a non-zero
  // base_resp HERE is a genuine query-level error (auth, quota) — propagate
  // it; otherwise the wait continues honestly until the executor's timeout.
  const base = json.base_resp;
  if (base && typeof base.status_code === "number" && base.status_code !== 0) {
    throw new H3ApiError(
      base.status_msg ?? `H3 API status_code ${base.status_code}`,
      200,
      base.status_code,
    );
  }
  void PENDING_STATUSES;
  return { phase: "pending" };
}

/** Retrieve and download the generated video file bytes. */
export async function retrieveH3VideoFile(
  config: H3EnvConfig,
  fileId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const params = new URLSearchParams({ file_id: fileId });
  if (config.groupId) params.set("GroupId", config.groupId);
  const json = await h3Json<{ file?: { download_url?: string } } & { base_resp?: H3BaseResp }>(
    config,
    `/files/retrieve?${params.toString()}`,
    { method: "GET" },
    fetchImpl,
  );
  const url = json.file?.download_url;
  if (!url) {
    throw new H3ApiError("H3 file retrieve returned no download_url", 200);
  }
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok) {
    throw new H3ApiError(`H3 file download failed (HTTP ${res.status})`, res.status);
  }
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mime: res.headers.get("content-type")?.split(";")[0] || "video/mp4",
  };
}
