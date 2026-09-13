/**
 * The platform surface — one route (sandbox constraint), two states:
 *
 *   signed out → the premium product story + real auth panel
 *   signed in  → the app shell (characters / media & consent /
 *                live studio / jobs)
 *
 * The story speaks the user's language only. Build-phase detail,
 * transport internals and provider notes live on the staff help page.
 */

import { headers } from "next/headers";
import { Clapperboard, Sparkles, ShieldCheck, Wand2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthPanel, type ConsoleUser } from "@/components/console/auth-panel";
import { AppShell } from "@/components/app/app-shell";
import { HeroFX } from "@/components/fx/hero-fx";
import { HeroGem } from "@/components/fx/hero-gem";
import { TiltCard } from "@/components/fx/tilt-card";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BrandMark } from "@/components/fx/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND, LEGAL_LINKS } from "@/lib/brand";

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

const VALUE_PROPS = [
  {
    icon: ShieldCheck,
    title: "Consent you control",
    body: "One explicit grant, scoped to a purpose. Withdraw it any time and new sessions stop instantly — no support ticket, no delay.",
  },
  {
    icon: Clapperboard,
    title: "Real-time transforms",
    body: "Your camera frames stream to the render layer and come back transformed — live, on screen, in the moment you're in.",
  },
  {
    icon: Sparkles,
    title: "Credits that stay honest",
    body: "Every job is priced before it runs and refunded automatically if it can't be delivered. You never pay for what you don't get.",
  },
  {
    icon: Wand2,
    title: "Your data, your call",
    body: "Export everything or delete your account in one action. Built to NDPR standards — your face and voice belong to you.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create your character",
    body: "Bring the identity you want on screen — name, look, presence. It's yours, and only yours.",
  },
  {
    n: "02",
    title: "Grant consent once",
    body: "Approve exactly what your face and voice are used for. The platform enforces the scope you set.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Open the studio and see yourself transformed in real time. End the session whenever you like.",
  },
];

