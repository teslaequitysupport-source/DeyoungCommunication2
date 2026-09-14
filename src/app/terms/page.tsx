import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { operatorInfo } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern use of this AI live character platform: accounts, credits, content rules, and termination.",
};

export default function TermsPage() {
  const op = operatorInfo();
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms govern your use of this platform. Plain language, no tricks, read them alongside the Privacy Policy."
    >
      <h2>1. What this platform is</h2>
      <p>
        This platform lets you create characters, upload face and voice media
        you have the right to use, transform that media through AI models
        running on platform workers, and stream live transformed video. The
        service is provided by {op.name}, operating from {op.jurisdiction}.
        Because face and voice data are sensitive, the service is built
        around explicit, withdrawable consent, see Voice &amp; Likeness
        Rights.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide a valid email address and keep your password secure. Two-factor authentication is available and required for staff roles.</li>
        <li>You are responsible for activity under your account.</li>
        <li>You must be old enough to form a binding contract in your jurisdiction. If you are in Nigeria, that generally means 18 or older.</li>
        <li>One person or organization, one account. We may suspend accounts that violate these terms (see the Acceptable Use Policy for what that means).</li>
      </ul>

      <h2>3. Credits and payment</h2>
      <p>
        The platform uses a credit system. In the current phase, credits are
        granted at sign-up and by platform staff; there is no automated
        payment integration yet. When payments are introduced, the Refund
        Policy will be updated in the same change, it always describes the
        actual billing system, never an aspirational one.
      </p>
      <ul>
        <li>Every job type has a published credit cost, shown before you submit.</li>
        <li>Jobs that end without delivering work (failures, cancellations, expiries) refund their credits automatically.</li>
        <li>Credits are personal to your account, have no cash value in this phase, and are not transferable.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of the media you upload and the characters you
        create. You grant the platform the limited technical right to store
        and process that content strictly to operate the service for you
        (running the transformations you request, showing you your results).
        You must only upload media you have the right to use, especially
        faces and voices, which require the depicted person&apos;s consent
        under our Voice &amp; Likeness Rights policy and applicable law.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Fraud, scams, identity theft, impersonation, unauthorized likeness or
        voice use, non-consensual sexual content, harassment, extortion, and
        criminal activity are prohibited. The full list and enforcement
        process live in the Acceptable Use Policy; the short version is: if
        it hurts someone or breaks the law, it does not belong here.
      </p>

      <h2>6. Availability</h2>
      <p>
        We aim for a dependable service, but we do not promise uninterrupted
        operation, instant results, or any specific latency. Compute capacity
        is real and finite: some features depend on GPU workers that may be
        asleep and take time to wake. We will tell you the honest state of
        the system rather than pretend it is something it is not.
      </p>

      <h2>7. Termination</h2>
      <ul>
        <li>You may delete your account at any time from Settings, the deletion is real and removes your content (see the Privacy Policy for what survives and why).</li>
        <li>We may suspend or ban accounts for violations, with the decision documented through our moderation process.</li>
        <li>On termination, any refundable credits remaining are handled per the Refund Policy.</li>
      </ul>

      <h2>8. Liability</h2>
      <p>
        The service is provided &quot;as is&quot; to the maximum extent
        permitted by law. To the extent permitted by applicable law
        (including Nigerian consumer protection law where it applies to you),
        the operator is not liable for indirect or consequential damages, and
        total liability is limited to the amount you paid for credits in the
        12 months before the claim (zero, in the current phase).
      </p>

      <h2>9. Changes and governing law</h2>
      <p>
        We may update these terms; material changes update the
        &quot;Last updated&quot; date above. Continued use after changes take
        effect means you accept them. These terms are governed by the laws of{" "}
        {op.jurisdiction}, without prejudice to mandatory consumer rights you
        hold where you live.
      </p>
    </LegalPage>
  );
}
