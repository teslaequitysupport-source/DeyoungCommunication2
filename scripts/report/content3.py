# -*- coding: utf-8 -*-
"""Content blocks for Phase-1 report, chapters 13-18. English document."""

C13 = [
("h1", "Accessibility Plan (WCAG 2.2 AA)"),
("body", "The platform targets WCAG 2.2 AA, and the plan treats accessibility as a build-phase requirement with a test gate, not a post-launch cleanup. The commitments: color contrast at or above AA ratios, with meaning never communicated by color alone; complete keyboard navigation with visible, well-ordered focus indicators across every flow including the live studio and dialogs; semantic HTML with correct heading structure, real labels on every form control, and accessible error messaging that is announced, not merely rendered; dialogs and menus that trap focus appropriately and close predictably; alt text for every meaningful image and a text alternative strategy for live-status changes (live regions announcing session state transitions); responsive reflow at 400% zoom without horizontal scrolling; touch targets at comfortable sizes for mobile; prefers-reduced-motion honored across all animation, including the 3D system's non-essential motion; and loading, empty, and error states that are programmatically communicable, not just visible."),
("body", "Verification is tooling plus human passes: automated checks (axe-core) run in CI on every page state; manual keyboard walkthroughs cover the critical journeys (sign up, create character, grant consent, start live session, report abuse); screen-reader smoke tests (VoiceOver on the web/mobile builds, NVDA on Windows) run before each release; and any new icon-only control requires a documented accessible name before merge. The accessibility statement page will disclose the target level and the reporting channel for problems, and accessibility bugs are triaged with the same severity discipline as security bugs - a blocking regression in a critical flow stops a release."),
]

C14 = [
("h1", "Testing Plan"),
("body", "Testing is layered to match the architecture: unit tests lock down deterministic logic, integration tests exercise real infrastructure boundaries, end-to-end tests walk the user's actual journey, and dedicated failure and security suites attack the system on purpose. The specification's testing matrix is adopted in full; the table below maps it to concrete suites that become exit criteria for the phases in Chapter 16."),
("table", {
  "caption": "Table 14.1 - Test suites and coverage targets",
  "headers": ["Suite", "Covers", "Exit criterion"],
  "ratios": [0.20, 0.52, 0.28],
  "rows": [
    ["Unit", "Brain tool schemas, validation, authorization logic, worker selection (capability/VRAM/plan routing), session and job state machines, consent enforcement, permission checks, storage access guards", "All pass in CI on every commit; no skipped tests"],
    ["Integration", "Auth flows against real Postgres, storage presign/verify, worker REGISTER/HEARTBEAT/ALLOCATE lifecycle, job execution through pgboss, session creation, media processing through FFmpeg sandbox, admin actions", "All pass against a fresh environment per run"],
    ["End-to-end", "Signup, login, create character, upload asset, grant consent, start session, worker assignment, processing, live output, stop, save result", "Green on the vertical-slice environment (Phase 1 exit)"],
    ["Failure", "Worker crash mid-job, network loss mid-session, model load failure, storage failure, API timeout, duplicate job submission, expired session, revoked consent mid-flow, unauthorized access attempts, malicious upload", "Each scenario produces the specified recovery/rollback behavior, not a hang or silent loss"],
    ["Security", "Cross-user access, user-into-admin attempts, forged roles, expired/invalid sessions, prompt injection, worker spoofing, rate-limit bypass, SSRF/XSS/CSRF probes, path traversal on filenames", "Zero critical findings open at any phase exit; findings filed with severity"],
    ["Accessibility", "axe-core CI on key states; keyboard walkthroughs; screen-reader smoke tests", "Zero serious violations on critical journeys"],
  ],
}),
("body", "Two honesty rules govern the test reports: a feature is only declared TESTED when its suite runs against real infrastructure (a unit test of the worker protocol against a mock is PARTIALLY TESTED until an integration run exercises a real worker), and test results are reported with the specification's status vocabulary (IMPLEMENTED / TESTED / PARTIALLY TESTED / BLOCKED / NOT IMPLEMENTED / REQUIRES EXTERNAL CREDENTIAL / REQUIRES PROVIDER / REQUIRES MANUAL VERIFICATION) rather than a bare done."),
]

