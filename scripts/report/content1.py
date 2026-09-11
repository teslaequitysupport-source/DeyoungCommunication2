# -*- coding: utf-8 -*-
"""Content blocks for Phase-1 report, chapters 1-6. English document."""

C1 = [
("h1", "Executive Summary"),
("body", "This document is the Phase-1 deliverable mandated by the build specification: a full audit of the current state, verified research on every external provider the platform will depend on, a proposed production architecture, and a phased implementation plan. No application code has been written yet, and that is deliberate. The specification's implementation workflow (Section 61) requires an explicit approval gate between the planning phase and the build phase, and this report exists to give that gate real substance rather than a rubber stamp. Every claim in this document is labeled with an honest status: research findings are marked <b>VERIFIED</b> where they come from current official documentation, and every limitation, cost, and external dependency is stated plainly rather than smoothed over."),
("body", "The first and most important audit finding is that <b>there is no existing project to transform</b>. The workspace contains a git repository with a single initial commit, a placeholder environment file pointing at a SQLite URL, and no source code of any kind. The specification was written as though it would be applied to an existing codebase, but the actual starting point is a greenfield build. This changes the reading of the audit phase: there is no legacy functionality to preserve, no migration risk to manage, and no partially-working subsystem to rescue. The audit effort therefore redirected toward verifying the external world instead, because that is where the real risks live."),
("body", "Thirteen external providers and constraints were researched against current official sources (September 2026). The three findings with the largest architectural impact are: first, <b>MiniMax H3 is a real, currently-shipping open-weight multimodal video model</b> with a documented API, but its self-hosting license prohibits commercial use without written permission from MiniMax, which means production use must route through the official API; second, <b>WhatsApp, Instagram, Telegram and TikTok on mobile cannot accept a third-party virtual camera</b>, because mobile operating systems only expose physical camera devices to those apps, which confirms that the phone-to-phone physical adapter described in the specification is the only honest integration path; third, the free tier of Vercel's Hobby plan is restricted to personal, non-commercial use, so a commercial launch requires either the $20/month Pro plan or self-hosting."),
("callout", {"stat": "0 lines", "label": "of platform code exist today - this report is the gate before any is written"}),
("body", "The proposed architecture follows the specification's three-plane model exactly: a control plane (Next.js, Better Auth, PostgreSQL with Drizzle, the AI Brain, jobs, consent, and administration), a media plane (LiveKit WebRTC SFU for all real-time camera and microphone transport), and a compute plane (provider-independent GPU workers speaking a registered protocol, with RunPod as the initial host and MiniMax H3 accessed as a managed API capability). The development stack runs on $0 upfront using free tiers; the report includes an honest table of the costs that cannot be avoided at commercial launch, so the $0 claim is never overstated."),
("body", "The implementation plan proposes six phases with a vertical-slice strategy: one thin end-to-end path (sign-up through live session with a real worker and visible output) is proven first, then each plane is widened. The plan, the risks, and the open decisions that require your approval are collected in the final chapter. The build does not begin until that approval is given."),
]

C2 = [
("h1", "Current-State Audit"),
("h2", "Workspace inventory"),
("body", "The audit inspected the repository structure, package configuration, environment variables, and all source directories. The complete inventory is short enough to list in full, and it is presented below without embellishment. A single initial commit exists, authored at workspace creation time, containing only the gitignore and an environment stub. There is no frontend, no backend, no API routes, no database schema, no authentication, no worker implementation, no mobile project, no WebRTC layer, and no admin functionality of any kind."),
("table", {
  "caption": "Table 2.1 - Complete audit inventory of the current workspace",
  "headers": ["Area", "Present state", "Classification"],
  "ratios": [0.26, 0.44, 0.30],
  "rows": [
    ["Repository", "Git repo, 1 initial commit (.gitignore only)", "Empty scaffold"],
    ["Environment file", "DATABASE_URL placeholder pointing to local SQLite file", "Stub, will be replaced"],
    ["Frontend / backend", "No package.json, no source files, no routes", "Not implemented"],
    ["Database / ORM", "No schema, no migrations, no DB server", "Not implemented"],
    ["Auth / RBAC", "Nothing exists", "Not implemented"],
    ["Workers / AI / media", "No worker code, no WebRTC, no model integration", "Not implemented"],
    ["Admin / analytics / legal", "Nothing exists", "Not implemented"],
    ["Tests / CI / deployment", "Nothing exists", "Not implemented"],
  ],
}),
("h2", "Audit conclusions against the nine required classifications"),
("body", "The specification asks the audit to classify what works, what partially works, what is broken, what is simulated, and what is insecure. Applying those categories honestly to an empty repository: nothing works, nothing partially works, nothing is broken, nothing is simulated, and nothing is insecure, for the simple reason that nothing exists. What should be kept is nothing; what should be replaced is nothing; what should be refactored is nothing; and what is missing is everything. The practical consequence is positive: the build starts from a clean slate with no technical debt, no data migration burden, and full freedom to implement the correct architecture from day one. The only existing artifact, the SQLite environment variable, will be discarded in favor of a managed PostgreSQL connection string; local SQLite remains available for offline unit tests if useful."),
("body", "The audit also examined the build specification itself for internal risks that should be surfaced now rather than discovered during implementation. Four material constraints emerged and are carried through the rest of this report: the mobile virtual-camera impossibility described in Chapter 3; the H3 licensing constraint that forces an API-first model strategy; the Nigeria Data Protection Act obligations that apply to face and voice data; and the fact that app-store distribution, custom domains, and payment collection each require external accounts and spending that no engineering effort can substitute for. None of these are reasons to abandon the project; all of them are reasons to plan around them explicitly, which the proposed architecture does."),
]

