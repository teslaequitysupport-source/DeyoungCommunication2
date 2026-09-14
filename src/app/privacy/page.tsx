import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { DATA_MAP } from "@/lib/privacy/data-map";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What this platform collects, why, where it lives, how long it is kept, and how to export or delete it, rendered from the platform's real data map.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy is generated from the platform's real internal data map, every category below describes what the code actually stores, not what a template promised."
    >
      <h2>How to read this policy</h2>
      <p>
        The table below is the complete inventory of personal data this
        platform holds. It is generated from the same structured data map the
        engineering team keeps in the codebase, so it cannot drift from
        reality. Face images and voice recordings are sensitive data: they
        are only processed after explicit, purpose-scoped, withdrawable
        consent.
      </p>
      <p>
        Your controls are real: export everything (Settings → Privacy), or
        delete your account entirely (Settings → Privacy → Delete account).
        A scheduled retention sweep also removes old media and records on
        the windows shown below, data does not live here forever by default.
      </p>

      <h2>Complete data inventory</h2>
      <div className="space-y-6">
        {DATA_MAP.map((entry) => (
          <section
            key={entry.id}
            aria-labelledby={`data-${entry.id}`}
            className="rounded-lg border bg-card p-4"
          >
            <h3 id={`data-${entry.id}`} className="!mt-0">
              {entry.category}
            </h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">What is collected</dt>
                <dd className="text-muted-foreground">{entry.what}</dd>
              </div>
              <div>
                <dt className="font-medium">Why</dt>
                <dd className="text-muted-foreground">{entry.why}</dd>
              </div>
              <div>
                <dt className="font-medium">How it is collected</dt>
                <dd className="text-muted-foreground">{entry.howCollected}</dd>
              </div>
              <div>
                <dt className="font-medium">Legal basis</dt>
                <dd className="text-muted-foreground">{entry.legalBasis}</dd>
              </div>
              <div>
                <dt className="font-medium">Where it is stored</dt>
                <dd className="text-muted-foreground">{entry.whereStored}</dd>
              </div>
              <div>
                <dt className="font-medium">Who processes it</dt>
                <dd className="text-muted-foreground">{entry.processors}</dd>
              </div>
              <div>
                <dt className="font-medium">Retention</dt>
                <dd className="text-muted-foreground">{entry.retention}</dd>
              </div>
              <div>
                <dt className="font-medium">Who can access it</dt>
                <dd className="text-muted-foreground">{entry.whoCanAccess}</dd>
              </div>
              <div>
                <dt className="font-medium">Deletion</dt>
                <dd className="text-muted-foreground">{entry.deletion}</dd>
              </div>
              <div>
                <dt className="font-medium">Export</dt>
                <dd className="text-muted-foreground">{entry.exportMethod}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      <h2>Nigeria Data Protection Act (NDPA)</h2>
      <p>
        The service is available in Nigeria, so the platform is built around
        NDPA principles: lawful basis before processing, purpose limitation,
        data minimization, storage limitation, security, and accountability.
        Face and voice data are treated as sensitive data requiring explicit
        consent, with withdrawal as easy as granting. We do not claim legal
        compliance merely because this page exists, areas that require
        professional legal review (DPIA sign-off, NDPC registration status,
        cross-border transfer assessments for a production deployment) are
        tracked in the platform&apos;s launch checklist and are the
        operator&apos;s responsibility before launch.
      </p>

      <h2>Your requests</h2>
      <ul>
        <li>Access &amp; portability: export your data any time from Settings.</li>
        <li>Erasure: delete your account any time from Settings (password + confirmation).</li>
        <li>Consent withdrawal: one click per consent record in Media &amp; Consent.</li>
        <li>Anything else: contact the operator using the address at the top of this page.</li>
      </ul>
    </LegalPage>
  );
}
