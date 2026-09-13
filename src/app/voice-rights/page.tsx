import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Voice & Likeness Rights",
  description: "Face and voice data are sensitive. This platform only transforms them under explicit, withdrawable, per-purpose consent — here is exactly how that works.",
};

export default function VoiceRightsPage() {
  return (
    <LegalPage
      title="Voice & Likeness Rights"
      intro="A face or a voice belongs to the person it depicts. Using it without their consent is prohibited — technically, in the product flow, not just in the prose."
    >
      <h2>The rule</h2>
      <p>
        Before this platform will transform any face image or voice
        recording, the person depicted (or someone legally authorized to act
        for them) must have granted explicit consent, recorded per asset and
        per purpose. This is not a checkbox you see once at sign-up: each
        transformation purpose (&quot;live session&quot;, &quot;video
        generation&quot;, and so on) is a separate, bounded consent you can
        grant and withdraw independently.
      </p>

      <h2>What consent means here</h2>
      <ul>
        <li><strong>Specific:</strong> tied to one asset and one purpose — consent to use a face in a live session never implies consent to generate videos.</li>
        <li><strong>Time-bounded:</strong> consents may carry an expiry; expired consent behaves like withdrawn consent.</li>
        <li><strong>Withdrawable:</strong> one click, effective immediately for new work. The job and session paths check consent state at execution time, not at upload time.</li>
        <li><strong>Versioned:</strong> the policy version at grant time is recorded, so a consent always means what it meant when given.</li>
        <li><strong>Provable:</strong> consent records (including withdrawal timestamps) are kept as evidence, even after the media they covered is deleted.</li>
      </ul>

      <h2>Depicting others</h2>
      <p>
        Uploading someone else&apos;s face or voice asserts you have their
        consent. If that assertion is false, the content is prohibited, the
        person depicted (or anyone) can report it, and removal plus account
        enforcement follow the Abuse &amp; Reporting process. Non-consensual
        sexual or deepfake content is treated as the most serious category
        and acted on with priority.
      </p>

      <h2>Minors</h2>
      <p>
        Faces and voices of minors must never be uploaded for transformation
        without the involvement of a parent or guardian with legal authority
        to consent, and content sexualizing minors is prohibited absolutely,
        without exception, everywhere on the platform.
      </p>

      <h2>Your rights over your own biometric features</h2>
      <p>
        Under the Nigeria Data Protection Act, face and voice data are
        sensitive personal data. You may withdraw consent, export your data,
        or delete your account at any time (Settings → Privacy). The
        platform&apos;s retention windows for media are documented in the
        Privacy Policy and enforced by scheduled sweeps.
      </p>
    </LegalPage>
  );
}
