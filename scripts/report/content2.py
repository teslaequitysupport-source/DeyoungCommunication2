# -*- coding: utf-8 -*-
"""Content blocks for Phase-1 report, chapters 7-12. English document."""

C7 = [
("h1", "AI Brain Architecture"),
("body", "The Brain is the platform's orchestrator: the component that turns a user or administrator intent into a validated, authorized, policy-checked execution against registered tools. Its architecture is a pipeline, and each stage exists to make the next stage's job impossible to skip. An LLM never executes anything itself; it only proposes a structured tool request. Everything after that proposal is deterministic code."),
("body", "The pipeline, in order: the LLM receives the user intent plus a manifest of available capabilities, and emits a structured tool request as JSON. Schema validation rejects any request that does not match the tool's registered input schema, before any authorization runs. The authorization stage resolves the requesting user's roles and permissions and checks them against the tool's required permissions - this is a database check, not something the LLM is asked politely to respect. The policy engine then applies platform rules that can veto regardless of permissions: safety policy, consent requirements for the referenced assets, plan limits, rate limits, and feature flags. Only then does execution dispatch the tool's handler, whose result is recorded on the job and written to the audit log with actor, tool, inputs, decision, and outcome. Failures at any stage are returned as structured errors, never as free-form text that the caller must guess about."),
("table", {
  "caption": "Table 7.1 - Brain tool registry contract (every tool, no exceptions)",
  "headers": ["Tool attribute", "Purpose", "Enforced by"],
  "ratios": [0.22, 0.42, 0.36],
  "rows": [
    ["Name + description", "Unique identity; what the tool does", "Registry rejects duplicates; LLM sees only descriptions"],
    ["Input schema", "Strict JSON schema for arguments", "Validation stage rejects non-conforming requests pre-authorization"],
    ["Required permissions", "Granular permission strings", "Authorization stage (server-side DB lookup)"],
    ["Rate limits", "Per-user and per-plan ceilings", "Policy engine"],
    ["Consent requirements", "Asset/purpose scopes the tool consumes", "Policy engine cross-checks consent records"],
    ["Failure handling", "Retryable vs terminal; idempotency key", "Job system"],
    ["Audit logging", "Actor, inputs, decision, result", "Audit append at every execution and every veto"],
  ],
}),
("h2", "What the Brain can never do"),
("body", "The Brain has no shell, no filesystem scope beyond its job inputs, no database credentials, and no ability to mutate its own permission set. It cannot execute arbitrary shell commands; it cannot modify security controls; it cannot grant itself permissions; it cannot read arbitrary secrets (secrets are held by the platform and injected only into the specific tools that need them); it cannot bypass authorization, billing, or consent checks; it cannot delete production data outside explicitly registered, narrowly scoped tools; and it cannot disable audit logging. These are not instructions to the model - they are properties of the runtime: the only actions that exist are the registered tools, and every tool passes the same pipeline. Prompt-injection defense follows the same structure: untrusted content (user text, uploaded filenames, media metadata) is framed as data, never as instructions; the tool manifest is the only source of available actions; and validation plus the policy engine run regardless of what the model proposes. An injected instruction can at worst produce a proposal that the pipeline then rejects."),
("h2", "Model independence"),
("body", "The Brain's LLM is a swappable provider behind an interface, because the specification's warning about guessing model capabilities applies to the orchestrator as much as to video models. The initial implementation will use a verified, currently-available model with proven structured-output support, configured via environment variables, with the ability to change provider without touching pipeline code. The Brain's intelligence is deliberately distributed: the LLM contributes intent parsing and tool selection, while worker selection, cost, latency, and health routing live in deterministic code in the scheduler, where they can be tested exhaustively (Chapter 14) rather than probabilistically."),
]