C15 = [
("h1", "Deployment Plan"),
("h2", "Topology and environments"),
("body", "The deployed system has six moving parts: the Next.js application (Vercel for development; Pro/VPS/Railway decision at launch), the PostgreSQL database (Neon), the R2 object storage bucket, the LiveKit media server (self-hosted VPS or LiveKit Cloud), GPU workers (RunPod, deployed as container images booted on demand), and the external MiniMax H3 API. Development, staging, and production are separate environments with separate credentials; migrations run through Drizzle's migration tooling in CI before promotion; and every deploy is a repeatable pipeline, not a laptop. The worker container image is versioned and its version is part of the REGISTER payload, so the control plane can refuse outdated workers."),
("h2", "Environment variables and secrets"),
("table", {
  "caption": "Table 15.1 - Environment variable classes (documented in .env.example; never committed)",
  "headers": ["Class", "Examples", "Exposure"],
  "ratios": [0.20, 0.50, 0.30],
  "rows": [
    ["PUBLIC", "NEXT_PUBLIC_APP_URL, analytics opt-in flags", "Client-safe by design"],
    ["SERVER", "AUTH_SECRET, session config, rate-limit keys", "Server only; never prefixed NEXT_PUBLIC"],
    ["DATABASE", "DATABASE_URL (Neon), pool settings", "Server only"],
    ["STORAGE", "R2 keys, bucket, region, presign TTLs", "Server only"],
    ["MEDIA", "LiveKit URL + API key/secret", "Server only; room tokens minted per session"],
    ["WORKER", "WORKER_ID, control-plane URL, worker credential", "Worker containers only"],
    ["AI", "MiniMax API key, Brain LLM provider key", "Server / worker only"],
    ["ADMIN", "MFA enforcement, emergency flag defaults", "Server only"],
    ["PAYMENT", "(empty until a verified provider is integrated)", "Deferred; see approval gate"],
  ],
}),
("h2", "Operations"),
("body", "Observability is layered from day one: structured request and job logs, health endpoints for the app and database, worker heartbeat and health telemetry surfaced in the admin console, error tracking, and the append-only audit log. Backups: Neon's built-in point-in-time recovery covers the database; R2 objects are replicated by Cloudflare's storage durability, and the job records in Postgres are the source of truth for regenerating any derived media that is lost; configuration recovery is a solved problem because all configuration lives in versioned migrations and environment templates. Monitoring covers queue depth, worker health, session failure rates, and cost signals (RunPod hours, H3 API usage), so cost anomalies are visible in the admin console rather than on a surprise invoice. The incident runbook documents: kill a provider (capability off), drain workers, roll back a bad deploy, restore from backup, and the emergency controls, each with its audit trail."),
]

