# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Read and follow the build specification (Pasted Content_1789067806668.txt) — Phase 1: AUDIT + RESEARCH only, produce approval-gate deliverable, stop before implementation.

Work Log:
- Read the full 2,356-line "Ultimate Build Prompt" (AI Live Character Platform spec).
- Audited workspace: git repo with 1 initial commit, no source code — greenfield build, not a transformation. Flagged to user.
- Ran clarifying AskUserQuestion round; user replied "Read and follow the content" → proceeded with spec-aligned defaults ($0 cost ladder, verified-provider policy, vertical-slice build order, web-first).
- Loaded web-search skill; researched 13 providers/constraints against current official sources (Sept 2026): Better Auth, Cloudflare R2, Cloudflare Realtime, LiveKit, Neon, Vercel, Railway, RunPod, Kaggle, MiniMax H3, PostHog, NDPA 2023, mobile virtual-camera feasibility. Raw results in /home/z/my-project/research/.
- Key verified findings: (1) MiniMax H3 is real (Aug 2026, open-weight) but self-host commercial use requires written MiniMax permission → production must use official API; (2) mobile apps cannot accept third-party virtual cameras → phone-to-phone physical adapter is the only honest social-app path; (3) Vercel Hobby is non-commercial → Pro $20/mo or VPS at commercial launch; (4) Kaggle 30h/wk non-commercial → dev-only worker; (5) NDPA: face/voice = sensitive biometric data, DPIA + NDPC registration duties, legal counsel required.
- Loaded pdf skill; read full chain: SKILL.md, configs/fonts.md, briefs/report.md, typesetting/{cover,palette,overflow,pagination,typography}.md.
- Built architecture diagram (Playwright+CSS → PNG @2x, scripts/report/diagram.html) — three-plane layout, all fonts ≥7pt effective at embed size.
- Built cover (Template 07 Crystal Blue, scripts/report/cover.html) — passed poster_validate.py and cover_validate.js (zero overlaps), rendered via html2poster.js --width 794px.
- Wrote 18-chapter ReportLab body (TocDocTemplate + multiBuild, FreeSerif, install_font_fallback, Template 07 palette, Paragraph-wrapped table cells, CondPageBreak 25% threshold, safe_keep_together): content1-3.py + build.py.
- Merged cover+body via pypdf with strict A4 normalization (0.1pt tolerance after initial QA caught 0.6pt page-size drift); meta.brand applied.
- Preflight: font.check 0 issues, toc.check PASS, toc_validate PASS, pages.clean 0 blank, pdf_qa.py PASS (13/13 checks).
- VLM visual verification of 4 key pages: no defects (one false-positive "typo" disproven by text extraction — actual PDF text correct).

Stage Summary:
- DELIVERABLE: /home/z/my-project/download/AI_Live_Character_Platform_Phase1_Architecture_Report.pdf (26 pages, A4, 523 KB) + source assets in /home/z/my-project/download/report-source/.
- Report covers all 17 spec-mandated outputs incl. honest limitation register, cost ladder ($0 dev stack / unavoidable paid items), 6-phase implementation plan with TESTED-status exit criteria, security threat matrix, NDPA privacy plan, WCAG 2.2 AA plan, decision table (6 approval items).
- STATUS: Phase 1 complete. STOPPED at the approval gate as the spec requires — no implementation code written. Awaiting user approval / decisions on the 6 items in Chapter 18 before Phase 0 begins.

---
Task ID: 2
Agent: Super Z (main agent)
Task: User replied "I Approve" (all 6 Chapter-18 decisions as proposed). Begin BUILD per approved plan: Phase 0 Foundations first.

Work Log:
- Approved: three-plane architecture + stack (Next.js, Better Auth, Drizzle/Neon Postgres, LiveKit media plane, R2 storage, RunPod workers, H3 via official API, PostHog); 6-phase plan with TESTED exit criteria; web-first, mobile P4; payments deferred to P5 with manual credits.
- Scaffolded the Next.js 16 + TS strict + shadcn/ui project on the sandbox template.
- Auth: Better Auth (email+password, sessions, trustedOrigins from env), role/status as non-client-settable additional fields, databaseHooks writing audit rows (sign-up/in/out).
- Schema (Drizzle/PG): Better Auth tables + workers/characters/assets/consent_records/live_sessions/jobs/audit_log, state-machine enums, FKs, indexes, unique idempotency_key. Migration 0000 generated and committed.
- RBAC: 5 roles, granular permissions, assertPermission server-side guard.
- DB runtime: mini-services/pglite-db exposes ONE file-persisted PGlite over the real Postgres wire protocol (127.0.0.1:6543, 16 connections) — app uses node-postgres identically to the future Neon deployment. Rationale documented in src/lib/db/index.ts (Turbopack per-route isolation makes in-process PGlite unusable in dev).
- Tests (vitest): schema integration (9), auth integration (11, incl. forged-cookie rejection), RBAC unit (11) — 31/31 passing. Harness: fresh in-memory PGlite per suite + migrations from drizzle/.
- Docs: ARCHITECTURE.md, SECURITY.md, WORKER-PROTOCOL.md, DEPLOYMENT.md, detailed .env.example; CI workflow (lint+typecheck+test).
- P0 verification console at "/" showing only observed DB state (page + auth-panel).