C8 = [
("h1", "GPU Worker System"),
("body", "Workers are the platform's muscle, and their design principle is provider independence: the control plane never knows whether a worker is a RunPod pod, a future GPU host, or a development machine - it knows a worker identity, its capabilities, and its health, all expressed through one protocol. This is what makes Kaggle's limitations (non-commercial terms, 30-hour weekly quota) a non-event: Kaggle is simply one dev-tier worker, and its eventual irrelevance costs nothing."),
("table", {
  "caption": "Table 8.1 - Worker protocol operations",
  "headers": ["Operation", "Purpose", "Auth"],
  "ratios": [0.20, 0.50, 0.30],
  "rows": [
    ["REGISTER", "Worker announces provider, GPU, VRAM, models, capabilities, version, region", "Worker credential (issued by admin, rotatable)"],
    ["HEARTBEAT", "Liveness + current load, active jobs, latency; missed heartbeats trigger failure handling", "Signed with worker credential"],
    ["HEALTH", "On-demand deep check: memory, model availability, disk, errors", "Worker credential"],
    ["CAPABILITIES", "Full capability + model manifest refresh", "Worker credential"],
    ["RESERVE", "Control plane holds a worker for an incoming job", "Control-plane initiated"],
    ["ALLOCATE", "Job bound to worker; idempotency key attached", "Control-plane initiated"],
    ["LOAD_MODEL", "Load the required model into memory", "Worker validates against its own manifest"],
    ["START / STOP", "Begin or cease a job execution", "Control-plane initiated, audited"],
    ["STREAM", "Worker joins the LiveKit room as participant; media flows in the media plane", "Room token scoped to session"],
    ["STATUS", "Per-job progress reported as real state, never fabricated", "Worker credential"],
    ["RELEASE", "Job finished; worker returns to idle", "Control-plane initiated"],
    ["DRAIN", "Stop assigning new work; finish current jobs; then sleep or shut down", "Control-plane or admin initiated"],
    ["SHUTDOWN", "Clean termination", "Worker credential"],
    ["ERROR / RESULT", "Structured failure or completion payloads for the job record", "Worker credential"],
  ],
}),
("h2", "Lifecycle, selection, and the sleep system"),
("body", "The worker lifecycle is an explicit state machine: BOOT, REGISTER, HEALTH CHECK, IDLE, RESERVED, LOADING, READY, BUSY, DRAINING, back to IDLE, and finally SLEEP or SHUTDOWN. The scheduler selects workers by the specification's full factor list - capability match, GPU type, VRAM, model compatibility, health, load, latency, region, user plan, queue depth, and cost where the provider reports it - and it enforces the spec's example rules as hard constraints: a live face-processing task is never sent to a worker that only supports offline video generation, and an H3-generation job is only ever routed to the H3 API adapter. Selection is deterministic, unit-tested code, which is what makes these guarantees trustworthy rather than aspirational."),
("body", "Cost control comes from the sleep system: a worker with no job idles for a timeout window, drains, and sleeps (on RunPod, the pod scales to zero, so idle time costs nothing). When a new job arrives, the sequence is capability check, worker wake, health check, model load, ready, execute. The platform does not pretend this is instant: cold-start wake plus model load is a real delay on the order of tens of seconds to minutes depending on model size, and the session UI presents that honestly as a loading state with real backend state behind it (Chapter 9), never a fabricated progress bar."),
("h2", "Failure recovery"),
("body", "When a worker stops responding, the control plane executes a fixed recovery procedure: detect the missed heartbeats (threshold-based); mark the worker unhealthy and stop assigning new work; determine whether its in-flight jobs are recoverable (idempotent jobs may retry, streaming sessions may hand off); retry or reassign where safe; record the incident on the job and worker records; notify the session manager so the user sees a recovering state rather than a frozen one; and restore the session where technically possible. The system never pretends a dead worker is alive - health is observed state, not hope. Idempotency keys make retries safe: a re-executed job either resumes its unit of work or is recognized as already completed, and the job record's retry count and failure information are surfaced to admins."),
]

