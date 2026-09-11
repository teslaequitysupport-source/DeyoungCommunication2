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

## Current implementation (Phase 0)

| Component | Technology | Status |
| --- | --- | --- |
| Web app / API | Next.js 16 App Router, TypeScript strict | TESTED |
| Auth | Better Auth 1.7 (email+password, signed session cookies) | TESTED |
| RBAC | 5 roles × granular permission strings, server-side only | TESTED (unit) |
| Database | PostgreSQL — PGlite embedded (dev), Neon (deploy) | TESTED (PGlite path); Neon path REQUIRES EXTERNAL CREDENTIAL |
| ORM / migrations | Drizzle ORM, committed SQL migrations | TESTED |
| Audit log | Append-only table, auth events wired | TESTED (auth events) |
| Job queue | pgboss on Postgres | NOT IMPLEMENTED (Phase 1) |
| Media plane | LiveKit | NOT IMPLEMENTED (Phase 1) |
| Object storage | Cloudflare R2 | NOT IMPLEMENTED (Phase 1) |
| GPU workers | Worker protocol implementation | DESIGNED — see WORKER-PROTOCOL.md |
| Admin console | RBAC-gated routes | NOT IMPLEMENTED (Phase 3) |
| Mobile | Expo React Native | NOT IMPLEMENTED (Phase 4, per approved order) |

## Data model (Phase 0 migration)

Eleven tables, one migration (`drizzle/0000_*.sql`):

- **Auth (Better Auth shapes):** `users` (with `role`, `status` platform
  fields), `sessions`, `accounts`, `verifications`.
- **Audit:** `audit_log` — append-only, actor denormalized (email/role
  survive actor deletion per the Ch. 12 retention rules).
- **Worker registry:** `workers` — provider-independent identity,
  capabilities, models, heartbeats.
- **Platform:** `characters`, `assets` (metadata + R2 storage keys, Phase 1),
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

P0 Foundations → P1 Vertical slice (characters, R2 uploads, job system,
one real dev worker, LiveKit, session state machine, minimal live studio) →
P2 Compute reality (RunPod sleep system, H3 via API, scheduler) →
P3 Trust plane (moderation, admin console, MFA, rate limits) →
P4 Mobile (Expo) → P5 Launch gate (legal, payments decision, hosting tier).
Each phase exits only on TESTED status of its exit criteria.