C3 = [
("h1", "Verified Provider Research"),
("body", "Research was conducted in September 2026 using web search against provider documentation, pricing pages, and official terms. The table below records the verified state of each provider the specification names. Prices and limits change; every figure here should be re-verified at contracting time, and the build plan includes a pre-launch re-verification step. Where a claim could not be verified from an authoritative source, it is marked accordingly rather than asserted."),
("table", {
  "caption": "Table 3.1 - Verified provider status (researched September 2026)",
  "headers": ["Provider", "Verified status and free tier", "Commercial constraint"],
  "ratios": [0.16, 0.46, 0.38],
  "rows": [
    ["Better Auth", "VERIFIED: actively maintained; took over Auth.js stewardship Sep 2025. Free, open source, TypeScript-first.", "None; standard OSS license"],
    ["Cloudflare R2", "VERIFIED: 10 GB storage/month free, 1M Class A + 10M Class B ops free, zero egress fees; then $0.015/GB-month.", "Pay-as-you-go beyond free tier"],
    ["Cloudflare Realtime", "VERIFIED: SFU + TURN; TURN free when used with the SFU; $0.05/GB outbound after 1 TB free.", "Newer product; smaller SDK ecosystem than LiveKit"],
    ["LiveKit", "VERIFIED: open source, self-host free; Cloud free tier includes 1,000 agent-session minutes and 40,000 transport requests monthly.", "Cloud paid tiers meter per minute"],
    ["Neon Postgres", "VERIFIED: free plan 0.5 GB storage per project, 100 compute-hours/month, scale-to-zero.", "Storage ceiling for free tier"],
    ["Vercel", "VERIFIED: Hobby plan $0 (100 GB bandwidth, 1M invocations) but is for personal, non-commercial use.", "Commercial launch requires Pro at $20/month"],
    ["Railway", "VERIFIED: one-time $5 trial credit (30 days); thereafter $1/month free credit, Hobby $5/month + usage.", "Not free for production hosting"],
    ["RunPod", "VERIFIED: RTX A5000 community pods from roughly $0.16-0.27/hour; serverless tier from about $0.58/hour.", "Usage-based; region-dependent price/availability"],
    ["Kaggle", "VERIFIED: 30 GPU-hours/week per accelerator type, quota resets Saturday.", "Terms restrict use to non-commercial; unsuitable as production backbone"],
    ["MiniMax H3", "VERIFIED: shipping open-weight multimodal model (Aug 2026) with official API; accepts up to 9 images + 3 videos + 3 audio inputs for consistency.", "Self-hosted commercial use requires written permission from MiniMax; production must use official API. Reported self-host geo-restrictions require license review"],
    ["PostHog", "VERIFIED: free tier 1M analytics events, 5K session recordings, 1M feature-flag requests monthly.", "Usage-based beyond"],
    ["NDPA (Nigeria)", "VERIFIED: Nigeria Data Protection Act 2023; NDPC regulator; biometric data is sensitive; high-risk processing triggers DPIA duties.", "Registration duties for controllers of major importance; legal counsel required"],
  ],
}),
("h2", "Critical finding 1 - MiniMax H3 is real, and its license decides the architecture"),
("body", "The specification instructs not to guess whether H3 exists or what it can do. Verified current state: MiniMax H3 and H3-Max are a new-generation general-purpose multimodal video generation system, published as open weights on Hugging Face (August 2026) and offered through the official MiniMax platform API and third-party inference hosts. The model accepts multiple reference images, videos and audio tracks in a single request specifically to preserve character and voice consistency, which aligns directly with this platform's character-fidelity requirement. Community reporting (marked REQUIRES VERIFICATION against the current LICENSE file before any commitment) indicates the self-hosting license prohibits commercial use without prior written permission, and that self-hosted use may carry geographic restrictions. The architectural consequence adopted in this report: <b>H3 is treated as a capability delivered through the official API for all production traffic, and self-hosting is confined to development and evaluation only</b>. This converts an uncertain licensing problem into a metered, legitimate operating cost, and it is the reason the compute plane exposes models as swappable capabilities rather than hard-coded dependencies."),
("h2", "Critical finding 2 - mobile virtual cameras are impossible; the phone-to-phone adapter is the honest path"),
("body", "Verified against WhatsApp's own documentation and multiple platform sources: mobile apps such as WhatsApp, Instagram, Telegram, and TikTok enumerate physical camera devices and provide no mechanism for a third-party application to register a virtual camera on iOS or Android. On desktop, tools like OBS can inject a virtual camera into some apps; on mobile, the operating system simply does not offer this to sandboxed third-party apps. The specification anticipated exactly this risk and mandated the fallback: a phone-to-phone physical camera adapter, where the first phone displays the AI-transformed live output fullscreen while a second phone physically films that screen for use inside any social app. This report therefore treats phone-to-phone as a first-class output adapter, honestly named a physical-camera adapter, and the product copy will never claim direct integration with WhatsApp, Instagram, TikTok, Telegram, or Facebook unless such integration is actually built and verified on target devices."),
("h2", "Critical finding 3 - hosting terms shape the launch decision"),
("body", "Vercel's Hobby plan is free but explicitly limited to personal, non-commercial projects. For development and internal demos this is perfectly appropriate; the moment the platform serves real users as a business, the correct choices are Vercel Pro ($20/month) or a self-hosted alternative such as a small VPS with Coolify or a Railway Hobby workspace. This report recommends deciding at Phase 5 (launch preparation) rather than now, because the control plane is a standard Next.js application and remains portable across all three options. The same honesty applies to app stores: distributing the mobile application requires an Apple Developer account ($99/year) and a Google Play account ($25 one-time), both REQUIRES EXTERNAL CREDENTIAL items that no code can substitute."),
]