const TRUST_CHIPS = [
  "Consent-first by design",
  "Automatic refunds",
  "One-tap data export",
  "Built for NDPR",
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
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      {/* ─── Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BrandMark size={30} />
          <span className="font-display text-lg font-semibold tracking-tight">
            {BRAND.name}
          </span>
          <span className="ml-3 hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white/60 sm:inline-flex">
            {BRAND.tagline}
          </span>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-white/60 md:flex">
            <a href="#how" className="transition-colors hover:text-white">
              How it works
            </a>
            <a href="/help" className="transition-colors hover:text-white">
              Help
            </a>
            <a href="#start" className="transition-colors hover:text-white">
              Sign in
            </a>
          </nav>
          <a
            href="#start"
            className="ml-auto rounded-lg bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_oklch(0.62_0.235_22/0.65)] transition-all hover:shadow-[0_12px_36px_-6px_oklch(0.62_0.235_22/0.85)] hover:brightness-110 active:translate-y-px active:shadow-none md:ml-6"
          >
            Get started
          </a>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <HeroFX />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pb-28 lg:pt-24">
          <div className="space-y-8">
            <Reveal className="space-y-8">
              <RevealItem>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/85">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Live character rendering — now in open beta
                </div>
              </RevealItem>

              <RevealItem>
                <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                  Your camera.
                  <br />
                  Your character.
                  <br />
                  <span className="animate-shine bg-gradient-to-r from-white via-white to-primary bg-[position:0%_center] text-transparent [background-repeat:no-repeat]">
                    Rendered live.
                  </span>
                </h1>
              </RevealItem>

              <RevealItem>
                <p className="max-w-xl text-lg leading-relaxed text-white/60">
                  Create a character, grant consent once, and watch your
                  live camera transform in real time. Credits you control,
                  refunds that are automatic, and data you can export or
                  delete — always.
                </p>
              </RevealItem>

              <RevealItem>
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href="#start"
                    className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] px-7 text-[0.95rem] font-semibold text-white shadow-[0_1px_0_oklch(1_0_0/0.25)_inset,0_10px_32px_-8px_oklch(0.62_0.235_22/0.75)] transition-all hover:shadow-[0_1px_0_oklch(1_0_0/0.3)_inset,0_16px_44px_-6px_oklch(0.62_0.235_22/0.9)] hover:brightness-110 active:translate-y-px active:shadow-none"
                  >
                    <span className="pointer-events-none absolute -inset-y-8 -left-3/4 w-1/2 rotate-[18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 blur-[6px] transition-opacity duration-300 group-hover:opacity-100" />
                    <Sparkles className="relative z-10 h-4 w-4" aria-hidden="true" />
                    <span className="relative z-10">Create free account</span>
                    <span className="pointer-events-none absolute -inset-y-8 left-full w-1/2 -translate-x-[340%] rotate-[18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 blur-[6px] transition-all duration-[900ms] ease-out group-hover:translate-x-[340%] group-hover:opacity-100" />
                  </a>
                  <a
                    href="#how"
                    className="inline-flex h-12 items-center rounded-xl border border-white/12 bg-white/[0.03] px-7 text-[0.95rem] font-medium text-white/85 backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-white/[0.06] hover:shadow-[0_0_0_1px_oklch(0.62_0.235_22/0.35),0_8px_28px_-10px_oklch(0.62_0.235_22/0.4)] active:translate-y-px"
                  >
                    See how it works
                  </a>
                </div>
              </RevealItem>

              <RevealItem>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {TRUST_CHIPS.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center gap-1.5 text-[13px] text-white/50"
                    >
                      <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                      {chip}
                    </span>
                  ))}
                </div>
              </RevealItem>
            </Reveal>
          </div>

          <HeroGem />
        </div>
      </section>

      {/* ─── Start / Auth + Value ───────────────────────────────────── */}
      <section
        id="start"
        className="relative border-t border-white/[0.06] bg-gradient-to-b from-transparent via-black/40 to-transparent"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AuthPanel user={null} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-3">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <TiltCard key={title} className="h-full">
                <Card interactive className="h-full gap-4">
                  <CardContent className="space-y-3">
                    <div className="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_20px_-6px_oklch(0.62_0.235_22/0.5)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-lg font-semibold tracking-tight">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-white/55">{body}</p>
                  </CardContent>
                </Card>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────────── */}
      <section id="how" className="relative overflow-hidden border-t border-white/[0.06]">
        <HeroFX dense />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="space-y-3 text-center">
            <RevealItem>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Three steps.{" "}
                <span className="text-primary">That's the whole ritual.</span>
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="mx-auto max-w-2xl text-white/55">
                No setup marathons, no settings mazes. The platform was
                designed so the only decisions you make are the ones that
                matter to you.
              </p>
            </RevealItem>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ n, title, body }, i) => (
              <RevealItem key={n}>
                <div className="group relative">
                  {i < STEPS.length - 1 ? (
                    <div className="absolute left-[calc(50%+3.5rem)] top-8 hidden h-px w-[calc(100%-7rem)] bg-gradient-to-r from-primary/40 via-white/10 to-transparent md:block" />
                  ) : null}
                  <div className="relative space-y-4 text-center md:text-left">
                    <div className="relative mx-auto grid size-[4.5rem] place-items-center md:mx-0">
                      <span className="absolute inset-0 rounded-2xl border border-primary/25 bg-primary/[0.07] shadow-[inset_0_0_32px_oklch(0.62_0.235_22/0.08)] transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-[0_0_36px_-6px_oklch(0.62_0.235_22/0.6),inset_0_0_32px_oklch(0.62_0.235_22/0.14)]" />
                      <span className="font-display text-[1.7rem] font-bold text-primary text-glow">{n}</span>
                    </div>
                    <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
                    <p className="mx-auto max-w-xs text-sm leading-relaxed text-white/55 md:mx-0">
                      {body}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </div>

          <Reveal className="mt-16 flex justify-center">
            <RevealItem>
              <a
                href="#start"
                className="group relative inline-flex h-14 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] px-9 text-base font-semibold text-white shadow-[0_1px_0_oklch(1_0_0/0.25)_inset,0_12px_36px_-8px_oklch(0.62_0.235_22/0.8)] transition-all hover:shadow-[0_1px_0_oklch(1_0_0/0.3)_inset,0_18px_48px_-6px_oklch(0.62_0.235_22/1)] hover:brightness-110 active:translate-y-px active:shadow-none"
              >
                <Clapperboard className="relative z-10 h-5 w-5" aria-hidden="true" />
                <span className="relative z-10">Enter the studio</span>
              </a>
            </RevealItem>
          </Reveal>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer className="relative mt-auto border-t border-white/[0.06] bg-black/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-3">
              <BrandMark size={28} />
              <div>
                <p className="font-display font-semibold tracking-tight">{BRAND.name}</p>
                <p className="text-xs text-white/45">
                  Live characters, rendered responsibly.
                </p>
              </div>
            </div>
            <div className="divider-glow w-full md:hidden" />
            <nav
              aria-label="Legal"
              className="flex max-w-xl flex-wrap gap-x-5 gap-y-2 text-xs"
            >
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-white/45 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="divider-glow mt-10" />
          <p className="mt-6 text-xs text-white/35">
            © {new Date().getFullYear()} {BRAND.name}. Your face, your voice, your rules.
          </p>
        </div>
      </footer>
    </div>
  );
}
