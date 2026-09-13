/**
 * The landing surface — one route (sandbox constraint), two states:
 *
 *   signed out → the product story + real auth panel
 *   signed in  → the app shell (characters / media & consent /
 *                live studio / renders)
 *
 * The story speaks the user's language only. Build-phase detail,
 * transport internals and provider notes live on the staff help page.
 */

import { headers } from "next/headers";
import { ArrowRight, Clapperboard, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthPanel, type ConsoleUser } from "@/components/console/auth-panel";
import { AppShell } from "@/components/app/app-shell";
import { SiteNav } from "@/components/site/site-nav";
import { StudioStage } from "@/components/fx/studio-stage";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BrandMark } from "@/components/fx/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

const ACCOUNT_BENEFITS = [
  "Welcome credits to run your first renders",
  "Characters, media and consent in one place",
  "Live studio for real-time sessions",
  "Export or delete your data whenever you choose",
];

const TRUST_PAGES = [
  {
    href: "/privacy",
    title: "Privacy & the NDPR data map",
    body: "Every category of data we hold, what it's used for, and how long it stays — published in full.",
  },
  {
    href: "/refunds",
    title: "Refunds",
    body: "How credit refunds happen automatically when a render can't be delivered.",
  },
  {
    href: "/voice-rights",
    title: "Voice & likeness rights",
    body: "The rules for faces and voices on this platform — and how to report misuse.",
  },
  {
    href: "/accessibility",
    title: "Accessibility",
    body: "Our accessibility commitment, and how to reach us if something gets in your way.",
  },
];

