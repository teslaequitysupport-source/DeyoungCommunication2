/**
 * /app — the mobile app, previewed honestly. Two photographic device
 * frames carrying the actual app layout, drawn store lockups marked
 * "coming soon", and the truth that the web studio already runs on
 * mobile today.
 *
 * Register rhythm: black (header, badges) → paper (the devices) → red
 * (the call) → black (footer).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Smartphone } from "lucide-react";
import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionMark } from "@/components/site/section-mark";
import { PhoneMockups } from "@/components/site/phone-mockups";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "The app",
  description:
    "The Deyoung Live studio, built for the phone in your pocket. Coming soon to Google Play and the App Store, and the web studio already runs on mobile today.",
  openGraph: {
    title: `The app · ${BRAND.name}`,
    description:
      "The same characters, consent and credits, built for the phone you create on. Coming soon to both stores.",
  },
};

export default function AppPage() {
  return (
    <div
      id="top"
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <SiteNav brandName={BRAND.name} tagline={BRAND.tagline} />

      {/* ─── Header — the premise and the badges ─────────────────── */}
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
          <div className="mx-auto max-w-3xl space-y-8 text-center">
            <Reveal className="space-y-8">
              <RevealItem className="flex justify-center">
                <SectionMark n="APP" label="Coming soon" />
              </RevealItem>
              <RevealItem>
                <h1 className="display-hero">
                  The studio
                  <br />
                  goes <span className="text-primary">pocket.</span>
                </h1>
              </RevealItem>
              <RevealItem>
                <p className="measure mx-auto text-lg leading-relaxed text-white/68">
                  The same characters, consent and credits, built for the
                  phone you create on. The app is in the works for both
                  stores, and the web studio already runs on mobile today.
                </p>
              </RevealItem>
              <RevealItem>
                <div className="flex flex-wrap items-center justify-center gap-3.5">
                  {/* Store lockups — drawn, not lifted, honest about availability */}
                  <span
                    title="Coming soon"
                    aria-label="Coming soon on Google Play"
                    className="group inline-flex h-[56px] cursor-default items-center gap-3.5 rounded-[14px] border border-black/10 bg-[#f4f4f0] pl-[18px] pr-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_30px_-12px_rgba(0,0,0,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_14px_36px_-12px_rgba(0,0,0,0.85)]"
                  >
                    <svg viewBox="0 0 24 24" className="size-[28px] shrink-0 -translate-y-px" fill="none" aria-hidden="true">
                      {/* Play triangle — the wedge and its fold, two inks */}
                      <path
                        d="M5 2.8c.3-.45.9-.55 1.35-.22l12.65 8.05c.6.38.6 1.31 0 1.69L6.35 20.42c-.45.33-1.05.23-1.35-.22-.12-.2-.19-.42-.19-.65V3.45c0-.23.07-.45.19-.65z"
                        fill="currentColor"
                        className="text-black"
                      />
                      <path
                        d="M5.8 2.7l8.6 8.6-2.55 2.55L5.5 7.5V3.45c0-.3.1-.55.3-.75z"
                        fill="currentColor"
                        className="text-primary"
                      />
                    </svg>
                    <span className="text-left leading-tight">
                      <span className="block text-[10px] font-normal uppercase tracking-[0.18em] text-black/55">
                        Coming soon on
                      </span>
                      <span className="block text-[17px] font-semibold tracking-tight text-black">
                        Google Play
                      </span>
                    </span>
                  </span>
                  <span
                    title="Coming soon"
                    aria-label="Coming soon on the App Store"
                    className="group inline-flex h-[56px] cursor-default items-center gap-3.5 rounded-[14px] border border-black/10 bg-[#f4f4f0] pl-[18px] pr-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_30px_-12px_rgba(0,0,0,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_14px_36px_-12px_rgba(0,0,0,0.85)]"
                  >
                    <svg viewBox="0 0 24 24" className="size-[28px] shrink-0" fill="currentColor" aria-hidden="true">
                      {/* The apple — silhouette with leaf */}
                      <path
                        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08z"
                        className="text-black"
                      />
                      <path
                        d="M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                        className="text-primary"
                      />
                    </svg>
                    <span className="text-left leading-tight">
                      <span className="block text-[10px] font-normal uppercase tracking-[0.18em] text-black/55">
                        Coming soon on
                      </span>
                      <span className="block text-[17px] font-semibold tracking-tight text-black">
                        App Store
                      </span>
                    </span>
                  </span>
                </div>
              </RevealItem>
              <RevealItem>
                <p className="text-xs text-white/55">
                  Previews shown are the app layout in development. Not a
                  live store listing.
                </p>
              </RevealItem>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── The devices — paper register, product-spec style ───────── */}
      <section className="paper border-b border-black/10">
        <div className="container-x px-4 py-20 sm:px-6 lg:py-28">
          <Reveal className="mb-14 max-w-2xl space-y-5">
            <RevealItem>
              <SectionMark n="01" label="Inside the app" ink />
            </RevealItem>
            <RevealItem>
              <h2 className="display-1 text-black">
                Your characters, one thumb away.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="text-black/70">
                The roster and the live studio, carried over whole: no
                feature stripped for mobile, no second-class version.
              </p>
            </RevealItem>
          </Reveal>

          <Reveal>
            <RevealItem>
              <PhoneMockups />
            </RevealItem>
          </Reveal>

          <Reveal className="mt-16">
            <div className="flex flex-col gap-6 border-t-2 border-black pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-sm font-display text-xl font-semibold tracking-tight text-black">
                Until then, the web studio carries it.
              </p>
              <span className="inline-flex max-w-sm items-start gap-3 rounded-xl border border-black/10 bg-white p-4 text-sm leading-relaxed text-black/75">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-black/50" aria-hidden="true" />
                Film, transform and post from your phone's browser today,
                with nothing to download.
              </span>
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
                Be first<br />on the list.
              </h2>
            </RevealItem>
            <RevealItem>
              <p className="mx-auto max-w-xl text-[1.05rem] leading-relaxed text-black/80">
                Accounts created now carry over to the app the day it
                ships: characters, credits and consent, unchanged.
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
