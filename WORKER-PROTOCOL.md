# Worker Protocol (IMPLEMENTED — P0 registry, P1 claim loop, P2 sleep system)

The compute plane is a fleet of authenticated GPU workers speaking one
provider-independent protocol. The control plane never knows whether a
worker is a RunPod pod, a future GPU host, or a development machine — it
knows a worker identity, its capabilities, and its health. This is what makes
provider replacement (RunPod → any host) a configuration change, not a
rewrite.

**Status: IMPLEMENTED and TESTED.** The pull-based claim loop (REGISTER /
HEARTBEAT / CLAIM / STATUS / RESULT / ERROR) runs in `mini-services/worker-dev`
via `src/lib/worker-core`; the sleep/wake system (spec §45) landed in Phase 2
(`src/lib/workers/sleep.ts`, selection in `src/lib/workers/selection.ts`).
Push-style operations (RESERVE / HEALTH / LOAD_MODEL as control-initiated
HTTP) are deployment-tier work behind the same registry.

## Identity and credentials

- Workers authenticate with a **worker credential** issued by an
  administrator (rotatable; revocation takes effect immediately).
- Credentials are stored **hashed** (`workers.credential_hash`), never in
  plaintext.
- The worker announces a `version`; the control plane may refuse outdated
  workers at REGISTER.

## Operations

| Operation | Purpose | Direction |
| --- | --- | --- |
| REGISTER | Announce provider, GPU, VRAM, models, capabilities, version, region | Worker → Control |
| HEARTBEAT | Liveness + load, active jobs, latency; missed beats trigger failure handling | Worker → Control |
| HEALTH | On-demand deep check: memory, model availability, disk, errors | Control → Worker |
| CAPABILITIES | Full capability + model manifest refresh | Worker → Control |
| RESERVE | Hold a worker for an incoming job | Control → Worker |
| ALLOCATE | Bind job to worker; idempotency key attached | Control → Worker |
| LOAD_MODEL | Load required model into memory (validated against manifest) | Control → Worker |
| START / STOP | Begin or cease job execution (audited) | Control → Worker |
| STREAM | Worker joins the LiveKit room as participant; media flows in the media plane | Control ↔ Worker |
| STATUS | Per-job progress as real state, never fabricated | Worker → Control |
| RELEASE | Job finished; worker returns to idle | Control → Worker |
| DRAIN | Finish current jobs; accept no new work; then sleep or shut down | Control → Worker |
| SHUTDOWN | Clean termination | Worker → Control |
| ERROR / RESULT | Structured failure or completion payloads | Worker → Control |

## Worker lifecycle (state machine)

`IDLE → RESERVED → LOADING → READY → BUSY → IDLE`, with `DRAINING` (stop
taking work), `SLEEPING` (scaled to zero on RunPod — idle costs nothing),
`UNHEALTHY` (missed heartbeats; no new assignments), and `SHUTDOWN` as
terminal/managed states. All states exist as the `worker_status` pg enum
in the schema.

## Sleep / wake protocol (spec §45 — IMPLEMENTED, TESTED)

```
no job → IDLE → idle timeout (WORKER_IDLE_SLEEP_MS, default 2 min)
      → SLEEPING            (scheduler sleep sweep, audited)

job arrives → capability check → no awake worker?
      → wake_requested_at set on best sleeping worker (audited)
      → worker's next CLAIM poll completes the wake handshake
        (SLEEPING → IDLE; audited as worker.woke)
      → claim → RESERVED → RUNNING   (cold start is real state)
```

Rules that keep it honest:

- A sleeping worker that polls **without** a pending wake request receives
  `command: "sleep"` and stays asleep — nothing wakes itself by asking.
- Heartbeats from a SLEEPING worker update liveness fields but never change
  the status; only the wake handshake (pending request + poll) or a full
  REGISTER (a real boot) brings it back.
- SLEEPING is excluded from the heartbeat monitor, so a sleeping box is
  never falsely marked UNHEALTHY.
- The sleep sweep refuses workers with active jobs or in-flight
  (RESERVED/RUNNING) jobs — the SQL guard is atomic with the status write.
- Cold-start latency is surfaced, never hidden: the job stays QUEUED, the
  live session stays WAITING_FOR_WORKER, and `/api/health` reports
  `wakePending` so the console can say "cold start in flight".
- The provider-level wake call (RunPod pod resume, etc.) plugs into
  `requestWorkerWake(db, { workerId, jobId }, invokeWake)`. The dev
  transport deliberately has none — the worker's own claim poll completes
  the handshake.

## Scheduler selection factors (spec §8 — IMPLEMENTED, TESTED)

Capability match (hard), health (UNHEALTHY/SHUTDOWN/DRAINING excluded),
availability (awake preferred over sleeping), load (`active_jobs`), error
history, heartbeat latency, region/GPU/VRAM/model constraints where the
caller provides them. Selection is deterministic, unit-tested code
(`src/lib/workers/selection.ts`). Factors with no honest data yet — user
plan, per-provider queue depth, provider cost — are P5 work, never faked.
Hard constraints: a live face task never routes to an offline-only worker;
`video.generate.h3` routes only to a worker that REGISTERed `video.h3`
(verified official-API access).

## Failure recovery

Missed heartbeats → mark UNHEALTHY → stop assigning work → classify
in-flight jobs (retry idempotent jobs, hand off streamable sessions) →
record the incident on job and worker records → notify the session manager
so the user sees a recovering state, never a frozen one. Idempotency keys
make retries safe (unique constraint already enforced in the `jobs` table).

## Sleep system and cost control

Idle timeout → SLEEP (pod scales to zero; idle time costs nothing).
Wake-up is honest: capability check → wake → health check → model load →
ready → execute. Cold start is a real delay (tens of seconds to minutes);
the session UI presents real loading state from backend state, never a
fabricated progress bar. See the sleep/wake protocol section above for the
implemented handshake.

## Dev-tier workers

Kaggle may register as a dev-tier worker for non-commercial experimentation
within its 30 GPU-hour weekly quota — never as a production backbone
(its terms restrict commercial use). A development machine registers
identically through the same protocol.
