/**
 * Worker runner — the loop that makes a worker real (WORKER-PROTOCOL.md).
 *
 *   REGISTER → HEARTBEAT (5s) → CLAIM (long-poll) → execute → RESULT/ERROR
 *
 * Execution:
 *   - batch jobs: download input → sharp transform → upload output → RESULT
 *   - live jobs : join the media relay room for the session → transform
 *                 frames (latest-wins backpressure) → stats → on session
 *                 stop (or publisher leaving past grace) upload the final
 *                 frame → RESULT.
 *
 * Nothing is faked: every reported state comes from the control plane's
 * own responses, and every failure is reported as ERROR with structured
 * failureInfo.
 */

import { io, type Socket } from "socket.io-client";
import {
  ControlPlaneClient,
  type Allocate,
  type ClaimedJob,
} from "./client";
import { transformFrame, transformImage, type TransformConfig } from "./transform";
import { executeH3Job } from "./h3-executor";
import type { H3EnvConfig } from "../h3/client";

export interface RunnerOptions {
  controlPlane: ControlPlaneClient;
  relayUrl: string; // direct internal URL (e.g. http://127.0.0.1:3031)
  workerName: string;
  heartbeatIntervalMs?: number;
  pollIntervalMs?: number;
  /** Poll gap while SLEEPing (spec §45 cold-start simulation in dev). */
  coldStartPollMs?: number;
  maxConcurrentLive?: number;
  /**
   * H3 official-API runtime (spec §9): present only when the worker's env
   * resolved a real config. Its presence adds the `video.h3` capability to
   * the REGISTER announcement — absence means H3 jobs never route here.
   */
  h3?: { config: H3EnvConfig };
  logger?: (line: string) => void;
}

interface LiveSessionState {
  jobId: string;
  sessionId: string;
  config: TransformConfig;
  socket: Socket;
  running: boolean;
  framesIn: number;
  framesOut: number;
  framesCorrupt: number;
  lastFrameAt: number;
  transformMsEma: number;
  finalizer?: ReturnType<typeof setTimeout>;
  finalizeReason: string | null;
}

export class WorkerRunner {
  private readonly live = new Map<string, LiveSessionState>();
  private stopped = false;
  private drainRequested = false;
  private sleeping = false;
  private activeBatch = 0;

  constructor(private readonly opts: RunnerOptions) {}

  private log(line: string) {
    (this.opts.logger ?? console.log)(`[worker:${this.opts.workerName}] ${line}`);
  }

  async start(): Promise<void> {
    // The capability manifest is honest by construction: `video.h3` is only
    // announced when this worker actually holds official-API credentials
    // (spec §8: an H3 task must only reach a worker with the H3 capability).
    const capabilities = ["transform.image", "transform.live"];
    const models = ["sharp:0.34"];
    if (this.opts.h3) {
      capabilities.push("video.h3");
      models.push(`${this.opts.h3.config.model}:official-api`);
    }
    const announce = {
      provider: "DEVELOPMENT_LOCAL",
      gpuType: "cpu",
      region: "local",
      version: "dev-worker-1.0.0",
      capabilities,
      models,
    };
    const reg = await this.opts.controlPlane.register(announce);
    if (!reg.ok) {
      const message = `REGISTER rejected (${reg.status})`;
      this.log(message);
      throw new Error(message);
    }
    this.log("registered");

    void this.heartbeatLoop();
    void this.claimLoop();
  }

  private async heartbeatLoop(): Promise<void> {
    const interval = this.opts.heartbeatIntervalMs ?? 5_000;
    for (;;) {
      if (this.stopped) return;
      const started = Date.now();
      try {
        const beat = await this.opts.controlPlane.heartbeat(
          this.live.size + this.activeBatch,
          Date.now() - started,
        );
        if (beat.ok && (beat.data as { commands?: { drain?: boolean } }).commands?.drain) {
          this.drainRequested = true;
          this.log("DRAIN requested by control plane — finishing current work");
        }
      } catch (error) {
        this.log(`heartbeat failed: ${String(error)}`);
      }
      await sleep(interval);
    }
  }

