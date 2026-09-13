import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description: "What is prohibited on this platform, how rules are technically enforced, and what happens on violation.",
};

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      intro="This platform transforms faces and voices — powerful tools that are easy to abuse. The line is simple: only use people you have the right to use."
    >
      <h2>Prohibited uses</h2>
      <p>You may not use the platform to create, upload, transform, or distribute:</p>
      <ul>
        <li>fraud, scams, or deception of any kind;</li>
        <li>identity theft or criminal activity;</li>
        <li>deceptive impersonation of a real person (public or private);</li>
        <li>anyone&apos;s likeness without their consent;</li>
        <li>anyone&apos;s voice without their consent;</li>
        <li>non-consensual sexual content, including deepfakes;</li>
        <li>harassment, humiliation, or extortion targeting any person;</li>
        <li>content that infringes copyright or other rights;</li>
        <li>platform abuse — attacking, probing, or overloading the service.</li>
      </ul>

      <h2>How the rules are technically enforced</h2>
      <p>
        Promises are cheap, so these rules are backed by code where possible:
      </p>
      <ul>
        <li><strong>Consent gate:</strong> transforming a face or voice requires an explicit, purpose-scoped consent record tied to the asset — the job path refuses to run without it, and withdrawal stops future use immediately.</li>
        <li><strong>Abuse reporting:</strong> any user can report content across ten categories (impersonation, unauthorized likeness, unauthorized voice, sexual abuse, scams, copyright, and more).</li>
        <li><strong>Moderation with teeth:</strong> decisions apply real enforcement — warnings, suspensions, bans, content removal — and every decision is documented and audited.</li>
        <li><strong>Rate limits:</strong> uploads, jobs, sessions, reports, exports, and deletion attempts are all budgeted per user to stop flooding and probing.</li>
        <li><strong>Accountability:</strong> staff actions land in an append-only audit log; bans lock the account out at sign-in, not just in the UI.</li>
      </ul>

      <h2>What happens on violation</h2>
      <p>
        Reports go to a moderation queue. A moderator may dismiss, warn,
        suspend, ban, or remove content; decisions are recorded with notes,
        and enforcement is applied platform-wide (banned accounts cannot
        sign in; suspended accounts cannot use the service until resolved).
        Serious legal violations are escalated as required by law.
      </p>
    </LegalPage>
  );
}