C4 = [
("h1", "Proposed Three-Plane Architecture"),
("body", "The architecture adopts the specification's three-plane separation without modification, because the separation itself is the primary defense against the classic failure mode of media platforms: choking ordinary request/response infrastructure with high-frequency video traffic. Each plane has a distinct responsibility, a distinct failure domain, and a distinct scaling profile. The control plane holds state and truth; the media plane moves real-time streams; the compute plane does GPU work. The diagram below shows the arrangement, and the sections after it describe each plane in turn."),
("img", {"path": "diagram.png", "caption": "Figure 4.1 - Three-plane architecture with transport boundaries"}),
("h2", "Control plane"),
("body", "The control plane is the system of record. It owns authentication and sessions (Better Auth), authorization and role checks, users and organizations, characters and their face/voice assets, projects, live-session state machines, job records, credits and billing state, consent records, moderation queues, audit logs, feature flags, system configuration, the provider and worker registries, the capability registry, and the AI Brain with its tool registry. It is implemented as a Next.js application with server-side validation on every route, backed by PostgreSQL through Drizzle ORM. Nothing in the control plane ever touches raw video frames; it issues commands, records facts, and observes status. This keeps its scaling profile ordinary (stateless API plus a relational database) even as the media and compute planes scale in far more dramatic ways."),
("h2", "Media plane"),
("body", "The media plane is LiveKit. All camera and microphone transport travels over WebRTC: the client publishes its tracks to a LiveKit room, and GPU workers join that same room as participants to receive the inbound track and publish the transformed outbound track back to the client. This is the worker-as-participant pattern LiveKit was designed around, and it guarantees the specification's rule that raw live video never passes through ordinary REST endpoints. LiveKit is chosen over building raw WebRTC and over Cloudflare Realtime for the initial build because its agent framework and client SDKs directly implement this pattern; Cloudflare Realtime remains a documented fallback with attractive pricing ($0.05/GB after the first TB free) should LiveKit costs or operations become a problem. The media plane also owns recordings: completed session recordings are written to object storage, never to the database itself."),
("h2", "Compute plane"),
("body", "The compute plane is a fleet of authenticated GPU workers speaking a provider-independent protocol (Chapter 8). Workers run on RunPod pods (pay-as-you-go, scaled to zero when idle) and execute face processing, voice processing, avatar generation, lip synchronization, and video generation tasks. The MiniMax H3 capability is reached through the official API as a managed provider rather than a self-hosted model, per the licensing constraint in Chapter 3. FFmpeg runs inside workers under a strict execution policy: argument allowlists, validated file paths, resource limits, and timeouts, with uploaded media always treated as untrusted input. Kaggle may be used for development experiments within its 30-hour weekly quota but is never a production worker, per its terms. The plane exposes exactly one thing to the control plane: a worker identity, its capabilities, and its health."),
("h2", "Why the separation matters"),
("body", "Three concrete reasons. First, failure isolation: a GPU driver crash in the compute plane must never take down login, billing, or session records, and a LiveKit outage must not corrupt job state. Second, independent scaling: on a launch day, media bandwidth and GPU capacity are the scarce resources, and the three-plane layout lets each be scaled (and billed) on its own axis without over-provisioning the others. Third, provider independence: because workers register through a protocol rather than being hard-wired to RunPod or any GPU vendor, and because models are entries in a capability registry rather than names burned into business logic, replacing any single provider is a configuration change, not a rewrite. This is the property that makes the platform honest about its own infrastructure instead of married to it."),
]

