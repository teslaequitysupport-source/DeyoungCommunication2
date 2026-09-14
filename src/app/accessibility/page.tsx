import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "This platform's WCAG 2.2 AA commitment, what is implemented, known limitations, and how to get help.",
};

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility Statement"
      intro="Accessibility is a build requirement here, not an afterthought. This statement covers what is implemented, what is not, and how to tell us when we fail."
    >
      <h2>Commitment</h2>
      <p>
        The platform targets WCAG 2.2 Level AA. The web application is the
        primary surface; this statement is honest about what has been
        implemented and audited versus what remains open work.
      </p>

      <h2>What is implemented</h2>
      <ul>
        <li>Semantic HTML with landmark structure and heading hierarchy on every page.</li>
        <li>Visible keyboard focus indicators and full keyboard operability for tabs, forms, and dialogs.</li>
        <li>Color contrast that meets AA in the default light theme, checked against the component palette.</li>
        <li>Text alternatives for icons that carry meaning; decorative icons are hidden from assistive tech.</li>
        <li>Form inputs with associated labels and error messaging tied to the inputs.</li>
        <li>Live-status announcements for asynchronous job and session state changes (ARIA live regions).</li>
        <li>Responsive reflow to small viewports without horizontal scrolling; reduced-motion respected where animation exists.</li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li>A formal third-party assistive-technology audit (screen readers on multiple browser/OS combos) has not yet been performed, internal testing to date is manual and tooling-assisted.</li>
        <li>Live video surfaces (camera preview, transformed output) are inherently visual; captions and audio descriptions for live streams are not yet available.</li>
        <li>Documentation pages are text-first and accessible; downloadable exports are JSON only in this phase.</li>
      </ul>

      <h2>Feedback</h2>
      <p>
        If any part of this platform is not usable for you, contact the
        operator using the address at the top of this page. Accessibility
        reports are treated as functional bugs and prioritized accordingly.
      </p>
    </LegalPage>
  );
}
