/**
 * The landing surface — one route (sandbox constraint), two states:
 *
 *   signed out → the product story + real auth panel
 *   signed in  → the app shell (characters / media & consent /
 *                live studio / renders)
 *
 * The story speaks the user's language only. Build-phase detail,
 * transport internals and provider notes live on the staff help page.
 *
 * Register rhythm: black (hero) → red (ticker) → black (problem,
 * product) → paper (how it works) → black (fine print, questions)
 * → red (the call) → black (start, footer). Flat blocks, hairline
 * rules, film grain — editorial, never decorated.
 */

import { headers } from "next/headers";
import {
  ArrowRight,
  Camera,
  Clapperboard,
  Coins,
  Database,
  Download,
  Monitor,
  Radio,
  ScreenShare,
  ShieldCheck,
  Smartphone,
  Wand2,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthPanel, type ConsoleUser } from "@/components/console/auth-panel";
import { AppShell } from "@/components/app/app-shell";
import { SiteNav } from "@/components/site/site-nav";
import { PhoneMockups } from "@/components/site/phone-mockups";
import { StudioStage } from "@/components/fx/studio-stage";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BrandMark } from "@/components/fx/brand-mark";
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

const OBS_STEPS = [
  {
    icon: Radio,
    title: "Start a live session",
    body: "Open the studio, pick your character and go live. Your camera feeds the render; the character faces your audience.",
  },
  {
    icon: Monitor,
    title: "Add the studio to OBS",
    body: "In OBS, add the studio as a browser source, or use it as your virtual camera. Your character arrives as a clean video feed, ready to mix.",
  },
  {
    icon: ScreenShare,
    title: "Stream as your character",
    body: "Scenes, overlays and alerts work exactly as they do today. Go live on YouTube, Twitch or Kick with the character instead of your face.",
  },
];

const SOCIAL_POINTS = [
  {
    icon: Camera,
    title: "Record in the studio",
    body: "Every session can be recorded as it runs, and saved renders land in your media library, ready to post.",
  },
  {
    icon: Smartphone,
    title: "Create from your phone",
    body: "The studio runs in mobile web. Film, transform and post from the same device with nothing to download.",
  },
  {
    icon: Clapperboard,
    title: "Post as the character",
    body: "Clips for TikTok, Reels, Shorts and status updates carry the character, not your face, unless you choose otherwise.",
  },
];