C5 = [
("h1", "Technology Decisions and Rationale"),
("body", "Every technology below was selected against the specification's criteria: reliability, cost, free-tier availability, accessibility from Nigeria, performance, security, scalability, operational complexity, mobile compatibility, WebRTC compatibility, GPU compatibility, and commercial licensing. Alternatives considered and rejected are listed with reasons, because a decision without a rejected alternative is a decision that has not really been made."),
("table", {
  "caption": "Table 5.1 - Technology decisions with rationale and rejected alternatives",
  "headers": ["Layer", "Decision", "Why", "Rejected alternative"],
  "ratios": [0.14, 0.20, 0.40, 0.26],
  "rows": [
    ["Web app", "Next.js + TypeScript", "Server-side validation, API routes colocated with UI, mature ecosystem, deployable on Vercel/VPS alike; strict TS catches contract drift early.", "Plain SPA + separate API (more moving parts, no SSR benefit here)"],
    ["Auth", "Better Auth", "Actively maintained, took over Auth.js stewardship Sep 2025; email/password, OAuth, passkeys, 2FA, orgs as plugins; secure HTTP-only cookies; free.", "Clerk (per-MAU cost), custom crypto (unjustifiable risk)"],
    ["Database", "PostgreSQL (Neon) + Drizzle ORM", "Relational fits users/characters/jobs/consent/audit; Drizzle is typed, migration-first, no runtime magic; Neon free tier for dev, scale later.", "MongoDB (schemaless harms integrity of consent/audit records)"],
    ["Job queue", "pgboss on Postgres", "Durable, transactional with job records, zero extra infrastructure; sufficient at launch scale.", "Redis + BullMQ now (extra service to secure/operate before it is needed)"],
    ["Realtime media", "LiveKit", "Worker-as-participant agent pattern, mature JS/RN SDKs, OSS self-host option, Cloud free tier for dev.", "Cloudflare Realtime (cheaper per GB but younger agent story - kept as fallback); raw WebRTC P2P (no SFU, no multi-worker routing)"],
    ["Object storage", "Cloudflare R2", "10 GB free, zero egress (critical for video), S3-compatible SDK, presigned URLs, lifecycle rules.", "S3 (egress fees), Vercel Blob (smaller free tier)"],
    ["GPU workers", "RunPod pods, provider-independent protocol", "Pay-per-second pods, scale to zero, container-friendly; protocol keeps vendor swappable.", "Reserved GPU servers (fixed cost), Kaggle (non-commercial terms)"],
    ["Video model", "MiniMax H3 via official API", "Character/voice consistency inputs; open weights exist but self-host commercial use needs written permission - API route is legitimate and metered.", "Self-hosting H3 (license risk), unverified closed providers"],
    ["Analytics", "PostHog, consent-gated", "1M events/month free covers launch; feature flags included; session recording disabled by default.", "Self-hosted analytics (operational cost without benefit at this scale)"],
    ["Mobile", "Expo React Native", "True native app (not a WebView): camera/mic permissions, keep-awake fullscreen output, session recovery; over-the-air updates.", "WebView wrapper (explicitly forbidden by spec), native Swift/Kotlin (2x codepaths)"],
  ],
}),
("body", "Two decisions deserve explicit honesty about their boundaries. The pgboss-over-Redis choice is a launch-scale decision, not a permanent one: if worker heartbeat volume or queue depth ever makes Postgres the bottleneck, Redis enters the architecture at that point, behind the same queue interface, and nothing above that interface changes. Similarly, LiveKit self-hosting on a modest VPS is the $0-friendly path and LiveKit Cloud with its free tier is the low-operations path; the report recommends starting on whichever the operator prefers and treats switching as configuration rather than surgery, because the client code speaks LiveKit's protocol identically in both cases. The unifying principle across all decisions is the specification's own: prefer simple systems that actually work over impressive systems that might."),
]

