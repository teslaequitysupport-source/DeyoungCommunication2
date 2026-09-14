/**
 * /live — the deep dive on taking a character to an audience:
 * OBS as a browser source or virtual camera, streaming to Twitch,
 * YouTube and Kick, and creating for TikTok, Reels and Shorts.
 *
 * Register rhythm: black (header, OBS) → paper (social) → red
 * (the call) → black (footer). The home page carries the summary;
 * this page carries the practice.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Clapperboard,
  Monitor,
  Radio,
  ScreenShare,
  Smartphone,
} from "lucide-react";
import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionMark } from "@/components/site/section-mark";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Go live",
  description:
    "Take your character to OBS, Twitch, YouTube, TikTok and every stage you already broadcast on. The streaming and social guide for Deyoung Live.",
  openGraph: {
    title: `Go live · ${BRAND.name}`,
    description:
      "OBS, Twitch, YouTube, TikTok: how the character plugs into the stages you already broadcast on.",
  },
};

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

const STAGES = [
  "OBS",
  "Twitch",
  "YouTube Live",
  "Kick",
  "TikTok LIVE",
  "Zoom",
  "Google Meet",
  "Discord",
];

export default function LivePage() {
  return (
    <div
      id="top"
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <SiteNav brandName={BRAND.name} tagline={BRAND.tagline} />

      {/* ─── Header — the page's premise ─────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 mx-auto hidden max-w-[var(--container-width)] grid-cols-4 lg:grid"
          aria-hidden="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-l border-white/[0.05]" />
          ))}
        </div>

        <div className="container-x relative px-4 py-20 sm:px-6 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal className="space-y-8">
              <RevealItem>
                <SectionMark n="LIVE" label="The guide" />
              </RevealItem>
              <RevealItem>
                <h1 className="display-hero">
                  One studio.
                  <br />
                  <span className="text-primary">Every stage.</span>
                </h1>
              </RevealItem>
              <RevealItem>
                <p className="measure text-lg leading-relaxed text-white/68">
                  A live character is only useful if it goes where your
                  audience already is. No exports, no re-uploads, no new
                  pipeline to learn: the studio speaks the language of
                  the tools you stream and post with today.
                </p>
              </RevealItem>
              <RevealItem>
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    href="/#start"
                    className="group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-[0.95rem] font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px"
                  >
                    Create free account
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                  <a
                    href="#obs"
                    className="inline-flex h-12 items-center rounded-xl border border-white/20 bg-white/[0.06] px-7 text-[0.95rem] font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/[0.1] active:translate-y-px"
                  >
                    Jump to the setup
                  </a>
                </div>
              </RevealItem>
            </Reveal>

            {/* The stages the studio plays on — index-card style */}
            <Reveal>
              <RevealItem>
                <div className="rounded-xl border border-border bg-card p-7 sm:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    Works with
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2.5">
                    {STAGES.map((stage) => (
                      <li
                        key={stage}
                        className="inline-flex items-center rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-white/75"
                      >
                        {stage}
                      </li>
                    ))}
                    <li className="inline-flex items-center rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-medium text-white">
                      + anything that takes a camera
                    </li>
                  </ul>
                  <p className="mt-6 border-t border-border pt-5 text-sm leading-relaxed text-white/55">
                    If a tool can see a camera or a browser source, it can
                    see your character. That is the whole integration
                    story.
                  </p>
                </div>
              </RevealItem>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── OBS — the streamer's path ────────────────────────────── */}
      <section id="obs" className="border-b border-border">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="01" label="Streaming with OBS" />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1">Three steps to the feed.</h2>
            </RevealItem>
            <RevealItem>
              <p className="text-white/68">
                OBS treats the studio like any other source. Your scenes,
                hotkeys and alert stacks do not change; only the face in
                the frame does.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-12 lg:grid-cols-3 lg:gap-8">
            {OBS_STEPS.map(({ icon: Icon, title, body }, i) => (
              <RevealItem key={title}>
                <div className="group flex gap-5 lg:flex-col lg:gap-0">
                  <div className="flex flex-col items-center lg:mb-6 lg:items-start">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary transition-colors group-hover:border-primary/50">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    {i < OBS_STEPS.length - 1 && (
                      <span
                        className="mt-3 w-px flex-1 bg-border lg:hidden"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="pb-2">
                    <span className="font-display text-sm font-bold tracking-widest text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="mt-2 font-display text-lg font-semibold tracking-tight">
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
      </section>

      {/* ─── Social — the creator's path, the paper register ──────── */}
      <section id="social" className="paper border-b border-black/10">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="02" label="Creating for social" ink />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1 text-black">
                The camera roll, rewritten.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="text-black/70">
                Short-form runs on the character being everywhere your
                face would be. Record once in the studio, post as the
                character everywhere.
              </p>
            </RevealItem>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {SOCIAL_POINTS.map(({ icon: Icon, title, body }) => (
              <RevealItem key={title}>
                <article className="group h-full rounded-xl border border-black/10 bg-white p-7 shadow-[0_1px_0_rgba(10,10,13,0.04)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-black/20">
                  <div className="flex items-center gap-3">
                    <Icon className="size-5 text-black/50" aria-hidden="true" />
                    <h3 className="font-display text-lg font-semibold tracking-tight text-black">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-black/70">
                    {body}
                  </p>
                </article>
              </RevealItem>
            ))}
          </div>

          <Reveal className="mt-16">
            <div className="flex flex-col gap-6 border-t-2 border-black pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm font-display text-xl font-semibold tracking-tight text-black">
                The feed never sees your face.
              </p>
              <Link
                href="/#start"
                className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-black px-7 text-[0.95rem] font-semibold text-white transition-transform active:translate-y-px"
              >
                Start with free credits
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── The call — the one red shout ───────────────────────────── */}
      <section className="band border-y border-black/25">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mx-auto max-w-3xl space-y-8 text-center">
            <RevealItem>
              <h2 className="display-hero text-black">
                The stage is<br />already set.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="mx-auto max-w-xl text-[1.05rem] leading-relaxed text-black/80">
                Create a free account, build the character, and bring it
                to the stream you already run. Welcome credits included.
              </p>
            </RevealItem>
            <RevealItem>
              <Link
                href="/#start"
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-black px-8 text-[0.95rem] font-semibold text-white transition-transform active:translate-y-px"
              >
                Create free account
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </RevealItem>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
