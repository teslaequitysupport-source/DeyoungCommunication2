/**
 * The platform surface — one route (sandbox constraint), two states:
 *
 *   signed out → honest product hero + the real auth panel
 *   signed in  → the app shell (overview / characters / media & consent /
 *                live studio / jobs) — every number on it is fetched from
 *                the running backend
 *
 * Nothing on this page is simulated; unavailable subsystems say so.
 */

import { headers } from "next/headers";
import { Activity, ShieldCheck, Video, Workflow } from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthPanel, type ConsoleUser } from "@/components/console/auth-panel";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function getSessionUser(): Promise<ConsoleUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: String(session.user.role ?? "USER"),
    status: String(session.user.status ?? "ACTIVE"),
    emailVerified: Boolean(session.user.emailVerified),
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  };
}

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: "Consent-first processing",
    body: "Live transforms require an explicit, purpose-scoped consent record you can withdraw at any time — withdrawal blocks new sessions immediately.",
  },
  {
    icon: Workflow,
    title: "A real job system",
    body: "Every task is a durable record: atomically claimed by an authenticated worker, retried safely behind idempotency keys, observable end to end.",
  },
  {
    icon: Video,
    title: "Live camera transforms",
    body: "Your camera frames stream to an assigned worker and come back transformed, with the session state shown exactly as the backend reports it.",
  },
  {
    icon: Activity,
    title: "Honest status, always",
    body: "No fabricated progress bars or simulated activity. When a worker is loading, you see it loading; when it is degraded, you see recovery.",
  },
];

export default async function Home() {
  const user = await getSessionUser();

  if (user) {
    return (
      <AppShell
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 space-y-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Live Character Platform
            </h1>
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
              Phase 5 · Launch gates
            </Badge>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            Create a character, grant consent, and have your live camera
            frames transformed by a real worker — with credits, automatic
            refunds for undelivered work, and your data always exportable or
            deletable. Real accounts, real storage, real workers, real state.
          </p>
        </header>

        <section aria-label="What this platform does" className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AuthPanel user={null} />
          </div>
          <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    {title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section aria-label="Current phase status" className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Status of this build (honest)</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-4xl">
            Live video currently flows over a WebSocket dev transport because
            this environment cannot forward WebRTC media; production swaps the
            same interface to LiveKit. The current worker runs an honest CPU
            color grade; the H3 video-generation path is implemented against
            the official API but waits for an external credential before any
            such job can run. Payments are not integrated — credits are
            manual in this phase, per the Refund Policy. Mobile apps ship next.
            No fake metrics, no simulated activity, anywhere in this build.
          </p>
        </section>
      </main>

      <footer className="mt-auto border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Phased build per the approved architecture: foundations (P0,
            done) → vertical slice (P1, done) → compute reality (P2, done) →
            trust plane (P3, done) → launch gates (P5, this) → mobile (P4,
            next).
          </p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a href="/help" className="text-muted-foreground hover:text-foreground hover:underline">Help</a>
            <a href="/terms" className="text-muted-foreground hover:text-foreground hover:underline">Terms</a>
            <a href="/privacy" className="text-muted-foreground hover:text-foreground hover:underline">Privacy</a>
            <a href="/cookies" className="text-muted-foreground hover:text-foreground hover:underline">Cookies</a>
            <a href="/refunds" className="text-muted-foreground hover:text-foreground hover:underline">Refunds</a>
            <a href="/acceptable-use" className="text-muted-foreground hover:text-foreground hover:underline">Acceptable use</a>
            <a href="/copyright" className="text-muted-foreground hover:text-foreground hover:underline">Copyright</a>
            <a href="/accessibility" className="text-muted-foreground hover:text-foreground hover:underline">Accessibility</a>
            <a href="/voice-rights" className="text-muted-foreground hover:text-foreground hover:underline">Voice &amp; likeness</a>
            <a href="/abuse" className="text-muted-foreground hover:text-foreground hover:underline">Abuse</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
