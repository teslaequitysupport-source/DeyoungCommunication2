#!/usr/bin/env python3
"""Insert new landing sections + renumber + de-em-dash page.tsx copy."""

import re

PATH = "src/app/page.tsx"
src = open(PATH, encoding="utf-8").read()

TAKE_IT_LIVE = '''      {/* ─── Take it live — OBS and social ────────────────────── */}
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

'''

APP_AND_DATA = '''      {/* ─── The app — coming soon, previewed honestly ────────── */}
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
                  <div className="flex flex-wrap gap-4 pt-2">
                    {/* Store buttons — drawn, not lifted, and honest about availability */}
                    <span className="inline-flex h-14 items-center gap-3 rounded-xl border border-border bg-card px-5">
                      <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
                        <path d="M4 3l9 9-9 9V3z" fill="currentColor" className="text-white/85" />
                        <path d="M16.5 8.5c1.8-1 3-2.6 3-4.5-1.9.2-3.6 1.2-4.6 2.6l1.6 1.9z" fill="currentColor" className="text-white/50" />
                        <path d="M15 9l-4.5 3 4.5 3c.8-1.3 1.3-2.8 1.3-3s-.5-1.7-1.3-3z" fill="currentColor" className="text-white/50" />
                      </svg>
                      <span className="text-left">
                        <span className="block text-[10px] uppercase tracking-wider text-white/50">Coming soon</span>
                        <span className="block text-sm font-semibold text-white">Google Play</span>
                      </span>
                    </span>
                    <span className="inline-flex h-14 items-center gap-3 rounded-xl border border-border bg-card px-5">
                      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
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

'''

# 1. Insert Take it live before the How-it-works comment (match by prefix)
m = re.search(r"^      \{/\* ─── How it works[^\n]*\n", src, re.M)
assert m, "how comment not found"
src = src[: m.start()] + TAKE_IT_LIVE + src[m.start() :]

# 2. Insert App + Data before the Trust comment
m = re.search(r"^      \{/\* ─── Trust[^\n]*\n", src, re.M)
assert m, "trust comment not found"
src = src[: m.start()] + APP_AND_DATA + src[m.start() :]

# 3. Renumber section marks
src = src.replace(
    '<SectionMark n="03" label="How it works" ink />',
    '<SectionMark n="04" label="How it works" ink />',
)
src = src.replace(
    '<SectionMark n="04" label="The fine print" />',
    '<SectionMark n="07" label="The fine print" />',
)
src = src.replace(
    '<SectionMark n="05" label="Questions" />',
    '<SectionMark n="08" label="Questions" />',
)

# 4. De-em-dash remaining user-facing copy in page.tsx
fixes = [
    (
        "Every category of data we hold, what it's used for, and how long it stays — published in full.",
        "Every category of data we hold, what it's used for, and how long it stays, published in full.",
    ),
    (
        "How credit refunds happen automatically when a render can't be delivered.",
        "How credit refunds happen automatically when a render can't be delivered.",
    ),
    (
        "Every render is priced in credits before it runs — and if a job can't be delivered, the credits return to your balance automatically.",
        "Every render is priced in credits before it runs, and if a job can't be delivered, the credits return to your balance automatically.",
    ),
    (
        "A modern browser and a camera. The studio runs on desktop and mobile web — no download — and it adapts to slow connections by pacing frame quality.",
        "A modern browser and a camera. The studio runs on desktop and mobile web with nothing to download, and it adapts to slow connections by pacing frame quality.",
    ),
    (
        "Only a face you have the right to use — in practice, your own.",
        "Only a face you have the right to use, which in practice means your own.",
    ),
    (
        "Your account keeps characters, consent grants, credit history and renders in one place — each one auditable by you, deletable by you.",
        "Your account keeps characters, consent grants, credit history and renders in one place: each one auditable by you, deletable by you.",
    ),
]
for old, new in fixes:
    if old in src:
        src = src.replace(old, new)
        print("fixed:", old[:60])
    else:
        print("NOT FOUND (already fixed?):", old[:60])

open(PATH, "w", encoding="utf-8").write(src)
print("page.tsx patched OK")
