# AI Live Character Platform

Web platform for consent-based, real-time AI character transformation —
control plane, media plane, and GPU compute plane, per the approved
Phase-1 architecture report.

- **Phase:** 0 — Foundations (of the 6-phase approved plan)
- **Status vocabulary:** IMPLEMENTED / TESTED / PARTIALLY TESTED / BLOCKED /
  NOT IMPLEMENTED / REQUIRES EXTERNAL CREDENTIAL — never a bare "done".

## Phase 0 status board

| Exit criterion (approved report, Ch. 16) | Status |
| --- | --- |
| Repo scaffolding, TypeScript strict (`noImplicitAny`) | TESTED |
| Drizzle schema + migrations: users, sessions, jobs, consent, audit | TESTED (31 tests, in-memory Postgres) |
| Better Auth: email+password, sessions, RBAC roles | TESTED (12 integration tests, real DB) |
| `.env.example` | IMPLEMENTED |
| CI pipeline | IMPLEMENTED — runs on first push to GitHub (external) |

Not yet started (by design, per the approved phase order): vertical slice,
GPU worker, LiveKit media plane, R2 uploads, admin console, mobile.

## Quickstart

```bash
bun install
cp .env.example .env            # then set AUTH_SECRET (openssl rand -hex 32)
bun run db:migrate               # applies ./drizzle to embedded Postgres (PGlite)
bun run dev                      # http://localhost:3000
```

### Database

- **Local dev:** embedded Postgres (PGlite) — real Postgres semantics,
  file-persisted under `db/platform-dev/`. No server to install.
- **Deployment:** Neon Postgres. Set `DATABASE_URL` (takes precedence).
  Same schema and migrations for both paths.

### Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Next.js dev server (port 3000) |
| `bun run lint` | ESLint (next/core-web-vitals + TS rules) |
| `bun run typecheck` | `tsc --noEmit`, strict |
| `bun run test` | Vitest — unit + integration (fresh in-memory Postgres) |
| `bun run db:generate` | Generate a SQL migration from schema changes |
| `bun run db:migrate` | Apply migrations to the configured database |

## Repository layout

```
src/
  app/
    page.tsx                  P0 verification console (the app surface)
    api/auth/[...all]/       Better Auth handler
    api/health/               DB health endpoint (observed state only)
  lib/
    db/schema.ts              Control-plane schema (11 tables, state-machine enums)
    db/index.ts               DB client: PGlite (dev) / node-postgres (deploy)
    auth.ts                   Better Auth factory + singleton, audit hooks
    auth-client.ts            Client auth handle (type-safe)
    rbac.ts                   Roles, granular permissions, assertions
    audit.ts                  Append-only audit service
drizzle/                      Generated SQL migrations (committed)
scripts/db/                   Migrate + verification utilities
tests/                        Vitest suites (rbac, auth, schema)
.github/workflows/ci.yml      lint + typecheck + test
```

## Documentation

- `ARCHITECTURE.md` — three-plane design and current implementation status
- `SECURITY.md` — threat model, RBAC, audit, secrets
- `WORKER-PROTOCOL.md` — GPU worker protocol (DESIGNED, lands in Phase 1)
- `DEPLOYMENT.md` — environments, cost ladder, runbooks

The full Phase-1 audit/research/architecture report (26 pp) is the approval
basis for everything in this repo; the six approval decisions of its
Chapter 18 were given on 2026-09-11.