C6 = [
("h1", "Cost and Free-Tier Analysis"),
("body", "The specification's cost philosophy is adopted verbatim: $0 upfront, then free tiers, then pay-as-you-go, then user-funded usage, and paid infrastructure only when justified. The table below shows the honest shape of that ladder for this platform. Development and internal testing genuinely run on $0 across every component. The second table lists the costs that cannot be engineered away; they are external accounts, fees, and usage-based charges that arrive with commercial operation. Presenting both tables together is deliberate: the platform can truthfully say it costs nothing to build and test, while never claiming it costs nothing to run."),
("table", {
  "caption": "Table 6.1 - $0 development stack (all verified free tiers)",
  "headers": ["Component", "Provider / tier", "What the free tier covers"],
  "ratios": [0.24, 0.26, 0.50],
  "rows": [
    ["Web + API hosting", "Vercel Hobby", "100 GB bandwidth, 1M function invocations - fine for development and internal demos (non-commercial use only)"],
    ["Database", "Neon Free", "0.5 GB storage, 100 compute-hours/month, 10 branches - sufficient for schema development and tests"],
    ["Object storage", "Cloudflare R2", "10 GB storage, 1M Class A + 10M Class B operations, zero egress"],
    ["Realtime media", "LiveKit OSS self-host or Cloud free tier", "Self-host on a local machine for development; Cloud free tier provides 1,000 agent minutes + 40K requests/month"],
    ["Auth", "Better Auth", "Open source, no metering"],
    ["Analytics", "PostHog Free", "1M events, 5K recordings, 1M flag requests monthly"],
    ["GPU compute (dev)", "Kaggle", "30 GPU-hours/week for development experiments within non-commercial terms"],
    ["Job queue", "pgboss", "Runs inside the existing Postgres - no additional service"],
  ],
}),
("table", {
  "caption": "Table 6.2 - Costs that arrive with commercial operation (cannot be engineered away)",
  "headers": ["Item", "Cost (verified)", "When it is needed"],
  "ratios": [0.28, 0.30, 0.42],
  "rows": [
    ["Vercel Pro (or VPS/Railway)", "$20/month (Pro)", "At commercial launch - Hobby tier is non-commercial"],
    ["Apple Developer account", "$99/year", "Before shipping the iOS app"],
    ["Google Play account", "$25 one-time", "Before shipping the Android app"],
    ["Custom domain", "~$10-15/year", "Launch; also enables HTTPS certificates"],
    ["MiniMax H3 API usage", "Pay-per-request; promo pricing observed on some hosts", "Every production generation job"],
    ["RunPod GPU time", "~$0.16-0.27/hr per A5000 community pod", "Live/face/voice sessions and batch jobs; scales with usage"],
    ["LiveKit at scale", "Self-host VPS (~$5-20/month) or Cloud paid tier", "When free tiers are exceeded by real traffic"],
    ["Postgres at scale", "Neon paid tier when >0.5 GB / compute limits", "With user growth"],
    ["Payment provider", "Not yet selected - requires verification for Nigeria", "Before charging users; until then credits are manually granted"],
  ],
}),
("body", "The platform's user-funded usage model is the credit system: generation and live-session minutes are metered per job and priced in credits, so GPU and API costs track revenue instead of preceding it. Cost control on the infrastructure side comes from the compute sleep system (Chapter 8): workers scale to zero when idle, so the platform pays for GPU capacity only while sessions or jobs actually run. The single largest variable cost is live-session GPU time; at the observed RunPod community rate of roughly $0.27 per A5000 hour, a ten-minute live session costs on the order of $0.05 of raw compute before model API costs, which sets a sane ceiling for credit pricing. Payment collection in Nigeria requires a provider decision (Paystack, Flutterwave, or similar) that is explicitly out of Phase-1 scope and flagged in the approval gate; until a provider is integrated and verified, no charging occurs and refunds are handled as manual credit adjustments, which is exactly what the refund policy will state."),
]