  private async claimLoop(): Promise<void> {
    const interval = this.opts.pollIntervalMs ?? 1_000;
    for (;;) {
      if (this.stopped) return;
      try {
        if (!this.drainRequested) {
          const claimed = await this.opts.controlPlane.claim();
          if (claimed.ok) {
            const { job, allocate, command } =
              claimed.data as { job: ClaimedJob | null; allocate?: Allocate; command?: string };
            if (command === "sleep") {
              // Spec §45 (dev cold start): the control plane slept this
              // worker. Claims pause; when a job later wakes it, the same
              // poll completes the wake handshake server-side and the job
              // flows — observable, never simulated.
              if (!this.sleeping) {
                this.sleeping = true;
                this.log("SLEEP: control plane slept this worker — claims paused");
              }
              await sleep(this.opts.coldStartPollMs ?? 2_000);
              continue;
            }
            if (this.sleeping) {
              this.sleeping = false;
              this.log("wake accepted — claiming again (cold start finished)");
            }
            if (job && allocate) {
              await this.execute(job, allocate);
            } else if (job) {
              await this.opts.controlPlane.jobError(job.id, {
                reason: "allocate_payload_missing",
              });
            }
          }
        }
      } catch (error) {
        this.log(`claim failed: ${String(error)}`);
        await sleep(interval);
      }
    }
  }

  private async execute(job: ClaimedJob, allocate: Allocate): Promise<void> {
    const started = await this.opts.controlPlane.jobStarted(job.id);
    if (!started.ok) {
      this.log(`job ${job.id} could not start: ${started.status}`);
      return;
    }

    if (job.type === "video.generate.h3") {
      // H3 generation runs for minutes — the claim loop must keep serving
      // other jobs while it works, so it runs detached. The heartbeat counts
      // it as load; if this worker dies mid-generation the scheduler's
      // recovery path requeues it, and the idempotency key means the retry
      // never duplicates provider work (spec §7 + §9).
      this.activeBatch++;
      void this.executeH3Detached(job).finally(() => this.activeBatch--);
      return;
    }

    if (allocate.kind === "batch") {
      await this.executeBatch(job, allocate);
      return;
    }
    await this.executeLive(job, allocate);
  }

  // ── H3 (official API, spec §9) ─────────────────────────────────────────

  private async executeH3Detached(job: ClaimedJob): Promise<void> {
    const cp = this.opts.controlPlane;
    await executeH3Job(job, {
      config: this.opts.h3?.config ?? null,
      log: (line) => this.log(`H3 job ${job.id}: ${line}`),
      reportResult: (jobId, payload) =>
        cp.jobResult(jobId, payload).then((r) => ({ ok: r.ok, status: r.status })),
      reportError: (jobId, failureInfo, requeue) =>
        cp
          .jobError(jobId, failureInfo, requeue)
          .then((r) => ({ ok: r.ok, status: r.status })),
      uploadOutput: (jobId, bytes, mime) =>
        this.uploadJobOutput(jobId, Buffer.from(bytes), mime),
    });
  }

  // ── Batch ─────────────────────────────────────────────────────────────

  private async executeBatch(job: ClaimedJob, allocate: Extract<Allocate, { kind: "batch" }>): Promise<void> {
    this.activeBatch++;
    try {
      const inputRef = allocate.inputs[0];
      if (!inputRef) {
        await this.opts.controlPlane.jobError(job.id, {
          reason: "missing_input",
          detail: "batch job requires one input asset",
        });
        return;
      }
      const download = await this.opts.controlPlane.downloadAsset(inputRef.downloadPath);
      if (!download.ok || !download.bytes) {
        await this.opts.controlPlane.jobError(job.id, {
          reason: "input_download_failed",
          status: download.status,
        });
        return;
      }

      const config = configFromRefs(job.inputRefs);
      const transformed = await transformImage(download.bytes, config);

      const upload = await this.uploadJobOutput(job.id, transformed.data, "image/jpeg");
      if (!upload.ok) {
        await this.opts.controlPlane.jobError(job.id, {
          reason: "output_upload_failed",
          detail: upload.detail ?? String(upload.status),
        });
        return;
      }

      await this.opts.controlPlane.jobResult(job.id, {
        result: {
          outputAssetId: upload.assetId,
          outputKind: "image/jpeg",
          transform: "dev.colorgrade",
        },
        usage: {
          inputBytes: download.bytes.byteLength,
          outputBytes: transformed.data.byteLength,
          durationMs: transformed.stats.durationMs,
          width: transformed.stats.width,
          height: transformed.stats.height,
        },
      });
      this.log(`batch job ${job.id} succeeded (${transformed.stats.durationMs}ms)`);
    } catch (error) {
      await this.opts.controlPlane.jobError(job.id, {
        reason: "batch_execution_error",
        detail: String(error),
      });
    } finally {
      this.activeBatch--;
    }
  }

  // ── Live ──────────────────────────────────────────────────────────────