const DATA_STEPS = [
  {
    icon: Camera,
    title: "Captured",
    body: "Camera and voice data exist only while a live session runs. Ending the session stops all processing at once.",
  },
  {
    icon: Wand2,
    title: "Transformed",
    body: "Frames are used to drive your character's performance. That is the entire purpose, and the consent grant says so.",
  },
  {
    icon: Database,
    title: "Stored, scoped",
    body: "What is kept is stored encrypted, tied to your account, and covered by the published NDPR data map.",
  },
  {
    icon: Download,
    title: "Yours",
    body: "Export everything or delete your account in one action. Deletion removes your media, not just the links to it.",
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

const TRUST_PAGES = [
  {
    href: "/privacy",
    title: "Privacy & the NDPR data map",
    body: "Every category of data we hold, what it's used for, and how long it stays, published in full.",
  },
  {
    href: "/refunds",
    title: "Refunds",
    body: "How credit refunds happen automatically when a render can't be delivered.",
  },
  {
    href: "/voice-rights",
    title: "Voice & likeness rights",
    body: "The rules for faces and voices on this platform, and how to report misuse.",
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
    a: "Creating an account is free and comes with welcome credits. Every render is priced in credits before it runs, and if a job can't be delivered, the credits return to your balance automatically. The full policy is on the refunds page.",
  },
  {
    q: "What do I need to use it?",
    a: "A modern browser and a camera. The studio runs on desktop and mobile web with nothing to download, and it adapts to slow connections by pacing frame quality.",
  },
  {
    q: "Whose face can I use?",
    a: "Only a face you have the right to use, which in practice means your own. Every face asset requires an explicit, recorded consent grant scoped to one purpose, and withdrawing consent stops new sessions immediately.",
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
    a: "Yes. Ending a session stops all processing at once; live transforms only run while a session is active.",
  },
];

/** Editorial section marker — index, rule, label. */
function SectionMark({ n, label, ink = false }: { n: string; label: string; ink?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-display text-sm font-bold tracking-widest text-primary">
        {n}
      </span>
      <span
        className="h-px w-10"
        style={{ background: ink ? "rgba(10,10,13,0.25)" : "rgba(255,255,255,0.2)" }}
        aria-hidden="true"
      />
      <span
        className={
          "text-xs font-medium uppercase tracking-[0.18em] " +
          (ink ? "text-black/60" : "text-white/50")
        }
      >
        {label}
      </span>
    </div>
  );
}

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

      {/* ─── Take it live — OBS and social ────────────────────── */}
      <section id="live" className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="03" label="Take it live" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">One studio, every stage.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                A live character is only useful if it goes where your
                audience already is. Here is how it fits the tools you
                stream and post with today.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* OBS — the streamer's path */}
            <div>
              <Reveal>
                <RevealItem>
                  <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-primary">
                    Streaming with OBS
                  </h3>
                </RevealItem>
              </Reveal>
              <div className="mt-6 space-y-8">
                {OBS_STEPS.map(({ icon: Icon, title, body }, i) => (
                  <RevealItem key={title}>
                    <div className="group flex gap-5">
                      <div className="flex flex-col items-center">
                        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary transition-colors group-hover:border-primary/50">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        {i < OBS_STEPS.length - 1 && (
                          <span className="mt-3 w-px flex-1 bg-border" aria-hidden="true" />
                        )}
                      </div>
                      <div className="pb-2">
                        <p className="font-display text-lg font-semibold tracking-tight">
                          {title}
                        </p>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/68">
                          {body}
                        </p>
                      </div>
                    </div>
                  </RevealItem>
                ))}
              </div>
            </div>

            {/* Social — the creator's path */}
            <div>
              <Reveal>
                <RevealItem>
                  <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-primary">
                    Creating for social
                  </h3>
                </RevealItem>
              </Reveal>
              <div className="mt-6 grid gap-5">
                {SOCIAL_POINTS.map(({ icon: Icon, title, body }) => (
                  <RevealItem key={title}>
                    <article className="group h-full rounded-xl border border-border bg-card p-6 transition-colors hover:border-white/28">
                      <div className="flex items-center gap-3">
                        <Icon
                          className="size-5 text-white/35 transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                        <h4 className="font-display text-base font-semibold tracking-tight">
                          {title}
                        </h4>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-white/68">
                        {body}
                      </p>
                    </article>
                  </RevealItem>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works — the paper register ──────────────────────── */}
      <section id="how" className="paper border-b border-black/10">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="04" label="How it works" ink />
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

      {/* ─── The app — coming soon, previewed honestly ────────── */}
      <section id="app" className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
            <div>
              <Reveal className="space-y-5">
                <RevealItem>
                  <SectionMark n="05" label="The app" />
                </RevealItem>
                <RevealItem>
                  <h2 className="display-1">
                    The studio goes
                    <br />
                    pocket.
                  </h2>
                </RevealItem>
                <RevealItem>
                  <p className="max-w-lg text-white/68">
                    The same characters, consent and credits, built for the
                    phone you create on. The app is in the works for both
                    stores, and the web studio already runs on mobile today.
                  </p>
                </RevealItem>
                <RevealItem>
                  <div className="grid max-w-md gap-3 pt-2 sm:flex sm:flex-wrap sm:gap-4">
                    {/* Store buttons — drawn, not lifted, and honest about availability */}
                    <span className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-border bg-card px-5">
                      <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" aria-hidden="true">
                        <path d="M4 3l9 9-9 9V3z" fill="currentColor" className="text-white/85" />
                        <path d="M16.5 8.5c1.8-1 3-2.6 3-4.5-1.9.2-3.6 1.2-4.6 2.6l1.6 1.9z" fill="currentColor" className="text-white/50" />
                        <path d="M15 9l-4.5 3 4.5 3c.8-1.3 1.3-2.8 1.3-3s-.5-1.7-1.3-3z" fill="currentColor" className="text-white/50" />
                      </svg>
                      <span className="text-left">
                        <span className="block text-[10px] uppercase tracking-wider text-white/50">Coming soon</span>
                        <span className="block text-sm font-semibold text-white">Google Play</span>
                      </span>
                    </span>
                    <span className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-border bg-card px-5">
                      <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="currentColor" aria-hidden="true">
                        <path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.1-2.8.8-3.5.8s-1.9-.8-3.1-.8c-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.8 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.9.8 3.1.7c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.7-3.9zM14.2 5.6c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.1 1.9-1 3 1.1.1 2.2-.6 2.8-1.5z" className="text-white/85" />
                      </svg>
                      <span className="text-left">
                        <span className="block text-[10px] uppercase tracking-wider text-white/50">Coming soon</span>
                        <span className="block text-sm font-semibold text-white">App Store</span>
                      </span>
                    </span>
                  </div>
                </RevealItem>
                <RevealItem>
                  <p className="text-xs text-white/45">
                    Previews shown are the app layout in development. Not a
                    live store listing.
                  </p>
                </RevealItem>
              </Reveal>
            </div>
            <Reveal>
              <RevealItem>
                <PhoneMockups />
              </RevealItem>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── Your data — the paper receipt ──────────────────────── */}
      <section id="data" className="paper border-b border-black/10">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="06" label="Your data" ink />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1 text-black">
                Where your data goes.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="text-black/70">
                Face and voice data is sensitive data under Nigeria's NDPR,
                so the whole lifecycle is published, not paraphrased. Four
                stages, nothing hidden between them.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-12 md:grid-cols-2 md:gap-8">
            {DATA_STEPS.map(({ icon: Icon, title, body }) => (
              <RevealItem key={title}>
                <div className="h-full border-t-2 border-black pt-6">
                  <div className="flex items-center gap-3">
                    <Icon className="size-5 text-black" aria-hidden="true" />
                    <h3 className="font-display text-xl font-semibold tracking-tight text-black">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-black/70">
                    {body}
                  </p>
                </div>
              </RevealItem>
            ))}
          </div>

          <Reveal className="mt-14">
            <RevealItem>
              <a
                href="/privacy"
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-black px-7 text-[0.95rem] font-semibold text-white transition-transform active:translate-y-px"
              >
                Read the full data map
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </RevealItem>
          </Reveal>
        </div>
      </section>

      {/* ─── Trust — the real pages ─────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-12 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="07" label="The fine print" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">Plain sight, not small print</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                These aren't links to nowhere. Every page below is a real
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
      <section id="faq" className="border-b border-border">
        <div className="container-x grid gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5 lg:py-28">
          <Reveal className="lg:col-span-2">
            <RevealItem className="mb-6">
              <SectionMark n="08" label="Questions" />
            </RevealItem>
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
