# Security

Security decisions follow the approved Phase-1 report (Ch. 11): when cheap
and secure conflict, secure wins — then a cheaper secure implementation is
found. This document states what is enforced **today** (Phase 0) and what is
explicitly deferred, so nothing is believed to exist that does not.

## Enforced in Phase 0 (TESTED)

- **Authentication** — Better Auth with email+password (scrypt hashing),
  HTTP-only session cookies that are **signed** (server verifies
  `token.signature` on every request; forged or unsigned tokens are
  rejected — covered by integration tests).
- **Role integrity** — `role` is a database column with enum values
  (`USER`, `MODERATOR`, `SUPPORT`, `ADMIN`, `SUPER_ADMIN`), defaulting to
  `USER`. It is a Better Auth additional field with `input: false`:
  **clients cannot set their own role at sign-up.** Server-side checks only.
- **RBAC** — granular permission strings (`workers:drain` ≠ `users:ban`);
  hierarchy invariants unit-tested (only SUPER_ADMIN holds `roles:assign`
  and `system:emergency`).
- **Audit trail** — append-only `audit_log`; every sign-up, sign-in and
  sign-out appends an entry with actor, outcome, and denormalized actor
  identity. Rows persist after actor deletion (legal retention).
- **SQL injection** — Drizzle parameterized queries everywhere; no
  string-built SQL. `db.execute` call sites use template parameters.
- **Type integrity** — TypeScript strict (`noImplicitAny`); build no longer
  ignores type errors (`next.config.ts: ignoreBuildErrors: false`).
- **Secrets** — `.env` is gitignored; `.env.example` is the documented
  contract; no secret is ever referenced by a client component.
- **CSRF/origin** — Better Auth origin checking against `baseURL` +
  `TRUSTED_ORIGINS` (comma-separated, wildcard-capable). Production must
  list real origins only.

## Designed, implemented in later phases (NOT YET ENFORCED)

- **Audit hardening** — Phase 3: revoke `UPDATE`/`DELETE` on `audit_log`
  at the database role level (today append-only by code convention).
- **MFA for admin surfaces** — Phase 3 (approved report Ch. 11).
- **Distributed rate limiting** — Phase 3 (Better Auth's built-in limiter
  covers auth endpoints in-process today).
- **Upload validation** — Phase 1: MIME/extension/magic-byte checks,
  quarantined processing, FFmpeg argument allowlists (user text never
  reaches argv).
- **Worker authentication** — Phase 1: rotatable worker credentials, hashed
  at rest (`workers.credential_hash`), capability validation at health
  checks, signed heartbeats.
- **Presigned URL ownership checks** — Phase 1 (R2 integration).

## Threat model summary (full matrix in the Phase-1 report Ch. 11)

| Threat | Primary control | Status |
| --- | --- | --- |
| Broken auth / session hijack | Better Auth signed cookies, revocation on sign-out | TESTED |
| Privilege escalation | Server-side RBAC; roles not client-settable | TESTED |
| SQL injection | Drizzle parameterization | TESTED |
| IDOR / BOLA | Ownership checks on every object access | Phase 1 (object routes) |
| XSS / CSRF | Framework output encoding; origin checks | TESTED (baseline), Phase 3 suite |
| Malicious uploads / FFmpeg abuse | Upload pipeline validation + sandbox | Phase 1 |
| Worker spoofing | Credential registry + health validation | Phase 1 |
| Prompt injection (Brain) | Tool allowlist + schema validation + policy veto | Phase 1 |

## Reporting

Security issues in this repository should be treated with the same severity
discipline as the approved plan: a blocking regression in a critical flow
stops a release. Disclosure guidance ships with the legal pages in Phase 5.

## Trust plane (P3, spec §26/§28/§30/§33)

- **Account states:** `ACTIVE / SUSPENDED / BANNED`. Suspension and ban revoke
  every active session immediately (no waiting for cookie expiry). Un-banning
  a BANNED account requires SUPER_ADMIN — reversing a ban is a higher bar
  than applying it. Sign-in is refused at session-creation time for
  non-ACTIVE accounts (`auth.sign_in.denied` audit rows), and any surviving
  session hitting a non-ACTIVE user is rejected (`account_suspended` /
  `account_banned`) as defense-in-depth.
- **MFA:** Better Auth twoFactor plugin (TOTP + hashed backup codes).
  MODERATOR, ADMIN and SUPER_ADMIN must hold a verified enrollment before
  using moderation/admin APIs (`mfa_required`). Read-only SUPPORT is exempt.
  Enrollment secrets are encrypted at rest with the server secret.
- **Moderation:** abuse reports with validated polymorphic targets and
  denormalized target users; decisions must document themselves; enforcement
  (warn/suspend/ban/content-removal) flows through one audited code path
  shared with admin user management. Reports survive reporter and target
  deletion (SET NULL), decisions survive forever.
- **Rate limits:** DB-backed fixed-window counters (`rate_limit_hits`), one
  atomic upsert per hit, enforced on reports (10/h), presign (30/h), jobs
  (30/h), sessions (10/h). Denied and invalid requests still count, so the
  limit boundary cannot be probed for free; responses carry `Retry-After`.
- **Admin surface:** search/inspect users (safe fields only — never password
  hashes or session tokens), status transitions with a guarded transition
  table, role changes (SUPER_ADMIN only, never on self, sessions revoked so
  demotions apply immediately), workers view, append-only audit view.