C9 = [
("h1", "Live Sessions, Jobs, and Media Flow"),
("h2", "Session state machine"),
("body", "Every live session is a record with an explicit state, and the user interface reflects that state in real time - the status text a user sees (connecting, finding worker, worker assigned, loading model, live, network degraded, recovering) is read from the backend session record, never simulated client-side. The states are: CREATED, VALIDATING, WAITING_FOR_WORKER, WORKER_ASSIGNED, LOADING, READY, LIVE, DEGRADED, RECOVERING, STOPPING, COMPLETED, FAILED, CANCELLED, and EXPIRED. Transitions are server-authoritative; the client may request but never set state. WebSocket events push transitions to connected clients, and a reconnecting client re-syncs state from the record rather than guessing."),
("h2", "Job system"),
("body", "Every asynchronous task - character renders, avatar generations, batch video jobs, media transcodes - has a durable job record with the fields the specification requires: job ID, user ID, project/session linkage, type, status, priority, input references, worker ID, provider, created/started/completed times, failure information, retry count, result, usage, and cost where available. Jobs are processed through the pgboss queue with idempotency keys so retries never duplicate work or billing. The status surfaced to users is the job's actual state; where a job is queued behind a sleeping worker, the UI says exactly that, with the cold-start explanation from Chapter 8."),
("h2", "Media storage"),
("body", "The storage rule is strict: the database stores metadata; objects live in Cloudflare R2. Uploads use presigned URLs with MIME and extension validation and file-size limits enforced before and during upload; downloads use short-lived presigned URLs with ownership verification on every request, so no permanent public media URLs exist by default. Every access to an asset verifies that the requesting user owns or is authorized for the object, closing the IDOR/BOLA path. R2 lifecycle rules implement retention: raw session recordings are retained per policy then expire automatically, and user-initiated deletion removes both the object and its metadata. CORS is scoped to the platform's own origins."),
("h2", "Output adapters"),
("table", {
  "caption": "Table 9.1 - Output adapter registry (capability-declared, not assumed)",
  "headers": ["Adapter", "What it actually is", "Honest claim"],
  "ratios": [0.22, 0.40, 0.38],
  "rows": [
    ["NATIVE_WEB", "Live/recorded output in the platform's own web UI", "Fully supported"],
    ["NATIVE_MOBILE", "Live/recorded output inside the platform's own mobile app", "Fully supported"],
    ["WEBRTC_LIVE", "Real-time transformed stream to any WebRTC-capable endpoint", "Supported where the endpoint accepts a connection"],
    ["PHONE_TO_PHONE", "Physical-camera adapter: phone 1 shows transformed output fullscreen; phone 2 films it for use in any social app", "Works with any app that uses the phone's camera - no app-specific integration claimed"],
    ["OBS", "Worker publishes a stream the user pulls into OBS as a media source on desktop", "Desktop-only; documented setup"],
    ["RECORDING", "Session recorded to R2, delivered via short-lived link", "Fully supported"],
    ["RTMP", "Future: push output to an RTMP ingest", "Not implemented; declared as future capability only"],
  ],
}),
("body", "The phone-to-phone fullscreen experience is engineered as the specification demands: unnecessary UI hidden, screen kept awake, aspect ratio preserved, portrait orientation supported, optional mirror mode, stable framing, minimal status information, a low-bandwidth mode, and automatic recovery from connection loss. Its documentation and marketing copy will describe it accurately as a physical-camera adapter and will not claim that WhatsApp, Telegram, Instagram, TikTok, or Facebook accept a virtual AI camera, because on mobile they do not (Chapter 3, verified)."),
]

