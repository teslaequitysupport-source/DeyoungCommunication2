import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Exactly which cookies and browser storage this platform uses, and nothing else.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="This platform uses the smallest possible set of cookies and browser storage, here is the complete, honest list."
    >
      <h2>What we set, and why</h2>
      <ul>
        <li>
          <strong>better-auth.session_token</strong>, an HttpOnly, signed
          session cookie that keeps you signed in for 7 days (or until you
          sign out). Without it, nothing about you persists between pages.
          When two-factor authentication is in play, a short-lived challenge
          cookie steps through the sign-in flow and then goes away.
        </li>
      </ul>

      <h2>What we deliberately do not use</h2>
      <ul>
        <li>No advertising cookies or pixels of any kind.</li>
        <li>No third-party analytics scripts in this build. (If product analytics is enabled later, via the platform&apos;s provider configuration, this page changes in the same deployment, listing exactly what is collected.)</li>
        <li>No fingerprinting, no cross-site tracking.</li>
      </ul>

      <h2>Browser storage</h2>
      <p>
        The application keeps a small amount of in-memory and local state to
        operate the interface (for example, which tab you last opened, and
        authentication state for the API client). Media and job data are
        never cached in your browser beyond what the current view needs.
      </p>

      <h2>Managing cookies</h2>
      <p>
        Blocking the session cookie means you cannot sign in, that is the
        entire effect. You can clear it any time by signing out or through
        your browser&apos;s site-data controls.
      </p>
    </LegalPage>
  );
}
