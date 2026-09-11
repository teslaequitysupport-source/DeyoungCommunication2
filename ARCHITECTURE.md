# Architecture

This document tracks the platform architecture and — more importantly —
what is actually implemented versus what is designed. Status words are
binding: IMPLEMENTED / TESTED / PARTIALLY TESTED / BLOCKED / NOT IMPLEMENTED /
REQUIRES EXTERNAL CREDENTIAL.

## Three planes (approved, unchanged)

The platform separates concerns into three failure-isolated planes so that
media traffic and GPU workloads never choke the control plane, and each plane
scales (and bills) on its own axis:

1. **Control plane** — system of record: auth, users, characters, sessions,
   jobs, consent, credits, moderation, audit, the AI Brain, admin console.
2. **Media plane** — LiveKit WebRTC SFU. Camera/mic transport, workers join
   rooms as participants (worker-as-participant pattern). Raw video never
   touches REST endpoints.
3. **Compute plane** — provider-independent GPU workers speaking the worker
   protocol (`WORKER-PROTOCOL.md`); models are entries in a capability
   registry, never hard-coded dependencies. MiniMax H3 is consumed through
   the official API only (approved decision #3: self-hosting H3 commercially
   requires written permission that we do not have).

## Current implementation (after Phase 2)

| Component | Technology | Status |
| --- | --- | --- |
| Web app / API | Next.js 16 App Router, TypeScript strict | TESTED |
| Auth | Better Auth 1.7 (email+password, signed session cookies) | TESTED |
| RBAC | 5 roles × granular permission strings, server-side only | TESTED (unit) |
| Database | PostgreSQL — PGlite embedded (dev), Neon (deploy) | TESTED (PGlite path); Neon path REQUIRES EXTERNAL CREDENTIAL |
| ORM / migrations | Drizzle ORM, committed SQL migrations | TESTED |
| Audit log | Append-only table, auth events wired | TESTED (auth events) |
| Job queue | jobs-table queue (FOR UPDATE SKIP LOCKED, idempotency keys) | TESTED |
| Worker protocol | Pull-based claim loop + failure recovery | TESTED |
| Failure reassignment | Every requeue path reroutes; orphaned-job re-router safety net (spec §7.6) | TESTED |
| Compute sleep system | Idle → SLEEP, wake handshake, WORKER_IDLE_SLEEP_MS (spec §45) | TESTED |
| Worker selection | §8 scoring: capability/health/load/latency/errors/region | TESTED |
| H3 job routing | `video.generate.h3` registry entry, `video.h3` capability gate | TESTED (routing only) — actual generation REQUIRES EXTERNAL CREDENTIAL |
| H3 official-API client | Env-gated worker-side client + executor (submit/poll/retrieve) | TESTED (faked transport) — live calls REQUIRE EXTERNAL CREDENTIAL |
| Media plane | LiveKit | NOT IMPLEMENTED (dev uses socket.io relay; LiveKit at deploy) |
| Object storage | Cloudflare R2 | NOT IMPLEMENTED (dev local object store) — REQUIRES EXTERNAL CREDENTIAL |
| Admin console | RBAC-gated routes | NOT IMPLEMENTED (Phase 3) |
| Mobile | Expo React Native | NOT IMPLEMENTED (Phase 4, per approved order) |

## Data model (Phase 2 migrations)

Migrations 0000–0002:

- **Auth (Better Auth shapes):** `users` (with `role`, `status` platform
  fields), `sessions`, `accounts`, `verifications`.
- **Audit:** `audit_log` — append-only, actor denormalized (email/role
  survive actor deletion per the Ch. 12 retention rules).
- **Worker registry:** `workers` — provider-independent identity,
  capabilities, models, heartbeats, plus the spec §45 sleep fields
  (`idle_since_at`, `wake_requested_at`).
- **Platform:** `characters`, `assets` (metadata + storage keys),
  `consent_records` (purpose-scoped, withdrawable), `live_sessions`
  (14-state machine), `jobs` (idempotency keys, usage, cost).

State machines are pg enums, so the database itself rejects invalid states
(e.g. a live session cannot be `HAPPY`); Drizzle's types reject them at
compile time as the first line of defense.

## Architectural rules carried forward from the approved report

- The Brain pipeline: LLM proposes structured tool requests; schema
  validation → authorization (DB role check) → policy engine (consent, plan,
  rate limits) → execution + audit. The LLM never executes anything (Phase 1+).
- Status shown to users is real backend state, never simulated progress.
- Providers are replaceable: workers behind the protocol, models behind the
  capability registry, media behind LiveKit client semantics, hosting behind
  Next.js portability.
- The database stores metadata; media objects live in R2.

## Phase roadmap (approved, Ch. 16)

P0 Foundations → P1 Vertical slice (characters, uploads, job system, one real
 dev worker, session state machine, minimal live studio) → P2 Compute reality
 (sleep system, worker selection, failure reassignment, H3 registry entry +
 official-API client/executor — DONE; RunPod invoker and live H3 generation
 REQUIRES EXTERNAL CREDENTIAL) → P3 Trust plane (moderation, admin console,
 MFA, rate limits) → P4 Mobile (Expo) → P5 Launch gate (legal, payments
 decision, hosting tier). Each phase exits only on TESTED status of its exit
 criteria.
