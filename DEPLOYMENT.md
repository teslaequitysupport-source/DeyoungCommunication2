# Deployment

Environments, the cost ladder, and runbooks. The cost philosophy is the
approved one: **$0 upfront → free tiers → pay-as-you-go → user-funded
usage; paid infrastructure only when justified** — and every cost that
cannot be engineered away is stated, not hidden.

## Railway deployment (primary — repo is Railway-ready)

The repository ships a complete Railway deployment set: `Dockerfile`
(Bun, multi-stage, standalone output), `railway.json` (build + health
check + restart policy), `.dockerignore`, and the container entrypoint
`scripts/deploy/start-web.sh` (migrations, then the standalone server).

### Quick start (web service)

1. Push this repo to GitHub, then in Railway: **New Project → Deploy from
   GitHub repo**. Railway detects the `Dockerfile` via `railway.json`.
2. Add the **Postgres** plugin to the same project. Railway exposes
   `DATABASE_URL` — use the internal URL
   (`postgres://…@postgres.railway.internal:5432/railway`, no SSL needed)
   or the external one (its `?sslmode=require` is honored by the app and
   the migrate script).
3. Set the service variables (Variables tab — or Redact/bulk import):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference) |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `BETTER_AUTH_URL` | your public Railway domain (`https://…up.railway.app`) |
   | `TRUSTED_ORIGINS` | same domain (comma-separated for extra origins) |
   | `STORAGE_TICKET_SECRET` | `openssl rand -hex 32` (local storage mode) |
   | `REALTIME_TICKET_SECRET` | `openssl rand -hex 32` (shared with the relay service) |
   | `SCHEDULER_TOKEN` | `openssl rand -hex 32` (shared with the scheduler service) |
   | `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_JURISDICTION` | real operator identity (spec §40 — never invented) |

4. Deploy. The container applies migrations on boot, then serves on
   `PORT` (set by Railway). Health: `GET /api/health` (Railway pings it
   per `railway.json`; the platform reports observed state only).
5. First admin: create an account, then promote the row in the `users`
   table (`role = 'SUPER_ADMIN'`) via SQL — role changes are audited.
   Enable MFA immediately after (required for elevated routes).

### Optional services from the same repo (Railway "New Service → GitHub",
same branch, different start command)

