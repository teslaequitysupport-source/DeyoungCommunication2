/**
 * H3 job execution (spec §9): a worker with verified official-API access
 * (env-configured, never hardcoded) executes `video.generate.h3` jobs.
 *
 *   submit task → poll (bounded) → retrieve file → upload via the
 *   worker-authenticated output route → RESULT
 *
 * Honest-state rules:
 *   - Not configured → ERROR with requeue:false — deterministic; retries
 *     cannot conjure credentials. Unreachable in practice (the runner only
 *     announces `video.h3` when configured), but the guard stays as defense
 *     in depth.
 *   - Missing prompt → ERROR with requeue:false (deterministic input defect).
 *   - Provider failure / timeout / transport errors → ERROR with requeue
 *     allowed, bounded by the job type's retry budget; the idempotency key
 *     guarantees a retry never duplicates provider work or billing.
 *
 * Ports are injected, so the whole flow is unit-testable with a fake fetch
 * and fake control plane — no network, no database.
 */

import {
  H3ApiError,
  queryH3VideoTask,
  retrieveH3VideoFile,
  submitH3VideoTask,
  type FetchLike,
  type H3EnvConfig,
} from "../h3/client";

/** Default poll cadence for the provider task (spec §9: no fake progress). */
export const H3_POLL_INTERVAL_MS = 5_000;
/** Honest upper bound for a generation before the job errors out. */
export const H3_TASK_TIMEOUT_MS = 10 * 60_000;

export interface H3ExecutorPorts {
  /** Null means "worker is not configured for H3" (terminal error path). */
  config: H3EnvConfig | null;
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
  log?: (line: string) => void;
  reportResult: (
    jobId: string,
    payload: {
      result?: Record<string, unknown>;
      usage?: Record<string, unknown>;
    },
  ) => Promise<{ ok: boolean; status: number }>;
  reportError: (
    jobId: string,
    failureInfo: Record<string, unknown>,
    requeue?: boolean,
  ) => Promise<{ ok: boolean; status: number }>;
  uploadOutput: (
    jobId: string,
    bytes: Uint8Array,
    mime: string,
  ) => Promise<{ ok: boolean; assetId?: string; status?: number; detail?: string }>;
}

export async function executeH3Job(
  job: { id: string; inputRefs: Record<string, unknown> },
  ports: H3ExecutorPorts,
): Promise<void> {
  const log = ports.log ?? (() => {});
  const fetchImpl = ports.fetchImpl ?? fetch;

  if (!ports.config) {
    await ports.reportError(
      job.id,
      {
        reason: "h3_not_configured",
        detail:
          "H3_API_BASE_URL and H3_API_KEY are required on the worker for video.generate.h3",
      },
      false,
    );
    return;
  }
  const config = ports.config;

  const prompt =
    typeof job.inputRefs.prompt === "string" ? job.inputRefs.prompt.trim() : "";
  if (!prompt) {
    await ports.reportError(
      job.id,
      {
        reason: "h3_prompt_missing",
        detail: "job.inputRefs.prompt must be a non-empty string",
      },
      false,
    );
    return;
  }
  const firstFrameImageUrl =
    typeof job.inputRefs.firstFrameImageUrl === "string"
      ? job.inputRefs.firstFrameImageUrl
      : undefined;

  const startedAt = Date.now();
  try {
    const taskId = await submitH3VideoTask(
      config,
      { prompt, firstFrameImageUrl },
      fetchImpl,
    );
    log(`task submitted (${taskId})`);

    const deadline = startedAt + (ports.timeoutMs ?? H3_TASK_TIMEOUT_MS);
    const interval = ports.pollIntervalMs ?? H3_POLL_INTERVAL_MS;
    let polls = 0;
    for (;;) {
      const state = await queryH3VideoTask(config, taskId, fetchImpl);
      polls++;

      if (state.phase === "succeeded") {
        const file = await retrieveH3VideoFile(config, state.fileId, fetchImpl);
        const upload = await ports.uploadOutput(job.id, file.bytes, file.mime);
        if (!upload.ok || !upload.assetId) {
          await ports.reportError(job.id, {
            reason: "output_upload_failed",
            detail: upload.detail ?? String(upload.status),
            providerTaskId: taskId,
          });
          return;
        }
        await ports.reportResult(job.id, {
          result: {
            outputAssetId: upload.assetId,
            outputKind: file.mime,
            model: config.model,
            provider: "minimax-official-api",
            providerTaskId: taskId,
          },
          usage: {
            fileBytes: file.bytes.byteLength,
            durationMs: Date.now() - startedAt,
            pollCount: polls,
            model: config.model,
          },
        });
        log(`succeeded (${file.bytes.byteLength} bytes, ${polls} polls)`);
        return;
      }

      if (state.phase === "failed") {
        await ports.reportError(job.id, {
          reason: "h3_provider_failed",
          detail: state.detail,
          providerTaskId: taskId,
        });
        return;
      }

      if (Date.now() >= deadline) {
        await ports.reportError(job.id, {
          reason: "h3_timeout",
          providerTaskId: taskId,
          waitedMs: Date.now() - startedAt,
          pollCount: polls,
        });
        return;
      }
      await sleep(interval);
    }
  } catch (error) {
    await ports.reportError(job.id, {
      reason: error instanceof H3ApiError ? "h3_api_error" : "h3_request_failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
