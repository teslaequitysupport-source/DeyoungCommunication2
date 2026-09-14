/**
 * The landing surface — one route (sandbox constraint), two states:
 *
 *   signed out → the product story + real auth panel
 *   signed in  → the app shell (characters / media & consent /
 *                live studio / renders)
 *
 * The home page carries the story, not the whole catalogue. Deep
 * dives live on their own routes: /live (streaming and social),
 * /app (the mobile app), /support (answers and contact), plus the
 * legal centre.
 *
 * Register rhythm: black (hero) → red (ticker) → black (problem,
 * product) → paper (how it works) → black (explore) → red (the
 * call) → black (start, footer). Flat blocks, hairline rules, film
 * grain — editorial, never decorated.
 */

import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Coins,
  Database,
  Radio,
  ShieldCheck,
  Smartphone,
  Wand2,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthPanel, type ConsoleUser } from "@/components/console/auth-panel";
import { AppShell } from "@/components/app/app-shell";
import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { StudioStage } from "@/components/fx/studio-stage";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BrandMark } from "@/components/fx/brand-mark";
import { SectionMark } from "@/components/site/section-mark";
import { BRAND } from "@/lib/brand";

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
    body: "One explicit grant, scoped to a purpose. Withdraw it any time and new sessions stop instantly. No support ticket, no delay.",
  },
  {
    icon: Clapperboard,
    title: "Real-time transforms",
    body: "Your camera frames stream to the render layer and come back transformed: live, on screen, in the moment you're in.",
  },
  {
    icon: Coins,
    title: "Credits that stay honest",
    body: "Every job is priced before it runs and refunded automatically if it can't be delivered. You never pay for what you don't get.",
  },
  {
    icon: Wand2,
    title: "Your data, your call",
    body: "Export everything or delete your account in one action. Built to NDPR standards. Your face and voice belong to you.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create your character",
    body: "Bring the identity you want on screen: name, look, presence. It's yours, and only yours.",
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

const TICKER_ITEMS = [
  "Live characters",
  "Real-time render",
  "Consent-first",
  "Priced per render",
  "Built for NDPR",
  "Your face, your rules",
];

const ACCOUNT_BENEFITS = [
  "Welcome credits to run your first renders",
  "Characters, media and consent in one place",
  "Live studio for real-time sessions",
  "Export or delete your data whenever you choose",
];

const DEEP_DIVES = [
  {
    icon: Radio,
    n: "01",
    title: "Take it live",
    body: "OBS, Twitch, YouTube, TikTok: how the character plugs into the stages you already broadcast on.",
    href: "/live",
    cta: "The streaming guide",
  },
  {
    icon: Smartphone,
    n: "02",
    title: "The app",
    body: "The same studio, built for the phone in your pocket. Coming soon to both stores, honest about it.",
    href: "/app",
    cta: "See the app",
  },
  {
    icon: Database,
    n: "03",
    title: "Your data",
    body: "Captured, transformed, stored, returned. The full lifecycle is published, not paraphrased.",
    href: "/privacy",
    cta: "The data map",
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
    <div
      id="top"
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <SiteNav brandName={BRAND.name} tagline={BRAND.tagline} />

      {/* ─── Hero — the promise and the product ─────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Editorial column hairlines — structure, barely there */}
        <div
          className="pointer-events-none absolute inset-0 mx-auto hidden max-w-[var(--container-width)] grid-cols-4 lg:grid"
          aria-hidden="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-l border-white/[0.05]" />
          ))}
        </div>

        <div className="container-x relative px-4 pb-20 pt-14 sm:px-6 lg:pb-28 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-8">
              <Reveal className="space-y-8">
                <RevealItem>
                  <p className="inline-flex items-center gap-2.5 rounded-full border border-primary/50 bg-primary/[0.08] px-3.5 py-1.5 text-xs font-semibold tracking-[0.08em] text-white/80">
                    <span
                      className="on-air-dot size-1.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    OPEN BETA · FREE TO START
                  </p>
                </RevealItem>

                <RevealItem>
                  <h1 className="display-hero">
                    Your camera.
                    <br />
                    Your character.
                    <br />
                    <span className="text-primary">Live.</span>
                  </h1>
                </RevealItem>

                <RevealItem>
                  <p className="measure text-lg leading-relaxed text-white/68">
                    Deyoung Live turns your live video into the
                    character you created, while you stream, call and
                    record. Consent-first. Priced per render. Built for
                    Nigeria.
                  </p>
                </RevealItem>

                <RevealItem>
                  <div className="flex flex-wrap items-center gap-4">
                    <a
                      href="#start"
                      className="group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-[0.95rem] font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px"
                    >
                      Create free account
                      <ArrowRight
                        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </a>
                    <a
                      href="#how"
                      className="inline-flex h-12 items-center rounded-xl border border-white/20 bg-white/[0.06] px-7 text-[0.95rem] font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/[0.1] active:translate-y-px"
                    >
                      See how it works
                    </a>
                  </div>
                </RevealItem>

                <RevealItem>
                  <ul className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-white/50">
                    {TRUST_CHIPS.map((chip, i) => (
                      <li key={chip} className="flex items-center gap-2">
                        {i > 0 && (
                          <span className="text-primary/70" aria-hidden="true">
                            /
                          </span>
                        )}
                        {chip}
                      </li>
                    ))}
                  </ul>
                </RevealItem>
              </Reveal>
            </div>

            <StudioStage />
          </div>
        </div>
      </section>

      {/* ─── The broadcast ticker ────────────────────────────────────── */}
      <div
        className="band overflow-hidden border-y border-black/25 py-3.5"
        aria-hidden="true"
      >
        <div className="ticker-track">
          {[0, 1].map((dup) => (
            <div
              key={dup}
              className="flex shrink-0 items-center"
              style={{ minWidth: "100%" }}
            >
              {TICKER_ITEMS.map((item) => (
                <span
                  key={`${dup}-${item}`}
                  className="flex items-center font-display text-[0.8rem] font-medium uppercase tracking-[0.22em] text-black"
                >
                  <span className="px-6">{item}</span>
                  <span className="text-black/40">/</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── The problem — why this exists ───────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <Reveal>
            <RevealItem className="mb-6">
              <SectionMark n="01" label="The problem" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">On camera, you get you.</h2>
            </RevealItem>
          </Reveal>
          <Reveal className="space-y-5 text-white/68 sm:mt-2 lg:mt-14">
            <RevealItem>
              <p className="leading-relaxed">
                Streaming or calling as yourself every day means your actual
                face travels to strangers, recorded and forwarded without
                your say. The alternative, pre-recorded clips, loses the
                one thing that makes live video worth watching: it's live.
              </p>
            </RevealItem>
            <RevealItem>
              <p className="leading-relaxed">
                Deyoung Live is the third option. You perform; the character
                renders in real time. Your face powers the performance
                without being the performance.
              </p>
            </RevealItem>
          </Reveal>
        </div>
      </section>

      {/* ─── Features — what you get ────────────────────────────────── */}
      <section id="product" className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="02" label="The product" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">Made for live. Built for trust.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                Four things this platform will not compromise on, because
                a live character is only worth running if it's worth
                trusting.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2">
            {VALUE_PROPS.map(({ icon: Icon, title, body }, i) => (
              <RevealItem key={title}>
                <article className="group h-full border-t border-border pt-6 transition-colors hover:border-primary/60">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-display text-sm font-bold tracking-widest text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Icon
                      className="size-5 text-white/35 transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/68">
                    {body}
                  </p>
                </article>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works — the paper register ──────────────────────── */}
      <section id="how" className="paper border-b border-black/10">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="03" label="How it works" ink />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1 text-black">Three steps. That's all.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-black/70">
                No setup marathons, no settings mazes. The only decisions
                you make are the ones that matter to you.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map(({ n, title, body }) => (
              <RevealItem key={n}>
                <div className="space-y-5 border-t-2 border-black pt-6">
                  <span className="text-outline-ink block font-display text-[5.5rem] font-bold leading-none">
                    {n}
                  </span>
                  <h3 className="font-display text-xl font-semibold tracking-tight text-black">
                    {title}
                  </h3>
                  <p className="max-w-xs text-sm leading-relaxed text-black/70">
                    {body}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>

          {/* The closing row — statement left, action right */}
          <Reveal className="mt-16">
            <div className="flex flex-col gap-6 border-t-2 border-black pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm font-display text-xl font-semibold tracking-tight text-black">
                Your first render is on us.
              </p>
              <a
                href="#start"
                className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-black px-7 text-[0.95rem] font-semibold text-white transition-transform active:translate-y-px"
              >
                Start with free credits
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Go deeper — the routes beyond the fold ─────────────────── */}
      <section className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="04" label="Go deeper" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">Past the fold.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                The story above is the short version. These pages carry
                the rest, each in its own place.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {DEEP_DIVES.map(({ icon: Icon, n, title, body, href, cta }) => (
              <RevealItem key={href}>
                <Link
                  href={href}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-7 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/28"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-sm font-bold tracking-widest text-primary">
                      {n}
                    </span>
                    <Icon
                      className="size-5 text-white/35 transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/68">
                    {body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                    {cta}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ─── The call — the one red shout ───────────────────────────── */}
      <section className="band border-y border-black/25">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mx-auto max-w-3xl space-y-8 text-center">
            <RevealItem>
              <h2 className="display-hero text-black">
                Your character<br />is waiting.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="mx-auto max-w-xl text-[1.05rem] leading-relaxed text-black/80">
                Create a free account, grant your first consent, and watch
                your camera transform. No card, no commitment, and welcome
                credits included.
              </p>
            </RevealItem>
            <RevealItem>
              <a
                href="#start"
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-black px-8 text-[0.95rem] font-semibold text-white transition-transform active:translate-y-px"
              >
                Create free account
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </RevealItem>
          </Reveal>
        </div>
      </section>

      {/* ─── Get started — the auth panel ───────────────────────────── */}
      <section id="start">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5 lg:gap-16 lg:py-28">
          <div className="lg:col-span-2">
            <AuthPanel user={null} />
          </div>
          <div className="lg:col-span-3">
            <Reveal className="space-y-6">
              <RevealItem>
                <BrandMark size={40} />
              </RevealItem>
              <RevealItem>
                <h2 className="display-1">Every render, on the record.</h2>
              </RevealItem>
              <RevealItem>
                <p className="measure text-white/68">
                  Your account keeps characters, consent grants, credit
                  history and renders in one place: each one auditable by
                  you, deletable by you.
                </p>
              </RevealItem>
              <RevealItem>
                <ul className="space-y-3">
                  {ACCOUNT_BENEFITS.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-3 text-sm text-white/75"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </RevealItem>
            </Reveal>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
