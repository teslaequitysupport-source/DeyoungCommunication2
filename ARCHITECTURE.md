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
| Admin console | RBAC-gated routes + console UI (users, moderation, workers, audit, MFA) | TESTED (integration + live smoke) |
| Moderation | Abuse reports (§33), moderator decisions with enforcement, documented outcomes | TESTED |
| MFA (TOTP) | Better Auth twoFactor plugin; required for MODERATOR/ADMIN/SUPER_ADMIN surfaces | TESTED (real TOTP round-trip) |
| Rate limits | DB-backed fixed windows on reports/presign/jobs/sessions/export/delete; denied hits still count | TESTED |
| Credits (§41) | Append-only `credit_ledger` (advisory-locked, exactly-once), signup bonus, job spend gate, automatic refunds on terminal failure/cancel/expiry, audited admin grants | TESTED (integration + live smoke) |
| Account deletion (§35) | Real hard delete: storage objects + cascade; reports/audit survive de-linked; final audit row | TESTED (integration + live smoke) |
| Data export (§35) | Full subject-access JSON incl. media links; secrets excluded; rate-limited + audited | TESTED |
| Retention (§35) | Env-configured windows; scheduler-throttled sweep (~daily); consent evidence outlives media | TESTED |
| Legal pages (§40) | 9 pages, env-driven operator block (never invented), privacy page renders the real data map | TESTED (structure + live smoke) |
| In-app docs (§49/§50) | /help (16 topics) + staff-only /help/admin | TESTED (live smoke) |
| Mobile | Expo React Native | Phase 4 — see mobile/ (code delivered; device build/run requires the Expo toolchain, not verifiable in this sandbox) |

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
 MFA, rate limits — DONE) → P5 Launch gates (legal pages, privacy workflows:
 deletion/export/retention, credits with manual grants + automatic refunds,
 in-app docs — DONE) → P4 Mobile (Expo app delivered under mobile/; device
 verification pending the Expo toolchain). Each phase exits only on TESTED
 status of its exit criteria.

## Credits & privacy subsystems (P5)

- **Credits** (`src/lib/credits.ts`): append-only ledger; balance is always
  `SUM(delta)`; every mutation runs under a per-user transaction advisory
  lock with a unique idempotency key (spends `spend:<jobId>`, refunds
  `refund:<jobId>`, grants `admin-grant:<clientKey>`), so concurrent submits
  cannot overdraw and retries never double-charge. Costs are env-overridable
  (`CREDITS_COST_*`); the signup bonus (`SIGNUP_BONUS_CREDITS`) is granted by
  the auth user-create hook.
- **Refund wiring:** terminal `failJob`, `cancelJob`, reservation-expiry
  exhaustion, session-expiry cancels, and abandoned-session expiries all
  refund the job's spend exactly once. The credits gate at job intake rejects
  unpaid jobs terminally (`insufficient_credits`) WITHOUT charging.
- **Account deletion** (`src/lib/privacy/account.ts`): password + typed
  confirmation via Better Auth `verifyPassword`; storage objects deleted
  first (best-effort, counted), user row cascades the rest; reports/audit
  survive de-linked (`ON DELETE SET NULL`); one final `account.delete` audit
  row proves the action.
- **Retention** (`src/lib/privacy/retention.ts`): env windows
  (`RETENTION_*_DAYS`, 0 = keep forever); sweep deletes old assets
  (objects first), ended sessions, terminal jobs, closed reports, audit rows,
  expired sessions/verifications. `consent_records.asset_id` was migrated to
  `ON DELETE SET NULL` (0006) so consent evidence outlives media — a
  deliberate privacy-accountability tradeoff. The scheduler tick runs the
  sweep throttled (~23h) and audits each run.
