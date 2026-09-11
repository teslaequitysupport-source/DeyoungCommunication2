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
