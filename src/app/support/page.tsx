import type { Metadata } from "next";
import { SupportForm } from "@/components/site/support-form";
import { SiteNav } from "@/components/site/site-nav";
import { BrandMark } from "@/components/fx/brand-mark";
import { Clock, LifeBuoy, ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Something not working? Contact the Deyoung Live team and get a ticket reference you can quote.",
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
              Something broken, confusing, or missing? Tell us what
              happened. Every message lands with the team as a tracked
              ticket, and you get a reference to hold us to.
            </p>
          </div>

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
            Looking for answers first?{" "}
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
    </div>
  );
}
