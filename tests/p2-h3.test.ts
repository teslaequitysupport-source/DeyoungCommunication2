/**
 * P2 H3 suite (spec §9 — H3 is a model/capability behind the official API):
 * env-config resolution (external-credential gate), the official-API client
 * contract (submit → poll → retrieve), and the executor's honest terminal
 * states. All network and control-plane I/O is faked — no real provider is
 * ever contacted, no credential is ever needed.
 */

import { describe, expect, it } from "vitest";

const {
  h3ConfigFromEnv,
  H3ApiError,
  submitH3VideoTask,
  queryH3VideoTask,
  retrieveH3VideoFile,
} = await import("@/lib/h3/client");
const { executeH3Job } = await import("@/lib/worker-core/h3-executor");

const CONFIG = {
  baseUrl: "https://api.example.test/v1",
  apiKey: "test-key",
  model: "MiniMax-H3",
  groupId: "group-77",
} as const;

describe("P2 H3 — env config (external-credential gate)", () => {
  it("returns null when nothing is set", () => {
    expect(h3ConfigFromEnv({})).toBeNull();
  });

  it("requires BOTH base URL and key — either alone is not configured", () => {
    expect(h3ConfigFromEnv({ H3_API_BASE_URL: "https://api.example.test/v1" })).toBeNull();
    expect(h3ConfigFromEnv({ H3_API_KEY: "k" })).toBeNull();
  });

  it("resolves with defaults and strips trailing slashes", () => {
    const cfg = h3ConfigFromEnv({
      H3_API_BASE_URL: "https://api.example.test/v1/",
      H3_API_KEY: " k ",
    });
    expect(cfg).toEqual({
      baseUrl: "https://api.example.test/v1",
      apiKey: "k",
      model: "MiniMax-H3",
      groupId: undefined,
    });
  });

  it("honors model and group overrides", () => {
    const cfg = h3ConfigFromEnv({
      H3_API_BASE_URL: "https://api.example.test/v1",
      H3_API_KEY: "k",
      H3_MODEL: "MiniMax-H3-Max",
      H3_GROUP_ID: "group-1",
    });
    expect(cfg?.model).toBe("MiniMax-H3-Max");
    expect(cfg?.groupId).toBe("group-1");
  });
});

// ── Fake provider transport ────────────────────────────────────────────────

type RecordedCall = { url: string; method: string; auth?: string; body?: unknown };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerFetch(
  script: (
    url: URL,
    method: string,
    init: RequestInit,
  ) => Response | null,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method,
      auth: headers.get("authorization") ?? undefined,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const res = script(url, method, init ?? {});
    if (!res) throw new Error(`unexpected provider call: ${method} ${url}`);
    return res;
  }) as typeof fetch;
  return { fetch: fake, calls };
}

describe("P2 H3 — official API client contract", () => {
  it("submits with bearer auth, model and prompt; returns task_id", async () => {
    const { fetch, calls } = providerFetch((url) => {
      if (url.pathname === "/v1/video_generation") {
        return jsonResponse({ task_id: "task-1", base_resp: { status_code: 0 } });
      }
      return null;
    });
    const taskId = await submitH3VideoTask(
      CONFIG,
      { prompt: "a calm river at dawn" },
      fetch,
    );
    expect(taskId).toBe("task-1");
    expect(calls[0]).toMatchObject({
      method: "POST",
      auth: "Bearer test-key",
      body: { model: "MiniMax-H3", prompt: "a calm river at dawn" },
    });
  });

  it("maps provider statuses honestly: success, failure, unknown-as-pending", async () => {
    const states = ["Running", "Success", "Fail", "SomeFutureStatus"];
    let i = 0;
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/query/video_generation") {
        const status = states[i++];
        const body: Record<string, unknown> = {
          status,
          base_resp: { status_code: 0 },
        };
        if (status === "Success") body.file_id = "file-9";
        if (status === "Fail") body.base_resp = { status_code: 1004, status_msg: "content policy" };
        return jsonResponse(body);
      }
      return null;
    });
    expect(await queryH3VideoTask(CONFIG, "t", fetch)).toEqual({ phase: "pending" });
    expect(await queryH3VideoTask(CONFIG, "t", fetch)).toEqual({
      phase: "succeeded",
      fileId: "file-9",
    });
    expect(await queryH3VideoTask(CONFIG, "t", fetch)).toEqual({
      phase: "failed",
      detail: "content policy",
    });
    // Unknown status strings are pending, never guessed as done or failed.
    expect(await queryH3VideoTask(CONFIG, "t", fetch)).toEqual({ phase: "pending" });
  });

  it("success without file_id stays pending (no fabricated downloads)", async () => {
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/query/video_generation") {
        return jsonResponse({ status: "Success", base_resp: { status_code: 0 } });
      }
      return null;
    });
    expect(await queryH3VideoTask(CONFIG, "t", fetch)).toEqual({ phase: "pending" });
  });

  it("retrieves the file with GroupId and downloads the bytes", async () => {
    const video = new Uint8Array([1, 2, 3, 4]);
    const { fetch, calls } = providerFetch((url) => {
      if (url.pathname === "/v1/files/retrieve") {
        expect(url.searchParams.get("file_id")).toBe("file-9");
        expect(url.searchParams.get("GroupId")).toBe("group-77");
        return jsonResponse({
          file: { download_url: "https://cdn.example.test/v.mp4" },
          base_resp: { status_code: 0 },
        });
      }
      if (url.hostname === "cdn.example.test") {
        return new Response(video, {
          headers: { "content-type": "video/mp4; charset=binary" },
        });
      }
      return null;
    });
    const file = await retrieveH3VideoFile(CONFIG, "file-9", fetch);
    expect(Array.from(file.bytes)).toEqual([1, 2, 3, 4]);
    expect(file.mime).toBe("video/mp4"); // params stripped
    expect(calls[1]?.url).toBe("https://cdn.example.test/v.mp4");
  });

  it("throws H3ApiError on base_resp failures and HTTP errors", async () => {
    const { fetch: f1 } = providerFetch(() =>
      jsonResponse({ base_resp: { status_code: 1004, status_msg: "quota exceeded" } }),
    );
    await expect(submitH3VideoTask(CONFIG, { prompt: "x" }, f1)).rejects.toThrow(H3ApiError);
    await expect(submitH3VideoTask(CONFIG, { prompt: "x" }, f1)).rejects.toThrow(
      "quota exceeded",
    );

    const { fetch: f2 } = providerFetch(() => new Response("nope", { status: 503 }));
    await expect(queryH3VideoTask(CONFIG, "t", f2)).rejects.toThrow(H3ApiError);
    await expect(queryH3VideoTask(CONFIG, "t", f2)).rejects.toThrow("503");
  });
});