C10 = [
("h1", "Web and Mobile Architecture"),
("h2", "Web application"),
("body", "The web application is a single Next.js codebase containing the marketing site, the product application, and the admin console, with server-side authorization on every route. User-facing routes: landing page, sign in/up, dashboard, projects, character studio (create and manage characters: face, appearance, voice, personality configuration, style, language, consent status, source assets, ownership), live studio (start, monitor, and end live sessions with real state), media library, recordings, settings, account management, consent management, credits (no payment provider until one is verified and integrated), in-app help and documentation, and the legal pages (terms, privacy, cookies, refunds, acceptable use, copyright, accessibility, voice rights, abuse). Admin routes are behind the RBAC wall described in Chapter 11. The design follows the specification's anti-slop rules: no purple-gradient aesthetic, no glassmorphism excess, no fake counters or testimonials, no decorative robots or holograms, no emoji icons, and motion that communicates rather than decorates. The hero states what the product does and shows real functionality."),
("h2", "Mobile application"),
("body", "The mobile app is a true Expo React Native application, not a WebView wrapper. It supports camera and microphone permissions with proper platform flows, live sessions with transformed preview, character selection, media upload and download, session recovery, network recovery, low-bandwidth operation (lower resolution, bitrate, and frame rate, with an audio-first fallback), orientation handling, fullscreen live output with keep-awake, account management, and notifications where implemented. Platform-specific APIs (keep-awake, permissions, file system) are used where required. Performance budgets from the specification are treated as engineering requirements: resolution, bitrate, frame rate, memory, battery, CPU/GPU usage, image sizes, and background behavior are tuned, and degraded modes exist for constrained devices. Distribution requires the external developer accounts and app-store review listed in Chapter 6; the plan phases mobile after the web platform is stable, which is the honest sequencing for a solo-to-small engineering effort."),
("h2", "3D usage policy"),
("body", "3D is used only where it genuinely improves the product: character visualization and live preview, camera framing, and studio context. Desktop gets richer assets; mobile gets optimized ones; every 3D surface has a non-3D fallback; and reduced-motion preferences disable non-essential animation throughout. Nothing on the marketing or product site exists purely to look futuristic - if a visual does not communicate something real about the platform, it does not ship."),
]

C11 = [
("h1", "Security Model"),
("body", "Security decisions follow the specification's priority order: when cheap and secure conflict, secure wins, then a cheaper secure implementation is found. The model below is designed to be implemented and tested as part of the build phases, not bolted on afterward. Frontend authorization is never trusted: every route validates server-side, and every object access verifies ownership."),
("table", {
  "caption": "Table 11.1 - Threat model and controls",
  "headers": ["Threat", "Control"],
  "ratios": [0.34, 0.66],
  "rows": [
    ["Broken authentication / session hijacking", "Better Auth with secure HTTP-only cookies, trusted-origin configuration, session revocation, 2FA and passkeys available"],
    ["IDOR / BOLA (object access)", "Ownership verification on every asset, job, session, character, and presigned URL; no enumerable IDs without authorization"],
    ["Privilege escalation", "Server-side RBAC with granular permissions; roles never read from client input; admin actions all audited"],
    ["SQL injection", "Drizzle parameterized queries everywhere; no string-built SQL"],
    ["XSS / CSRF", "Framework output encoding; CSRF-safe cookie strategy and origin checks on state-changing routes"],
    ["SSRF", "Outbound fetch allowlists; no user-supplied URLs fetched server-side"],
    ["Malicious uploads / FFmpeg abuse", "MIME + extension + size validation, magic-byte checks, quarantined processing directory, argument allowlists (user text never reaches argv), CPU/time/memory limits, no shell interpolation"],
    ["Worker spoofing / impersonation", "Workers authenticate with rotatable credentials; capability claims validated at health checks; heartbeats signed; revocation revokes access immediately"],
    ["Brain tool abuse / prompt injection", "Registered tools only; schema validation before authorization; untrusted content framed as data; policy engine veto; full audit trail"],
    ["Rate-limit bypass / API abuse", "Per-user, per-plan, per-IP limits at the edge and in the policy engine; abuse monitoring in admin"],
    ["Secret leakage", "Server-only env vars, .env.example documentation, secrets never in client bundles, admin UI shows redacted references only"],
    ["Replay / duplicate jobs", "Idempotency keys on job creation and worker execution"],
    ["CORS misconfiguration", "Scoped origins; no wildcard on credentialed routes"],
  ],
}),
("h2", "Roles and administration"),
("body", "Roles: USER, MODERATOR, SUPPORT, ADMIN, SUPER_ADMIN, with granular permissions underneath (for example, 'workers:drain' separate from 'users:ban'), because the specification is explicit that not every admin should have every permission. Administrative access requires MFA. The admin console is a first-class part of the control plane, not a hidden backdoor: its routes are behind the same RBAC and audit machinery, and every emergency control (disable capability, disable provider, stop new jobs, maintenance mode, disable uploads, disable live sessions, emergency moderation) writes an audit entry naming the actor, the action, and the reason prompt. The admin UI never displays raw secrets - only redacted references - and the worker registry exposes exactly the operational data the specification lists (provider, GPU, VRAM, status, health, active jobs, queue, model, capability, heartbeat, errors, latency)."),
]

