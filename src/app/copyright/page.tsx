import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description: "How copyright complaints work, and how to submit a valid notice or counter-notice.",
};

export default function CopyrightPage() {
  return (
    <LegalPage
      title="Copyright Policy"
      intro="Uploading or transforming material you do not have the rights to is prohibited. Here is how to complain — and how complaints are handled."
    >
      <h2>Copyright on this platform</h2>
      <p>
        You keep rights in what you upload, and you confirm you hold the
        rights needed for the transformations you request. Uploading
        &quot;found&quot; media is not a license: content sourced from the
        internet without a clear right to use it violates these terms and
        will be removed when identified.
      </p>

      <h2>How to file a copyright complaint</h2>
      <p>
        Use the in-app report flow (choose the &quot;copyright
        violation&quot; reason on the specific content), or email the
        operator contact at the top of this page with:
      </p>
      <ul>
        <li>identification of the copyrighted work you believe is infringed;</li>
        <li>the exact content on this platform you are complaining about (a link or description precise enough to locate it);</li>
        <li>your contact information;</li>
        <li>a statement of your good-faith belief that the use is unauthorized;</li>
        <li>a statement, under penalty of perjury where applicable, that the information is accurate and you are the rights holder or authorized to act for them.</li>
      </ul>

      <h2>What happens next</h2>
      <ul>
        <li>Complaints enter the same moderation queue as other reports, handled by staff with the content-removal tools.</li>
        <li>Valid notices result in removal of the content, and the account holder is notified of the decision and its reason.</li>
        <li>Repeat infringement leads to suspension or banning of the account.</li>
        <li>Affected uploaders may respond through the report decision process; restored content is documented with its rationale.</li>
      </ul>

      <h2>Generated outputs</h2>
      <p>
        Outputs are generated from your inputs by third-party AI models; the
        availability of copyright protection for AI-generated material varies
        by jurisdiction, and the platform makes no representation that
        outputs are copyrightable. What is yours stays yours; what is not
        yours to start with never becomes yours by uploading it here.
      </p>
    </LegalPage>
  );
}