C16 = [
("h1", "Implementation Phases"),
("body", "The build order is a vertical slice first, then widening - the strategy that produces a working, testable system at every phase boundary instead of a long silence followed by an integration disaster. Each phase has concrete exit criteria in the specification's honest-status vocabulary, and no phase begins until the previous one is TESTED (or its deviations are explicitly logged and approved). Durations are given as focused-build ranges for a solo developer plus automation; they are estimates for planning, not promises."),
("table", {
  "caption": "Table 16.1 - Phased implementation plan",
  "headers": ["Phase", "Scope", "Exit criteria (status vocabulary)", "Est."],
  "ratios": [0.13, 0.42, 0.36, 0.09],
  "rows": [
    ["P0 Foundations", "Repo, CI, TypeScript strict, Drizzle schema + migrations for users/sessions/jobs/consent, Better Auth (email+password, sessions, RBAC roles), .env.example, audit log table", "Auth flows TESTED (integration); schema migrated on dev DB; CI green", "1-2 wk"],
    ["P1 Vertical slice", "Characters CRUD + asset upload to R2 (presigned, validated); consent records; job system (pgboss, idempotency); one real GPU worker (dev machine) implementing the worker protocol; LiveKit room + worker-as-participant with a real (simple) transform; session state machine + WebSocket status; minimal live studio UI showing true state", "Full E2E journey signup through save result TESTED against real worker; failure suite for worker-crash and network-loss TESTED", "3-4 wk"],
    ["P2 Compute reality", "RunPod worker image + sleep system; MiniMax H3 via official API as managed capability; scheduler full-factor selection; job cost/usage recording; recordings to R2 with lifecycle rule", "Job through H3 API TESTED; RunPod wake/sleep TESTED; cold-start UX reflects real state", "2-3 wk"],
    ["P3 Trust plane", "Moderation reports + queues; admin console (users, content, workers, emergency controls, audit view); granular permissions + MFA for admin; rate limits; analytics consent gating", "Admin actions audited TESTED; security suite zero critical findings", "2-3 wk"],
    ["P4 Mobile", "Expo app: permissions, live session view, character selection, uploads/downloads, session + network recovery, fullscreen keep-awake output, low-bandwidth mode", "Camera/mic TESTED on real Android + iOS devices; recovery flows TESTED", "3-4 wk"],
    ["P5 Launch gate", "Legal pages with operator info; cookie consent; accessibility audit fixes; NDPA legal review (external); payment provider decision (external); Vercel Pro / VPS decision; domain + HTTPS; monitoring dashboards; production build", "Final audit checklist from the specification all green or explicitly waived in writing", "2-3 wk"],
  ],
}),
("body", "Two sequencing decisions deserve explanation. Mobile is Phase 4, not Phase 1, because the web platform must exist for the mobile app to talk to, and the phone-to-phone fullscreen mode it depends on is only meaningful once live output works - this matches the approved-build-order guidance that web-first is the honest scope for a small team. Kaggle workers are not a phase item at all: they are optional dev-tier workers that may appear in P1's development environment if useful, constrained to non-commercial experimentation, with zero architectural footprint beyond the worker protocol they already speak."),
]

