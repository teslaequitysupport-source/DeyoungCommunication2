import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Administrator Documentation",
  description: "Operating the platform: users, moderation, workers, jobs, security, recovery, and deployments.",
};

const STAFF_ROLES = new Set(["MODERATOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"]);

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "build-status",
    title: "Current build status",
    body: (
      <>
        <p>
          Tested and green: auth + RBAC + the job queue + the worker protocol
          (automated suite), the end-to-end journey (signup → upload →
          consent → session → saved result), and compute sleep/wake
          (idle → SLEEP, job → wake → health check → execute).
        </p>
        <p>
          Environment-bound, stated honestly: live frames currently ride
          the socket.io relay (WebRTC/LiveKit arrives at deploy time, a
          configuration change, not an application rewrite); R2 uploads wait
          for the R2_* credential block (running on the local-dev object
          store); the H3 video-generation path is implemented against the
          official API and waits for an external credential. No payments are
          integrated, credits are manual, per the approved decision. No
          simulated metrics exist anywhere in the build.
        </p>
      </>
    ),
  },
  {
    id: "users",
    title: "Users",
    body: (
      <>
        <p>
          The Admin console (staff tab) searches accounts by email/name and
          shows usage counts. Status transitions are guarded: suspension and
          bans take effect at sign-in (the auth layer refuses non-ACTIVE
          accounts, so stale cookies are dead cookies); unbanning is
          SUPER_ADMIN only; role changes never apply to your own account and
          revoke the target&apos;s sessions. Every action is audited.
        </p>
      </>
    ),
  },
  {
    id: "moderation",
    title: "Moderation",
    body: (
      <>
        <p>
          Reports arrive through the user-facing intake (ten categories) and
          queue in the console with the target content attached. Decisions
          are documented with notes and one of five actions: none, warning,
          suspension, ban, content removal. Enforcement (session revocation,
          content archival, sign-in lockout) is applied by shared code, not
          left to the moderator&apos;s discretion.
        </p>
      </>
    ),
  },
  {
    id: "workers",
    title: "Workers",
    body: (
      <>
        <p>
          Workers register with a name and a credential (only its SHA-256 is
          stored) and announce capabilities (e.g. transform.image,
          transform.live, video.h3) plus a model manifest. The console lists
          the fleet with status, heartbeat latency, and load. Idle workers
          sleep after a timeout; jobs wake them (cold start, shown as
          such). Heartbeat loss marks a worker UNHEALTHY: its jobs requeue
          (or fail with refunds), its live sessions degrade, and recovery
          reassignment routes work to awake capacity. Drain (stop accepting
          new work) and shutdown are available as controls.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Providers",
    body: (
      <>
        <p>
          External providers are environment-configured, never hardcoded:
          the H3 official-API path requires H3_API_BASE_URL + H3_API_KEY
          (both, or jobs wait for a capable worker); storage switches to R2
          with the R2_* block. The capability a provider unlocks is only
          announced by workers that actually hold the credential, the
          platform never claims a provider it cannot reach.
        </p>
      </>
    ),
  },
  {
    id: "brain",
    title: "The Brain (routing intelligence)",
    body: (
      <>
        <p>
          Today the &quot;brain&quot; is the deterministic scheduling layer:
          capability-based selection, priority + FIFO ordering, retry
          budgets per job type, cold-start economics, and failure
          reassignment. It is deliberately not an LLM with tools yet, that
          arrives as a bounded orchestrator over the same job API, with
          schema-validated tool calls and no shell access, per the
          architecture plan. Nothing in the current system pretends
          otherwise.
        </p>
      </>
    ),
  },
  {
    id: "jobs",
    title: "Jobs",
    body: (
      <>
        <p>
          Every async task is a durable job row: state machine (QUEUED →
          RESERVED → RUNNING → SUCCEEDED/FAILED/CANCELLED/EXPIRED),
          idempotency keys (retries never duplicate work), per-type retry
          budgets, and credit spend/refund hooks. Terminal failures,
          cancellations, and expiries refund credits automatically. The
          reservation sweeper recovers claimed-but-never-started jobs.
        </p>
      </>
    ),
  },
  {
    id: "sessions",
    title: "Sessions",
    body: (
      <>
        <p>
          Live sessions run a 14-state server-authoritative machine. Waiting
          sessions expire after a TTL (never hang); abandoned ones (worker
          ready, no publisher) are expired with their jobs refunded;
          STOPPING sessions complete after a grace period. The status
          channel reports real state only.
        </p>
      </>
    ),
  },
  {
    id: "content-assets",
    title: "Content & assets",
    body: (
      <>
        <p>
          Asset uploads are declared (kind, MIME, size), validated against
          the actual bytes (magic sniffing), stored in object storage keyed
          by user, and served through ownership-checked endpoints.
          Moderation content removal archives rather than silently deletes,
          so decisions stay reviewable.
        </p>
      </>
    ),
  },
  {
    id: "credits",
    title: "Credits",
    body: (
      <>
        <p>
          Grants are ADMIN+ with MFA, audited, and exactly-once per
          idempotency key (the console generates one per form submission —
          double-clicks cannot double-grant). The ledger is append-only;
          balance is always SUM(delta). Job costs are env-overridable
          (CREDITS_COST_*), the signup bonus is SIGNUP_BONUS_CREDITS.
          Negative adjustments are intentionally not offered; refunds of
          undelivered work are automatic.
        </p>
      </>
    ),
  },
  {
    id: "flags",
    title: "Feature flags",
    body: (
      <>
        <p>
          Feature gating today is environmental and explicit (H3 configured
          or not; R2 or local-dev storage; trusted origins), surfaced
          honestly in the UI rather than hidden behind a flags service. A
          database-backed flag system arrives when there are enough flags
          to justify one.
        </p>
      </>
    ),
  },
  {
    id: "emergency",
    title: "Emergency controls",
    body: (
      <>
        <p>
          The worker control surface (drain/shutdown) is the incident lever:
          draining stops new assignments fleet-wide while in-flight work
          drains naturally. Sign-in gate enforcement (suspend) blocks a
          compromised account immediately. SUPER_ADMIN holds roles:assign
          and unbans, separation that survives an account compromise.
        </p>
      </>
    ),
  },
  {
    id: "audit",
    title: "Audit logs",
    body: (
      <>
        <p>
          Append-only by convention and code path (no update/delete API
          exists), with actor email/role denormalized so entries survive
          actor deletion. Auth events, moderation decisions, admin user
          actions, worker control, credit grants, exports, deletions, and
          retention sweeps are all recorded. Retention prunes entries past
          the window (default 730 days).
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security posture",
    body: (
      <>
        <p>
          Better Auth sessions (signed cookies, HttpOnly); RBAC with five
          roles and granular permissions checked server-side; MFA (TOTP)
          required for elevated roles on every elevated API call; DB-backed
          rate limits on all intake surfaces; worker credentials stored as
          hashes; uploads validated by declared+sniffed MIME; path traversal
          blocked in the storage layer; secrets live in the environment
          only. The security review checklist from the build specification
          is tracked in the repository docs.
        </p>
      </>
    ),
  },
  {
    id: "recovery",
    title: "Incident recovery",
    body: (
      <>
        <p>
          Job recovery: heartbeat monitor → requeue/fail with reassignment →
          orphan safety net for QUEUED types with no awake capacity.
          Session recovery: DEGRADED → RECOVERING on re-claim. Worker
          recovery: re-registration with a fresh credential (old one rotates
          out). Stack recovery: the start-stack script brings the whole
          service set up idempotently, and the DB is the source of truth —
          restarting the app never loses state.
        </p>
      </>
    ),
  },
  {
    id: "backups",
    title: "Backups",
    body: (
      <>
        <p>
          Honest state: automated backups are NOT configured in the dev
          environment (a local dev database is not a production asset). For
          production: the Postgres provider&apos;s point-in-time restore is
          the database strategy, object storage durability is the media
          strategy, and environment (secrets, config) is restorable from
          the deployment repository. A restore drill is on the launch
          checklist, backups that have never been restored are hopes, not
          backups.
        </p>
      </>
    ),
  },
  {
    id: "deployments",
    title: "Deployments",
    body: (
      <>
        <p>
          Deployment is documented in DEPLOYMENT.md: Next.js on the
          platform host, Postgres on the managed provider, object storage on
          R2, workers on the GPU host with the worker protocol, scheduler as
          a scheduled job. Configuration is entirely environment-driven
          (.env.example is the contract). The gate for every deploy: lint,
          typecheck, full test suite, then smoke.
        </p>
      </>
    ),
  },
];

export default async function AdminHelpPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = String(session?.user?.role ?? "USER");
  if (!session?.user || !STAFF_ROLES.has(role)) {
    redirect("/help");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/50">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
          <Link
            href="/help"
            className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← User documentation
          </Link>
          <h1 className="font-display mt-4 text-3xl font-bold tracking-tight">
            Administrator Documentation
          </h1>
          <p className="mt-3 text-muted-foreground">
            Operating the platform, written for staff, kept honest about
            what exists and what does not.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10 space-y-12">
        {SECTIONS.map((s) => (
          <section key={s.id} aria-labelledby={`h-${s.id}`}>
            <h2 id={`h-${s.id}`} className="text-xl font-semibold">
              {s.title}
            </h2>
            <div className="mt-3 space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
              {s.body}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