const FAQS = [
  {
    q: "What does it cost?",
    a: "Creating an account is free and comes with welcome credits. Every render is priced in credits before it runs — and if a job can't be delivered, the credits return to your balance automatically. The full policy is on the refunds page.",
  },
  {
    q: "What do I need to use it?",
    a: "A modern browser and a camera. The studio runs on desktop and mobile web — no download — and it adapts to slow connections by pacing frame quality.",
  },
  {
    q: "Whose face can I use?",
    a: "Only a face you have the right to use — in practice, your own. Every face asset requires an explicit, recorded consent grant scoped to one purpose, and withdrawing consent stops new sessions immediately.",
  },
  {
    q: "What happens to my face and voice data?",
    a: "They're treated as sensitive data under Nigeria's NDPR. You can export everything from Settings at any time, and account deletion removes your media. The exact data map is published on the privacy page.",
  },
  {
    q: "Do credits expire?",
    a: "No. Your balance and full history are visible in Settings, and every spend and refund is listed there.",
  },
  {
    q: "Can I stop mid-session?",
    a: "Yes. Ending a session stops all processing at once — live transforms only run while a session is active.",
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
      <section className="container-x px-4 pb-20 pt-14 sm:px-6 lg:pb-28 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-8">
            <Reveal className="space-y-8">
              <RevealItem>
                <p className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium tracking-wide text-white/75">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Now in open beta — free to start
                </p>
              </RevealItem>

              <RevealItem>
                <h1 className="display-hero">
                  Your camera.
                  <br />
                  Your character.
                  <br />
                  Live.
                </h1>
              </RevealItem>

              <RevealItem>
                <p className="measure text-lg leading-relaxed text-white/68">
                  Deyoung Live turns your live video into the character you
                  create — as you stream, call and record. Consent-first,
                  pay-per-render, built for Nigeria.
                </p>
              </RevealItem>

              <RevealItem>
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    href="#start"
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-7 text-[0.95rem] font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px"
                  >
                    Create free account
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                  <a
                    href="#how"
                    className="inline-flex h-12 items-center rounded-xl border border-border bg-transparent px-7 text-[0.95rem] font-medium text-white/85 transition-colors hover:border-white/28 hover:bg-white/[0.06] active:translate-y-px"
                  >
                    See how it works
                  </a>
                </div>
              </RevealItem>

              <RevealItem>
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {TRUST_CHIPS.map((chip) => (
                    <li
                      key={chip}
                      className="inline-flex items-center gap-1.5 text-[13px] text-white/50"
                    >
                      <span className="size-1 rounded-full bg-primary" aria-hidden="true" />
                      {chip}
                    </li>
                  ))}
                </ul>
              </RevealItem>
            </Reveal>
          </div>

          <StudioStage />
        </div>
      </section>

      {/* ─── The problem — why this exists ───────────────────────────── */}
      <section className="border-t border-border">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-24">
          <Reveal>
            <RevealItem>
              <h2 className="display-1">On camera, you get you.</h2>
            </RevealItem>
          </Reveal>
          <Reveal className="space-y-5 text-white/68 sm:mt-2 lg:mt-3">
            <RevealItem>
              <p className="leading-relaxed">
                Streaming or calling as yourself every day means your actual
                face travels to strangers, recorded and forwarded without
                your say. The alternative — pre-recorded clips — loses the
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
      <section id="product" className="border-t border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-24">
          <Reveal className="mb-12 max-w-2xl space-y-4">
            <RevealItem>
              <h2 className="display-1">Made for live. Built for trust.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                Four things this platform will not compromise on — because
                a live character is only worth running if it's worth
                trusting.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid sm:grid-cols-2 sm:gap-5 [&>*:last-child_[data-slot=card]]:border-b-0">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <RevealItem key={title}>
                <Card
                  interactive
                  className="h-full gap-4 rounded-none border-0 border-b border-border bg-transparent py-5 sm:rounded-xl sm:border sm:bg-card sm:py-6"
                >
                  <CardContent className="space-y-3 px-0 sm:px-6">
                    <span className="grid size-11 place-items-center rounded-lg border border-primary/40 bg-primary/15 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="font-display text-lg font-semibold tracking-tight">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-white/68">
                      {body}
                    </p>
                  </CardContent>
                </Card>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ───────────────────────────────────────────── */}
      <section id="how" className="border-t border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-24">
          <Reveal className="mx-auto max-w-2xl space-y-4 text-center">
            <RevealItem>
              <h2 className="display-1">Three steps. That's all.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                No setup marathons, no settings mazes. The only decisions
                you make are the ones that matter to you.
              </p>
            </RevealItem>
          </Reveal>

          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map(({ n, title, body }) => (
              <RevealItem key={n}>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl font-bold text-primary">
                      {n}
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="max-w-xs text-sm leading-relaxed text-white/68">
                    {body}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust — the real pages ─────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-24">
          <Reveal className="mb-12 max-w-2xl space-y-4">
            <RevealItem>
              <h2 className="display-1">The fine print, in plain sight</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                These aren't links to nowhere — every page below is a real
                document on this platform.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2">
            {TRUST_PAGES.map((page) => (
              <RevealItem key={page.href}>
                <a
                  href={page.href}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-card p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/28"
                >
                  <h3 className="font-display text-lg font-semibold tracking-tight">
                    {page.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-white/68">
                    {page.body}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary underline-offset-4 group-hover:underline">
                    Read
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              </RevealItem>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ — the honest answers ───────────────────────────────── */}
      <section id="faq" className="border-t border-border">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5 lg:py-24">
          <Reveal className="lg:col-span-2">
            <RevealItem>
              <h2 className="display-1">Questions, answered</h2>
            </RevealItem>
            <RevealItem>
              <p className="mt-4 text-white/68">
                Anything else?{" "}
                <a
                  href="/help"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  The help centre
                </a>{" "}
                has the full guide.
              </p>
            </RevealItem>
          </Reveal>
          <div className="lg:col-span-3">
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq, i) => (
                <AccordionItem key={faq.q} value={`q-${i}`}>
                  <AccordionTrigger className="text-left font-display text-base font-semibold tracking-tight hover:text-white [&>svg]:text-primary">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="leading-relaxed text-white/68">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* ─── Get started — the auth panel and final call ───────────── */}
      <section id="start" className="border-t border-border">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5 lg:gap-16 lg:py-24">
          <div className="lg:col-span-2">
            <AuthPanel user={null} />
          </div>
          <div className="lg:col-span-3">
            <Reveal className="space-y-6">
              <RevealItem>
                <BrandMark size={40} />
              </RevealItem>
              <RevealItem>
                <h2 className="display-1">Your character is waiting.</h2>
              </RevealItem>
              <RevealItem>
                <p className="measure text-white/68">
                  Create a free account, grant your first consent, and see
                  your camera transform. No card, no commitment — welcome
                  credits included.
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

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border bg-black">
        <div className="container-x px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-3">
              <BrandMark size={26} />
              <div>
                <p className="font-display font-semibold tracking-tight">
                  {BRAND.name}
                </p>
                <p className="text-xs text-white/50">
                  Live characters, rendered responsibly.
                </p>
              </div>
            </div>
            <nav
              aria-label="Legal"
              className="flex max-w-xl flex-wrap gap-x-6 gap-y-2 text-xs"
            >
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-block py-0.5 text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="mt-10 border-t border-border pt-6">
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} {BRAND.name}. Your face, your
              voice, your rules.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