| Service | Start command | Notes |
| --- | --- | --- |
| media-relay (live studio transport) | `bun mini-services/media-relay/index.ts` | set `REALTIME_TICKET_SECRET` (same value as web); expose its port |
| control-scheduler (worker lifecycle) | `bun mini-services/control-scheduler/index.ts` | set `SCHEDULER_TOKEN` + `CONTROL_PLANE_URL` (the web service's internal URL) |
| worker (dev transform worker) | `bun mini-services/worker-dev/index.ts` | set `WORKER_NAME`, `WORKER_CREDENTIAL` (hash provisioned via `scripts/db/provision-worker.ts`), `CONTROL_PLANE_URL`, `MEDIA_RELAY_URL` |

Production GPU workers run off-platform on RunPod per WORKER-PROTOCOL.md;
the dev worker above is a capability-honest fallback.

### Notes

- Storage defaults to the local-dev object store (ticketed uploads) until
  `R2_*` variables are set — then uploads go direct to Cloudflare R2.
- `NEXT_PUBLIC_APP_URL` should match the public domain for canonical links.
- Single replica by default (`numReplicas: 1`) — the migration-on-boot
  pattern is safe at one replica; scale via Railway's release phase if
  you go multi-replica.

## Environments

| Environment | App | Database | Object storage | Media | GPU |
| --- | --- | --- | --- | --- | --- |
| Local dev (this repo) | `bun run dev` (port 3000) | Embedded Postgres (PGlite) at `db/platform-dev/` | — (Phase 1) | — (Phase 1) | — (Phase 1 dev worker) |
| CI (GitHub Actions) | — | In-memory PGlite per test run | — | — | — |
| Staging (Phase 1+) | Vercel preview / VPS | Neon branch | R2 dev bucket | LiveKit Cloud free tier | Dev worker |
| Production (Phase 5) | Vercel Pro / VPS / Railway (decision at launch) | Neon | R2 | LiveKit Cloud or self-host | RunPod pods |

Separate credentials per environment; migrations run through
`bun run db:migrate` (Drizzle migrator) before promotion.

## Database runbook

```bash
# After changing src/lib/db/schema.ts:
bun run db:generate     # writes drizzle/<n>_<name>.sql (commit this file)
bun run db:migrate      # applies pending migrations to the configured DB
```

- Local: PGlite file store; delete `db/platform-dev/` to reset.
- CI: tests build a fresh in-memory PGlite per suite and apply the same
  committed migrations — no service container, no drift.
- Deploy: set `DATABASE_URL` (Neon, `postgres://…?sslmode=require`) — it
  takes precedence over the embedded path.

## Cost ladder (verified September 2026 — re-verify at contracting)

**$0 development stack:** Vercel Hobby (non-commercial), Neon Free
(0.5 GB / 100 compute-hrs), Cloudflare R2 free (10 GB, zero egress),
LiveKit OSS self-host or Cloud free tier, Better Auth (OSS), PostHog Free,
Kaggle for non-commercial GPU experiments.

**Costs that arrive with commercial operation (cannot be engineered away):**

| Item | Cost | Needed |
| --- | --- | --- |
| Vercel Pro (or VPS/Railway) | $20/mo | Commercial launch — Hobby is non-commercial only |
| Apple Developer account | $99/yr | iOS app (Phase 4) |
| Google Play account | $25 once | Android app (Phase 4) |
| Custom domain | ~$10-15/yr | Launch |
| MiniMax H3 API | per request | Every production generation (API-only per decision #3) |
| RunPod GPU time | ~$0.16-0.27/hr (A5000 community) | Live sessions, batch jobs |
| Neon paid tier | when > free tier | Growth |
| Payment provider | TBD — requires verification for Nigeria | Before charging anyone (decision #5) |

## External credentials (REQUIRES EXTERNAL CREDENTIAL — no code substitutes)

- Neon production database URL
- Cloudflare R2 keys (Phase 1)
- LiveKit Cloud keys or a self-hosted LiveKit server (Phase 1)
- RunPod API token (Phase 2)
- MiniMax API key (Phase 2)
- Apple / Google developer accounts (Phase 4)
- Domain registrar + DNS (Phase 5)

## Operations (what exists today)

- `GET /api/health` — observed state only: database reachability, latency,
  timestamp. Never a fabricated "ok".
- Worker heartbeat and health telemetry surface in the admin console in
  Phase 3.
- Audit log is the security evidence trail (auth events today; admin and
  Brain events as those land).

## Incident runbook (planned items land with their phases)

- Kill a provider → capability switch in the registry (Phase 2)
- Drain workers → `DRAIN` operation per WORKER-PROTOCOL.md (Phase 1)
- Roll back a deploy → platform-level (Vercel instant rollback / VPS redeploy)
- Restore database → Neon point-in-time recovery
- Emergency controls → admin console with mandatory audit entries (Phase 3)

## Mobile app (P4)

The Expo app lives in `mobile/` (see its README). Deployment notes:

- Point it at the platform via `API_URL` (`mobile/app.config.js` reads it;
  default targets the Android emulator host `10.0.2.2:3000`).
- The app authenticates with the platform's signed session cookie stored in
  `expo-secure-store`. Add the app origin (Expo Go `exp://…` URL or the
  `livechar://` scheme on a dev build) to `TRUSTED_ORIGINS` exactly like
  any other trusted client.
- The dev media relay is expected on the API host's port 3031; in
  production, put the relay behind the same domain (path or subdomain) and
  update `relayUrl()` in `mobile/src/lib/api.ts`.
- Builds: `npx expo prebuild` + native build (EAS or local). The code has
  NOT been compiled in the sandbox environment — run one `expo start`
  integration pass before shipping (honest status, per the build spec).

## Production build gate (P6)

`bun run build` (Next.js 16 + Turbopack) compiles all routes, type-checks
the app, and emits the standalone server. It is part of the per-deploy
gate alongside lint and the full test suite. The `mobile/` tree is
excluded from the web app's tsconfig/eslint on purpose — it has its own
toolchain and its own `tsc --noEmit`.
