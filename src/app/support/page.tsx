import type { Metadata } from "next";
import { SupportForm } from "@/components/site/support-form";
import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { BrandMark } from "@/components/fx/brand-mark";
import { Reveal, RevealItem } from "@/components/fx/reveal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Clock, LifeBuoy, ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Something not working? Read the common answers first, then contact the Deyoung Live team and get a ticket reference you can quote.",
};

export const dynamic = "force-dynamic";

const EXPECTATIONS = [
  {
    icon: Clock,
    title: "A real reference",
    body: "Every message gets a ticket reference like DY-4F9K2Q1C. Quote it in any follow-up and we pick up exactly where we left off.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy respected",
    body: "Your message is stored as a support ticket, nothing more. It is never used for marketing and never sold.",
  },
  {
    icon: LifeBuoy,
    title: "No account needed",
    body: "Having trouble signing in? You should still be able to reach us. The form works before you have access.",
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

export default function SupportPage() {
  return (
    <div
      id="top"
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <SiteNav brandName={BRAND.name} tagline={BRAND.tagline} />

      <main className="container-x flex-1 px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl">
          <div className="mb-10 space-y-5">
            <BrandMark size={36} />
            <h1 className="display-1">Talk to a human.</h1>
            <p className="measure text-white/68">
              Something broken, confusing, or missing? The common answers
              are below; if none of them fit, tell us what happened. Every
              message lands with the team as a tracked ticket, and you
              get a reference to hold us to.
            </p>
          </div>

          {/* ─── Answers first — the questions people actually ask ── */}
          <Reveal className="mb-14">
            <RevealItem>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Answers first
              </h2>
            </RevealItem>
            <RevealItem>
              <Accordion
                type="single"
                collapsible
                className="mt-4 w-full border-t border-border"
              >
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
            </RevealItem>
          </Reveal>

          <SupportForm />

          <div className="mt-14 space-y-8">
            {EXPECTATIONS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold tracking-tight">
                    {title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/68">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 text-sm text-white/55">
            Want the full guides?{" "}
            <a
              href="/help"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              The help centre
            </a>{" "}
            covers setup, credits, consent and troubleshooting.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