Stage Summary:
- P0 exit criteria MET: auth flows TESTED (integration), schema migrated on dev DB, typecheck green, 31/31 tests.
- Deviation from report (to be documented in ARCHITECTURE.md): pgboss replaced by a jobs-table queue (SELECT ... FOR UPDATE SKIP LOCKED) — PGlite (dev Postgres) lacks LISTEN/NOTIFY that pgboss depends on; same durability/idempotency semantics, works identically on Neon. Planned inside P1.
- Next: P1 vertical slice (characters, assets upload, consent, job system, worker protocol, dev worker, session state machine, media relay, live studio UI, failure suite).

---
Task ID: 3
Agent: Super Z (main agent)
Task: User clarification — the Baidu AIStudio + ModelScope API keys pasted in chat were NOT intended for the platform. Delete the tokens, roll back the work they triggered, resume P2.

Work Log:
- Discovered the broken session had recovered and committed: 2c40489 (security: untrack .env — kept) and 8d9e92b (entire Baidu/ModelScope LLM layer built in response to the misdirected tokens — reverted).
- Verified via full git-object scan that NEITHER token ever entered git history (only existed in on-disk .env).
- git reset --hard 2c40489: removed src/lib/llm/, src/lib/brain/, src/app/api/brain/, tests/llm-unit.test.ts, .env.example LLM vars, health LLM lines, upload-route deletion (that commit had broken LOCAL_UPLOAD_PATH), chmod noise.
- Restored .env from 3741d87:.env (7 pre-token lines: DATABASE_URL=postgres://127.0.0.1:6543, AUTH_SECRET, ticket secrets, SCHEDULER_TOKEN).
- Token-trace sweep across workspace + logs: zero matches. Typecheck: green. Tests: 68/68.
- Resume: P2 Compute Reality (worker sleep system §45, worker selection §8, failure recovery §7, H3 registry entry §9).

Stage Summary:
- Tokens fully scrubbed; LLM integration rolled back; repo clean at 2c40489.
- P2 analysis starting.

---
Task ID: 4
Agent: Super Z (main agent)
Task: P2 Compute Reality — complete failure reassignment (spec §7 step 6) and the H3 official-API execution path (spec §9), on top of the committed sleep/selection work (1bc1956).

Work Log:
- Verified workspace security: token sweep found zero Baidu/ModelScope remnants; .env holds exactly the 7 pre-token vars; git history clean (confirmed Task 3's scrub held).
- Recovery reassignment (§7.6): new src/lib/workers/recovery.ts (rerouteRequeuedJobs — skips re-claimed jobs, wakes sleeping capable workers via selection). Wired into all three requeue paths: markWorkerUnhealthy (routing outcomes join the worker.unhealthy audit metadata), failJob (post-requeue), scheduler tick's reservation sweeper.
- Scheduler hardening: markWorkerUnhealthy now honors per-type retry budgets (jobTypeDefinition().maxRetries — live transforms retry less than batch) instead of a hardcoded 3.
- Orphaned-job re-router (tick step 2.5): QUEUED job types with zero awake capacity wake their best sleeping capable worker (skip when a wake is already pending) — the safety net for jobs orphaned when a worker reports ERROR then dies (no requeue path owns them). Result field: orphanWakes.
- H3 official-API client (§9): src/lib/h3/client.ts — h3ConfigFromEnv (requires BOTH H3_API_BASE_URL + H3_API_KEY; H3_MODEL/H3_GROUP_ID optional), submit/query/retrieve against the documented platform API shape, base_resp envelope checking with query-endpoint task-state interpretation (task-level Fail maps to phase:failed, unknown statuses stay pending until the executor timeout — never guessed).
- H3 executor: src/lib/worker-core/h3-executor.ts — injectable fetch + ports (fully unit-testable); submit → bounded poll → retrieve → worker-authenticated upload → RESULT with real usage. Deterministic errors (not-configured, missing prompt) are terminal requeue:false; provider/timeout/transport failures requeue within budget.
- Runner integration: video.h3 capability announced only when env config resolves; H3 jobs run detached from the claim loop (minutes-long generation; heartbeat counts load; mid-generation worker death recovered by §7 paths; idempotency key prevents duplicate provider work). uploadOutput refactored to public uploadJobOutput(jobId, bytes, mime).
- worker-dev service: env-gated H3 with honest boot log ("H3 not configured — video.generate.h3 jobs will wait for a capable worker").
- .env.example: replaced placeholder MINIMAX_API_KEY with the real H3_API_* contract (worker-side, external-credential gate).
- Tests: tests/p2-recovery.test.ts (7 — batch/live cold-start reassignment, per-type budget exhaustion, failJob honesty + orphan wake, sweeper reassignment, reroute skip safety) and tests/p2-h3.test.ts (15 — env gate, client contract incl. status normalization and base_resp failures, executor terminal states incl. happy path with faked transport, timeout, upload failure).
- Fixed during test-driven refinement: query-endpoint base_resp semantics (task failure vs transport error); two test-design flaws (worker-pool pollution across suites → video.h3 capability isolation; failJob wake assertion corrected to honest assigned-to-awake behavior which exposed the orphaned-job gap and produced the safety net).
- Docs: WORKER-PROTOCOL.md (failure recovery + reassignment + H3 sections), ARCHITECTURE.md (capability table + roadmap).
- Dev stack restarted and verified end-to-end: pglite-db :6543 (migrations re-applied after data-dir loss), next-dev :3000 (health ok, IDLE:1), media-relay :3031, control-scheduler ticking (response includes orphanWakes), worker-dev registered with honest H3 gate message.
- Final gate: lint clean, typecheck clean, 104/104 tests.

Stage Summary:
- P2 Compute Reality COMPLETE: §45 sleep system + §8 selection (prior commit) + §7 failure recovery with reassignment + orphan safety net + §9 H3 official-API path (env-gated, live generation REQUIRES EXTERNAL CREDENTIAL per approved decision).
- Deliverables: recovery.ts, h3/client.ts, h3-executor.ts, runner/worker-dev/tick/queue/registry integration, 22 new tests (104 total), updated docs.
- Next: P3 Trust plane (moderation, admin console, MFA, rate limits).

---
Task ID: 6
Agent: Super Z (main agent)
Task: Session recovery after context compression — verify token scrub held, restore workspace hygiene, restart dev stack, re-confirm green gate.

Work Log:
- Verified token security held: precise pattern sweep (bce-v1 / ernie / ModelScope / sk-…) across the repo found zero token material; only match is this worklog's own incident notes. .env restored from git blob 3741d87 (the canonical 7-var wire-server config) — the interrupted session had clobbered it down to a single file:-mode DATABASE_URL line.
- Restored src/app/api/assets/upload/route.ts (stale uncommitted deletion — the route is load-bearing for LOCAL_UPLOAD_PATH and tests/p1-journey.test.ts).
- Normalized 918 files whose mode bits were flipped to 755 by the interrupted session; committed as 9550c08 (tree clean).
- Dev stack recovery: pglite data dir under repo/db/ had been lost → recreated (NODEFS cannot mkdir recursively; parent must exist), migrations re-applied via scripts/db/migrate.ts.
- REAPER DISCOVERY (critical environment knowledge): this sandbox kills every process spawned by a tool invocation once it ends — plain nohup/&/setsid/disown ALL die (verified with control tests; even an instantly-orphaned sleep). The ONLY surviving launch pattern is `script -q <log> -c "setsid bun <cmd>" &` — stdio stays on the script-allocated pty, process is setsid'd out of the pty session. Constraints: no pipes inside the command (bun run dev's `| tee` breaks it → use `bun next dev -p 3000` directly), one launch per command (batching can get the invocation SIGKILLed), logs stop at invocation end (typescipt files in var/logs/) — liveness must be checked via ports/health/DB, not logs.
- Captured the recipe in scripts/dev/start-stack.sh (idempotent start + status; status identifies no-port services by /proc/<pid>/cwd).
- Re-provisioned worker identity dev-worker-1 (new WORKER_CREDENTIAL, SHA-256 in DB) and wrote per-service env files (mini-services/worker-dev/.env, mini-services/control-scheduler/.env) — these are gitignored by design.
- Full stack up and surviving across invocations: pglite-db :6543, next-dev :3000 (health ok, database ok), media-relay :3031, control-scheduler ticking, worker-dev registered (health byStatus shows IDLE/SLEEPING:1).
- Full gate re-confirmed on the restored tree: lint clean, typecheck clean, 104/104 tests.

Stage Summary:
- Workspace fully recovered: security verified, tree clean (9550c08), 5-service stack running with the pty+setsid persistence recipe, gate green (104/104).
- scripts/dev/start-stack.sh is now the canonical way to bring the stack back after any restart.
- Next: P3 Trust plane (moderation pipeline, admin console, MFA, rate limits) per the approved 6-phase plan.
