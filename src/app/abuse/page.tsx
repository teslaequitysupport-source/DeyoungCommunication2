import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Abuse & Reporting",
  description: "How to report impersonation, unauthorized likeness or voice use, sexual abuse, scams, and other prohibited content — and what happens after you do.",
};

export default function AbusePage() {
  return (
    <LegalPage
      title="Abuse & Reporting"
      intro="If you see your face, your voice, or anyone else being misused here — or any other abuse — report it. Reports are cheap, reviewed by humans, and acted on with real enforcement."
    >
      <h2>What you can report</h2>
      <ul>
        <li>impersonation of a real person;</li>
        <li>harassment;</li>
        <li>illegal content;</li>
        <li>unauthorized likeness (a face used without consent);</li>
        <li>unauthorized voice (a voice cloned or transformed without consent);</li>
        <li>sexual abuse, including non-consensual deepfakes;</li>
        <li>scams;</li>
        <li>fraud;</li>
        <li>copyright violations;</li>
        <li>other prohibited activity.</li>
      </ul>

      <h2>How to report</h2>
      <p>
        In the app, open the content&apos;s context and choose
        &quot;Report&quot;. Every report asks for the category and a short
        description, then lands in the moderation queue with the target
        attached. You can check the status of reports you filed from your
        account settings. Reports can also be submitted by email to the
        operator contact at the top of this page.
      </p>

      <h2>What happens after</h2>
      <ul>
        <li>A moderator reviews the report alongside the reported content and account.</li>
        <li>Decisions are documented with notes and one of five actions: no action, warning, suspension, ban, or content removal.</li>
        <li>Enforcement is applied immediately and platform-wide — bans block sign-in itself, removals archive the content out of the platform.</li>
        <li>Every decision is written to an append-only audit log that senior staff can review.</li>
      </ul>

      <h2>Emergencies</h2>
      <p>
        If someone is in immediate danger, contact local emergency services
        first. Legal process (subpoenas, court orders, law-enforcement
        requests) should be directed to the operator contact; the platform
        preserves the records needed to respond to lawful process.
      </p>
    </LegalPage>
  );
}
