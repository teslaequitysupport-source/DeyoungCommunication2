/**
 * Shared legal page chrome (spec §40): effective date, last-updated date,
 * operator block, plain-language content, cross-links, and contact. Server
 * component only — no client JS on legal pages.
 */

import Link from "next/link";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_PAGES,
  operatorInfo,
} from "@/lib/legal/operator";
import { BrandMark } from "@/components/fx/brand-mark";
import { BRAND } from "@/lib/brand";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const op = operatorInfo();
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="relative border-b border-border">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-lg text-sm text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <BrandMark size={20} />
            <span className="transition-transform group-hover:-translate-x-0.5">←</span>
            Back to {BRAND.name}
          </Link>
          <h1 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 leading-relaxed text-white/68">{intro}</p>
          <dl className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/40">Effective date</dt>
              <dd className="mt-1 font-medium">{LEGAL_EFFECTIVE_DATE}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/40">Last updated</dt>
              <dd className="mt-1 font-medium">{LEGAL_LAST_UPDATED}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/40">Operated by</dt>
              <dd className="mt-1 font-medium">{op.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-white/40">Contact</dt>
              <dd className="mt-1 font-medium">
                <a href={`mailto:${op.contactEmail}`} className="text-white underline decoration-primary underline-offset-4 hover:decoration-white">
                  {op.contactEmail}
                </a>
              </dd>
            </div>
          </dl>
          {!op.configured && (
            <p
              role="note"
              className="mt-4 rounded-lg border border-primary/35 bg-primary/10 px-4 py-3 text-sm text-white/85"
            >
              The operator identity for this deployment is being finalized.
              Full company details will appear here before public launch —
              this platform does not invent them.
            </p>
          )}
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 sm:px-6 py-12">
        <div className="space-y-6 leading-relaxed text-white/75 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_a]:text-white [&_a]:underline [&_a]:decoration-primary [&_a]:underline-offset-4 [&_a:hover]:decoration-white [&_table]:w-full [&_td]:py-1.5 [&_th]:py-1.5 [&_th]:text-left">
          {children}
        </div>

        <nav aria-label="Legal pages" className="mt-20 border-t border-border pt-10">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
            All legal pages
          </h2>
          <ul className="mt-5 grid gap-2.5 text-sm sm:grid-cols-3">
            {LEGAL_PAGES.map((page) => (
              <li key={page.slug}>
                <Link
                  href={page.slug}
                  className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-white/50">
            Questions about this page? Contact{" "}
            <a href={`mailto:${op.contactEmail}`} className="text-white underline decoration-primary underline-offset-4 hover:decoration-white">
              {op.contactEmail}
            </a>
            . In-app guides live in{" "}
            <Link href="/help" className="text-white underline decoration-primary underline-offset-4 hover:decoration-white">
              Help
            </Link>
            .
          </p>
        </nav>
      </main>
    </div>
  );
}