// ── Fake control-plane ports ───────────────────────────────────────────────

interface Recorded {
  errors: Array<{ failureInfo: Record<string, unknown>; requeue?: boolean }>;
  results: Array<{ result?: Record<string, unknown>; usage?: Record<string, unknown> }>;
  uploads: Array<{ bytes: Uint8Array; mime: string }>;
}

function fakePorts(log?: (line: string) => void) {
  const rec: Recorded = { errors: [], results: [], uploads: [] };
  return {
    rec,
    ports: {
      log,
      reportResult: async (_jobId: string, payload: { result?: Record<string, unknown>; usage?: Record<string, unknown> }) => {
        rec.results.push(payload);
        return { ok: true, status: 200 };
      },
      reportError: async (_jobId: string, failureInfo: Record<string, unknown>, requeue?: boolean) => {
        rec.errors.push({ failureInfo, requeue });
        return { ok: true, status: 200 };
      },
      uploadOutput: async (_jobId: string, bytes: Uint8Array, mime: string) => {
        rec.uploads.push({ bytes, mime });
        return { ok: true, assetId: "asset-h3-1" };
      },
    },
  };
}

describe("P2 H3 — executor honest terminal states", () => {
  it("not configured → terminal error, no provider call", async () => {
    const { rec, ports } = fakePorts();
    const { fetch, calls } = providerFetch(() => null); // any call would throw
    await executeH3Job({ id: "j1", inputRefs: { prompt: "x" } }, {
      ...ports,
      config: null,
      fetchImpl: fetch,
    });
    expect(rec.errors).toHaveLength(1);
    expect(rec.errors[0]?.failureInfo).toMatchObject({ reason: "h3_not_configured" });
    expect(rec.errors[0]?.requeue).toBe(false); // deterministic — no retries
    expect(calls).toHaveLength(0);
    expect(rec.results).toHaveLength(0);
  });

  it("missing prompt → terminal error", async () => {
    const { rec, ports } = fakePorts();
    const { fetch } = providerFetch(() => null);
    await executeH3Job({ id: "j2", inputRefs: {} }, {
      ...ports,
      config: CONFIG,
      fetchImpl: fetch,
    });
    expect(rec.errors[0]?.failureInfo).toMatchObject({ reason: "h3_prompt_missing" });
    expect(rec.errors[0]?.requeue).toBe(false);
  });

  it("happy path: submit → poll → retrieve → upload → result", async () => {
    const video = new Uint8Array([9, 9, 9]);
    let polls = 0;
    const lines: string[] = [];
    const { rec, ports } = fakePorts((l) => lines.push(l));
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/video_generation") {
        return jsonResponse({ task_id: "task-42", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/query/video_generation") {
        polls++;
        return polls < 2
          ? jsonResponse({ status: "Running", base_resp: { status_code: 0 } })
          : jsonResponse({ status: "Success", file_id: "file-42", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/files/retrieve") {
        return jsonResponse({
          file: { download_url: "https://cdn.example.test/out.mp4" },
          base_resp: { status_code: 0 },
        });
      }
      if (url.hostname === "cdn.example.test") {
        return new Response(video, { headers: { "content-type": "video/mp4" } });
      }
      return null;
    });

    await executeH3Job(
      { id: "j3", inputRefs: { prompt: "  a fox in the mist  " } },
      { ...ports, config: CONFIG, fetchImpl: fetch, pollIntervalMs: 1 },
    );

    expect(rec.uploads).toEqual([{ bytes: video, mime: "video/mp4" }]);
    expect(rec.errors).toHaveLength(0);
    expect(rec.results).toHaveLength(1);
    expect(rec.results[0]?.result).toMatchObject({
      outputAssetId: "asset-h3-1",
      outputKind: "video/mp4",
      model: "MiniMax-H3",
      provider: "minimax-official-api",
      providerTaskId: "task-42",
    });
    expect(rec.results[0]?.usage).toMatchObject({
      fileBytes: 3,
      model: "MiniMax-H3",
      pollCount: 2,
    });
    expect(lines.join(" ")).toContain("task-42");
  });

  it("provider failure → requeueable error with provider detail", async () => {
    const { rec, ports } = fakePorts();
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/video_generation") {
        return jsonResponse({ task_id: "task-7", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/query/video_generation") {
        return jsonResponse({
          status: "Fail",
          base_resp: { status_code: 1004, status_msg: "content policy" },
        });
      }
      return null;
    });
    await executeH3Job({ id: "j4", inputRefs: { prompt: "x" } }, {
      ...ports,
      config: CONFIG,
      fetchImpl: fetch,
      pollIntervalMs: 1,
    });
    expect(rec.errors[0]?.failureInfo).toMatchObject({
      reason: "h3_provider_failed",
      detail: "content policy",
      providerTaskId: "task-7",
    });
    expect(rec.errors[0]?.requeue).toBeUndefined(); // requeue allowed, budget-bounded
    expect(rec.results).toHaveLength(0);
  });

  it("poll timeout → honest timeout error, never an infinite wait", async () => {
    const { rec, ports } = fakePorts();
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/video_generation") {
        return jsonResponse({ task_id: "task-8", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/query/video_generation") {
        return jsonResponse({ status: "Running", base_resp: { status_code: 0 } });
      }
      return null;
    });
    await executeH3Job({ id: "j5", inputRefs: { prompt: "x" } }, {
      ...ports,
      config: CONFIG,
      fetchImpl: fetch,
      pollIntervalMs: 1,
      timeoutMs: 0, // deadline is already past on the first poll
    });
    expect(rec.errors[0]?.failureInfo).toMatchObject({
      reason: "h3_timeout",
      providerTaskId: "task-8",
    });
  });

  it("transport failure mid-flow → structured error, not a crash", async () => {
    const { rec, ports } = fakePorts();
    const { fetch } = providerFetch(() => new Response("gateway down", { status: 502 }));
    await executeH3Job({ id: "j6", inputRefs: { prompt: "x" } }, {
      ...ports,
      config: CONFIG,
      fetchImpl: fetch,
    });
    expect(rec.errors[0]?.failureInfo).toMatchObject({ reason: "h3_api_error" });
    expect(rec.results).toHaveLength(0);
  });

  it("upload failure after a successful generation → output error surfaced", async () => {
    const { rec, ports } = fakePorts();
    const { fetch } = providerFetch((url) => {
      if (url.pathname === "/v1/video_generation") {
        return jsonResponse({ task_id: "task-9", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/query/video_generation") {
        return jsonResponse({ status: "Success", file_id: "file-9", base_resp: { status_code: 0 } });
      }
      if (url.pathname === "/v1/files/retrieve") {
        return jsonResponse({
          file: { download_url: "https://cdn.example.test/v.mp4" },
          base_resp: { status_code: 0 },
        });
      }
      if (url.hostname === "cdn.example.test") {
        return new Response(new Uint8Array([1]), { headers: { "content-type": "video/mp4" } });
      }
      return null;
    });
    const failingUpload = {
      ...ports,
      uploadOutput: async () => ({ ok: false, status: 500, detail: "storage down" }),
    };
    await executeH3Job({ id: "j7", inputRefs: { prompt: "x" } }, {
      ...failingUpload,
      config: CONFIG,
      fetchImpl: fetch,
      pollIntervalMs: 1,
    });
    expect(rec.errors[0]?.failureInfo).toMatchObject({
      reason: "output_upload_failed",
      detail: "storage down",
      providerTaskId: "task-9",
    });
    expect(rec.results).toHaveLength(0);
  });
});
