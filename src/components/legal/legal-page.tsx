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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/50">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
          <Link
            href="/"
            className="text-sm text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← Back to the platform
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-muted-foreground">{intro}</p>
          <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Effective date</dt>
              <dd className="text-muted-foreground">{LEGAL_EFFECTIVE_DATE}</dd>
            </div>
            <div>
              <dt className="font-medium">Last updated</dt>
              <dd className="text-muted-foreground">{LEGAL_LAST_UPDATED}</dd>
            </div>
            <div>
              <dt className="font-medium">Operated by</dt>
              <dd className="text-muted-foreground">{op.name}</dd>
            </div>
            <div>
              <dt className="font-medium">Contact</dt>
              <dd className="text-muted-foreground">{op.contactEmail}</dd>
            </div>
          </dl>
          {!op.configured && (
            <p
              role="note"
              className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              Operator identity is not configured yet. Before launch, set{" "}
              <code>LEGAL_OPERATOR_NAME</code>, <code>LEGAL_CONTACT_EMAIL</code>{" "}
              and <code>LEGAL_JURISDICTION</code> — this platform does not
              invent company details.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10">
        <div className="space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-medium [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_a]:text-emerald-700 [&_a]:underline">
          {children}
        </div>

        <nav aria-label="Legal pages" className="mt-16 border-t pt-8">
          <h2 className="text-sm font-semibold">All legal pages</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            {LEGAL_PAGES.map((page) => (
              <li key={page.slug}>
                <Link
                  href={page.slug}
                  className="text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Questions about this page? Contact{" "}
            <a href={`mailto:${op.contactEmail}`}>{op.contactEmail}</a>. In-app
            guides live in <Link href="/help" className="text-emerald-700 underline">Help</Link>.
          </p>
        </nav>
      </main>
    </div>
  );
}