C17 = [
("h1", "Risks, Limitations, and Fallbacks"),
("h2", "Honest limitation register"),
("table", {
  "caption": "Table 17.1 - Platform limitations stated plainly (per the never-hide-limitations rule)",
  "headers": ["Limitation", "Impact", "Design response"],
  "ratios": [0.28, 0.32, 0.40],
  "rows": [
    ["Mobile apps do not accept third-party virtual cameras (OS-level, verified)", "No direct in-app integration with WhatsApp/Instagram/TikTok/Telegram/Facebook calls", "Phone-to-phone physical adapter as a first-class output mode; copy never claims direct integration"],
    ["MiniMax H3 self-hosting is not commercially licensed without written permission", "Cannot run own H3 GPU fleet for production", "H3 via official API (metered, legitimate); capability registry keeps future models swappable"],
    ["Cold-start latency on sleeping GPU workers", "First seconds of a session take tens of seconds to minutes to start after idle", "Honest loading states from real backend state; never claimed instant"],
    ["LiveKit Cloud free tier and R2 free tier are finite", "Growth exhausts free allowances", "Self-host LiveKit on VPS option; R2 paid tier is cheap at $0.015/GB; both are config-level switches"],
    ["Payment collection in Nigeria unverified", "No automated charging until a provider is chosen and integrated", "Credits granted manually; refunds stated as credit adjustments; provider decision at approval gate"],
    ["App-store review is outside our control", "Mobile ship dates are estimates only", "Web platform remains fully functional without the app stores"],
    ["Legal/NDPA review is external", "Launch blocked until counsel signs off", "Engineering commitments (data map, consent system, deletion flows) built to make that review fast"],
  ],
}),
("h2", "Risk register"),
("table", {
  "caption": "Table 17.2 - Top project risks and mitigations",
  "headers": ["Risk", "Likelihood", "Mitigation / fallback"],
  "ratios": [0.40, 0.14, 0.46],
  "rows": [
    ["H3 API pricing/limits change or access is restricted", "Medium", "Model is a capability-registry entry; swap to a verified alternative model without architecture change"],
    ["RunPod availability/price shifts", "Medium", "Worker protocol is provider-independent; another GPU host (or own VPS) registers identically"],
    ["LiveKit operational burden under self-hosting", "Low-Med", "Move to LiveKit Cloud; or Cloudflare Realtime fallback (verified pricing) behind the same client interface"],
    ["Scope creep toward fake features to look complete", "High (process risk)", "This report's status vocabulary is the contract; phase exits require TESTED status; no mock counters or simulated states anywhere"],
    ["Solo-build bandwidth", "High", "Vertical-slice phasing keeps the system demonstrably alive at every boundary; external items (legal, stores, payments) run in parallel, not in series"],
    ["Prompt injection through user content", "Medium", "Data-not-instruction framing, tool allowlist, schema validation, policy veto, audit trail (Ch. 11)"],
  ],
}),
("body", "The fallback philosophy across every row is the same: each external dependency sits behind an interface that was designed for replacement - workers behind the worker protocol, models behind the capability registry, media infrastructure behind LiveKit's client-facing semantics with Cloudflare Realtime documented as the alternate path, hosting behind Next.js portability. Nothing in the architecture treats any provider as permanent, which is the engineering expression of the specification's rule that providers are workers and capabilities, never the architecture itself."),
]

C18 = [
("h1", "Approval Gate and Open Decisions"),
("body", "This report is the specification's mandated stop point: audit and research complete, architecture proposed, costs and risks stated - and no major implementation begun. The build proceeds only after the decisions below are made. Each item lists the report chapter that argues it, so the approval can be specific rather than general."),
("table", {
  "caption": "Table 18.1 - Decisions required to proceed",
  "headers": ["#", "Decision", "Default if approved as-proposed"],
  "ratios": [0.06, 0.58, 0.36],
  "rows": [
    ["1", "Approve the three-plane architecture and the technology stack of Chapter 5 (Next.js, Better Auth, Drizzle/Neon Postgres, pgboss, LiveKit, R2, RunPod workers, H3 via official API, PostHog)", "P0 begins on approval"],
    ["2", "Approve the phased plan and its exit criteria (Chapter 16), including web-first with mobile at Phase 4", "Phases run in order; each exits on TESTED status"],
    ["3", "Confirm H3-via-official-API as the production model path, accepting metered API cost and no self-hosted H3 for production (Ch. 3)", "Capability registry ships with the H3 API adapter"],
    ["4", "Confirm phone-to-phone as the sole social-app integration story, with no direct-integration claims (Ch. 3, 9)", "Marketing and docs copy reflects this exactly"],
    ["5", "Defer payment provider selection to Phase 5, with manual credits until then (Ch. 6)", "No charging before integration; refunds stated as credit adjustments"],
    ["6", "Note the external, non-code items that gate launch: Apple $99/yr + Google Play $25 accounts, domain, NDPA legal review, hosting tier decision (Ch. 6, 12, 15)", "These run in parallel during P3-P5, owned by you"],
  ],
}),
("body", "Upon approval, the first action is Phase 0: repository scaffolding, the Drizzle schema for users, sessions, jobs, workers, consent, and audit, Better Auth integration with the RBAC role set, the .env.example, and the CI pipeline - committed in small, reviewable units with tests from the first commit. Until then, per the specification's own final instruction, nothing is built. The audit is complete, the research is verified to the extent current documentation allows, the architecture is proposed with its reasoning exposed, and the risks, costs, and limitations are on the table rather than under it. The gate is yours."),
]