C12 = [
("h1", "Privacy, NDPA Compliance, and Legal"),
("h2", "Nigeria Data Protection Act posture"),
("body", "The platform will be available in Nigeria, so the NDPA 2023 and NDPC guidance are treated as design inputs, not afterthoughts. Verified legal facts that shape the design: face templates and voice prints are biometric data, which the NDPA classifies as sensitive personal data; processing sensitive data at scale is high-risk processing, which engages data-protection impact assessment duties; data controllers of major importance (including entities processing high volumes of data subjects or high-risk categories) have registration duties with the NDPC; data subjects hold rights of access, correction, and deletion; and cross-border processing (this platform's compute runs on US/EU-hosted GPU and API providers) must be handled consistently with the Act's transfer requirements. This report is an engineering document, not legal advice: <b>professional legal review is required before launch</b>, and the approval gate lists it as a blocking external item. The engineering commitments that make such review tractable are below."),
("h2", "Privacy data map and retention"),
("table", {
  "caption": "Table 12.1 - Privacy data map (engineering commitments; full map ships with the platform)",
  "headers": ["Data type", "Purpose", "Stored where", "Retention / deletion"],
  "ratios": [0.22, 0.30, 0.22, 0.26],
  "rows": [
    ["Account data", "Identity, authentication", "Postgres", "Deleted on account deletion request; audit stubs retained per law"],
    ["Face assets / templates", "Character transformation", "R2 (encrypted at rest) + Postgres metadata", "Deleted on withdrawal or account deletion; consent-scoped"],
    ["Voice assets / prints", "Voice transformation", "R2 + Postgres metadata", "Same as face assets"],
    ["Session recordings", "User's own output history", "R2", "Lifecycle expiry (default 30 days, configurable); immediate on user deletion"],
    ["Job records / usage", "Billing, support, audit", "Postgres", "Anonymized after retention window"],
    ["Audit logs", "Security and abuse evidence", "Postgres (append-only)", "Retained per security policy; not erased on account deletion (legal basis: legitimate interest / legal obligation)"],
    ["Analytics events", "Product analytics", "PostHog, consent-gated", "Deleted on consent withdrawal; session recording off by default"],
  ],
}),
("h2", "Consent system"),
("body", "Face and voice transformation requires explicit, purpose-scoped consent records - not a generic terms checkbox. Each record stores the user, the asset, the purpose, the scope, the timestamp, the policy version, the authorization status, and the withdrawal status, and withdrawal is a first-class action that disables further processing of that asset, enforced by the policy engine in the Brain pipeline. The consent flow also covers the platform's own acceptable-use boundary: creating characters of real people requires authorization from that person, and the abuse-report path (impersonation, unauthorized likeness or voice, non-consensual sexual content, harassment, fraud, copyright) is built into the product surface, with moderator queues and documented decisions in the admin console."),
("h2", "Cookies, legal pages, and honest claims"),
("body", "Tracking is classified (NECESSARY / PREFERENCES / ANALYTICS / MARKETING) with non-essential tracking off until consent; the cookie control offers Accept All, Reject Non-Essential, and Manage Preferences, and withdrawal is always available. Legal pages ship at the routes the specification lists (terms, privacy, cookies, refunds, acceptable use, copyright, accessibility, voice rights, abuse) with real operator information, effective dates, and contact routes - no invented entities or registration numbers, and no copied boilerplate. The refund policy will state exactly what the billing system (manual credits, pre-payment integration) can actually do, per the specification's rule that refund promises must match billing reality. Product copy across the site is written against the prohibited-claims list: no fastest/best/instant/zero-latency/unlimited/100%-private/bank-grade/guaranteed language, and no performance or security claims that have not been measured."),
]