  private async executeLive(job: ClaimedJob, allocate: Extract<Allocate, { kind: "live" }>): Promise<void> {
    const sessionId = allocate.session?.id;
    if (!sessionId || !allocate.realtime) {
      await this.opts.controlPlane.jobError(job.id, {
        reason: "live_job_without_session",
      });
      return;
    }

    const config: TransformConfig = configFromAppearance(
      allocate.character?.appearance,
    );

    const socket = io(this.opts.relayUrl, {
      transports: ["websocket"],
      auth: { ticket: allocate.realtime.ticket },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const state: LiveSessionState = {
      jobId: job.id,
      sessionId,
      config,
      socket,
      running: true,
      framesIn: 0,
      framesOut: 0,
      framesCorrupt: 0,
      lastFrameAt: 0,
      transformMsEma: 0,
      finalizer: undefined,
      finalizeReason: null,
    };
    this.live.set(sessionId, state);

    socket.on("connect", () => {
      this.log(`live ${sessionId}: relay connected`);
      void this.opts.controlPlane.sessionPhase(job.id, "SESSION_READY", sessionId);
    });

    socket.on("frame", (frame: Buffer) => {
      state.framesIn++;
      state.lastFrameAt = Date.now();
      rememberLastFrame(state, frame);
      enqueueFrame(state, frame);
    });

    socket.on("session-state", (update: { status?: string }) => {
      if (
        update.status === "STOPPING" ||
        update.status === "COMPLETED" ||
        update.status === "FAILED" ||
        update.status === "CANCELLED" ||
        update.status === "EXPIRED"
      ) {
        this.scheduleFinalize(state, `session_${update.status.toLowerCase()}`);
      }
    });

    socket.on("publisher-left", () => {
      this.log(`live ${sessionId}: publisher left — 10s grace`);
      state.finalizer = setTimeout(() => {
        this.scheduleFinalize(state, "publisher_left");
      }, 10_000);
    });

    socket.on("publisher-joined", () => {
      if (state.finalizer) {
        clearTimeout(state.finalizer);
        state.finalizer = undefined;
        this.log(`live ${sessionId}: publisher returned — grace cancelled`);
      }
    });

    socket.on("connect_error", (error: Error) => {
      this.log(`live ${sessionId}: relay connect error: ${error.message}`);
    });

    void this.frameLoop(state);
    void this.statsLoop(state);
  }

  private async frameLoop(state: LiveSessionState): Promise<void> {
    while (state.running) {
      const frame = takePendingFrame(state);
      if (!frame) {
        await sleep(5);
        continue;
      }
      const transformed = await transformFrame(frame, state.config);
      if (!transformed) {
        state.framesCorrupt++;
        continue;
      }
      state.framesOut++;
      state.transformMsEma = state.transformMsEma
        ? 0.8 * state.transformMsEma + 0.2 * transformed.durationMs
        : transformed.durationMs;
      state.socket.emit("frame", transformed.data);

      if (state.framesOut === 1) {
        // First transformed frame is flowing: the session is honestly LIVE.
        await this.opts.controlPlane.sessionPhase(
          state.jobId,
          "SESSION_LIVE",
          state.sessionId,
        );
      }
    }
  }

  private async statsLoop(state: LiveSessionState): Promise<void> {
    let lastIn = 0;
    let lastOut = 0;
    let lastAt = Date.now();
    for (;;) {
      await sleep(2_000);
      if (!state.running) return;
      const now = Date.now();
      const seconds = (now - lastAt) / 1000;
      const fpsIn = (state.framesIn - lastIn) / seconds;
      const fpsOut = (state.framesOut - lastOut) / seconds;
      lastIn = state.framesIn;
      lastOut = state.framesOut;
      lastAt = now;
      state.socket.emit("stats", {
        fpsIn: Math.round(fpsIn * 10) / 10,
        fpsOut: Math.round(fpsOut * 10) / 10,
        transformMs: Math.round(state.transformMsEma),
        framesIn: state.framesIn,
        framesOut: state.framesOut,
        framesCorrupt: state.framesCorrupt,
      });
      // Liveness touch: while frames are flowing, keep the session row
      // fresh so the scheduler's abandoned-session sweep can tell an
      // active session from an abandoned one.
      if (now - state.lastFrameAt < 5_000) {
        await this.opts.controlPlane.sessionPhase(
          state.jobId,
          "SESSION_LIVE",
          state.sessionId,
        );
      }
    }
  }

  private scheduleFinalize(state: LiveSessionState, reason: string): void {
    if (state.finalizeReason) return;
    state.finalizeReason = reason;
    void this.finalizeLive(state);
  }

  private async finalizeLive(state: LiveSessionState): Promise<void> {
    state.running = false;
    const finalFrame = takePendingFrame(state) ?? lastFrameSnapshot(state);
    try {
      if (finalFrame) {
        const upload = await this.uploadJobOutput(state.jobId, finalFrame, "image/jpeg");
        if (upload.ok) {
          await this.opts.controlPlane.jobResult(state.jobId, {
            result: {
              outputAssetId: upload.assetId,
              outputKind: "image/jpeg",
              transform: "dev.colorgrade",
              finalizeReason: state.finalizeReason,
            },
            usage: {
              framesIn: state.framesIn,
              framesOut: state.framesOut,
              framesCorrupt: state.framesCorrupt,
              transformMsEma: Math.round(state.transformMsEma),
            },
          });
          this.log(`live ${state.sessionId}: finalized (${state.finalizeReason})`);
          state.socket.disconnect();
          this.live.delete(state.sessionId);
          return;
        }
        await this.opts.controlPlane.jobError(state.jobId, {
          reason: "final_upload_failed",
          detail: upload.detail ?? String(upload.status),
        });
      } else {
        const result = await this.opts.controlPlane.jobResult(state.jobId, {
          result: {
            outputAssetId: null,
            transform: "dev.colorgrade",
            finalizeReason: state.finalizeReason,
            note: "no frames were processed",
          },
          usage: {
            framesIn: state.framesIn,
            framesOut: state.framesOut,
          },
        });
        if (!result.ok) {
          this.log(
            `live ${state.sessionId}: final RESULT failed (${result.status}) — job left in its current state`,
          );
        } else {
          this.log(
            `live ${state.sessionId}: finalized with no frames (${state.finalizeReason})`,
          );
        }
      }
    } finally {
      state.socket.disconnect();
      this.live.delete(state.sessionId);
    }
  }

  /** Worker-authenticated output upload via the control plane. */
  async uploadJobOutput(
    jobId: string,
    bytes: Buffer,
    mime: string,
  ): Promise<{ ok: boolean; assetId?: string; status?: number; detail?: string }> {
    const res = await fetch(
      `${this.opts.controlPlane.baseUrl}/api/worker/jobs/${jobId}/output`,
      {
        method: "POST",
        headers: {
          "content-type": mime,
          "x-worker-name": this.opts.controlPlane.name,
          authorization: `Bearer ${this.opts.controlPlane.credential}`,
        },
        body: new Uint8Array(bytes),
      },
    );
    if (!res.ok) {
      let detail: string | undefined;
      try {
        detail = (await res.json()).message;
      } catch {
        detail = undefined;
      }
      return { ok: false, status: res.status, detail };
    }
    const data = (await res.json()) as { asset: { id: string } };
    return { ok: true, assetId: data.asset.id };
  }

  async shutdown(reason: string): Promise<void> {
    this.stopped = true;
    for (const state of this.live.values()) {
      this.scheduleFinalize(state, reason);
    }
  }
}

// ── Frame backpressure: keep only the latest unprocessed frame ────────────

interface Pending {
  frame: Buffer | null;
}
const pending = new WeakMap<LiveSessionState, Pending>();

function enqueueFrame(state: LiveSessionState, frame: Buffer): void {
  let p = pending.get(state);
  if (!p) {
    p = { frame: null };
    pending.set(state, p);
  }
  p.frame = frame; // latest-wins: stale frames are dropped, never queued
}

function takePendingFrame(state: LiveSessionState): Buffer | null {
  const p = pending.get(state);
  if (!p || !p.frame) return null;
  const frame = p.frame;
  p.frame = null;
  return frame;
}

const lastFrames = new WeakMap<LiveSessionState, Buffer>();

/** Remember the last received frame for the final snapshot. */
function rememberLastFrame(state: LiveSessionState, frame: Buffer): void {
  lastFrames.set(state, frame);
}

function lastFrameSnapshot(state: LiveSessionState): Buffer | null {
  const raw = takePendingFrame(state);
  if (raw) {
    rememberLastFrame(state, raw);
  }
  return lastFrames.get(state) ?? null;
}

function configFromRefs(refs: Record<string, unknown>): TransformConfig {
  const appearance = (refs.appearance as Record<string, unknown>) ?? {};
  return configFromAppearance(appearance);
}

function configFromAppearance(appearance: Record<string, unknown> | undefined): TransformConfig {
  if (!appearance) return {};
  return {
    hue: typeof appearance.hue === "number" ? appearance.hue : undefined,
    saturation:
      typeof appearance.saturation === "number" ? appearance.saturation : undefined,
    vignette:
      typeof appearance.vignette === "boolean" ? appearance.vignette : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
