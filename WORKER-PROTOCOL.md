# Worker Protocol (DESIGNED — implementation lands in Phase 1)

The compute plane is a fleet of authenticated GPU workers speaking one
provider-independent protocol. The control plane never knows whether a
worker is a RunPod pod, a future GPU host, or a development machine — it
knows a worker identity, its capabilities, and its health. This is what makes
provider replacement (RunPod → any host) a configuration change, not a
rewrite.

**Status: DESIGNED and approved (Phase-1 report Ch. 8). No implementation
exists yet.** The `workers` table in the Phase-0 schema is the registry this
protocol will operate on.

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
in the Phase-0 schema.

## Scheduler selection factors (approved Ch. 8)

Capability match, GPU type, VRAM, model compatibility, health, load,
latency, region, user plan, queue depth, and cost where the provider
reports it. Hard constraints: a live face task never routes to an
offline-only worker; an H3 generation job routes only to the H3 API
adapter. Selection is deterministic, unit-tested code.

## Failure recovery

Missed heartbeats → mark UNHEALTHY → stop assigning work → classify
in-flight jobs (retry idempotent jobs, hand off streamable sessions) →
record the incident on job and worker records → notify the session manager
so the user sees a recovering state, never a frozen one. Idempotency keys
make retries safe (unique constraint already enforced in the `jobs` table).

## Sleep system and cost control

Idle timeout → DRAIN → SLEEP (pod scales to zero; idle time costs nothing).
Wake-up is honest: capability check → wake → health check → model load →
ready → execute. Cold start is a real delay (tens of seconds to minutes);
the session UI presents real loading state from backend state, never a
fabricated progress bar.

## Dev-tier workers

Kaggle may register as a dev-tier worker for non-commercial experimentation
within its 30 GPU-hour weekly quota — never as a production backbone
(its terms restrict commercial use). A development machine registers
identically through the same protocol.
