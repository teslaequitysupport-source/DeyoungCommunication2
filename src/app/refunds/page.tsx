import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "How credits and refunds work on this platform, matching the actual billing system, which is manual credits with automatic refunds for undelivered work.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="This policy describes the billing system as it actually is. It changes in the same deployment that changes billing, it never describes a system we do not have."
    >
      <h2>The actual billing system today</h2>
      <p>
        <strong>
          This platform currently has no automated payments, no card charging,
          no subscriptions, and no paid renewals.
        </strong>{" "}
        Credits are granted when you sign up (a free-tier welcome amount) and
        by platform staff when needed. Because no money is taken from you in
        this phase, there is nothing to refund in money, the commitments
        below are about credits, and they are enforced automatically by the
        platform code, not by manual goodwill.
      </p>

      <h2>Credits</h2>
      <ul>
        <li><strong>Cost visibility:</strong> every job type&apos;s credit cost is visible before you submit a job.</li>
        <li><strong>Failed generations:</strong> when a job ends in a terminal failure (failed, expired, or was cancelled before completing), its credit spend is refunded automatically, exactly once. You never pay for work you did not receive.</li>
        <li><strong>Unused credits:</strong> credits remain on your account until it is deleted. When a payment system is introduced, any expiry rules will be stated here before they take effect.</li>
        <li><strong>Duplicate charges:</strong> job submissions are idempotent, resubmitting the same job cannot spend twice. A double-click on &quot;generate&quot; costs one job, one charge.</li>
        <li><strong>Outages:</strong> an outage that prevents delivery shows up as failed or expired jobs, which are refunded by the same automatic rule. No claim process needed.</li>
      </ul>

      <h2>Subscriptions and renewals</h2>
      <p>
        None exist in this phase. This section will be filled in, with
        renewal timing, cancellation path, and what happens to unused
        credits at downgrade, in the same release that introduces them.
      </p>

      <h2>When payments arrive later</h2>
      <ul>
        <li>Prices will be shown before purchase, in your currency where supported.</li>
        <li>Cancel-and-keep-access until the end of a paid period will be supported where technically possible.</li>
        <li>Consumer rights you have under applicable law (including Nigerian consumer protection law) are not limited by anything in this policy.</li>
        <li>Requests and disputes: contact the operator using the address at the top of this page. Manual credit corrections made by staff are audited and visible in your credit history.</li>
      </ul>
    </LegalPage>
  );
}
