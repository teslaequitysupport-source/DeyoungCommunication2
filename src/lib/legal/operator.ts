/**
 * Legal operator block (spec §40).
 *
 * "Do not invent legal entities, addresses, registration numbers,
 * certifications, or lawyer approvals." — the only honest source is the
 * environment. When the operator has not configured their identity, pages
 * render an explicit unconfigured marker instead of a fabricated company.
 */

export interface OperatorInfo {
  /** Operator display name, or the honest unconfigured marker. */
  name: string;
  /** Contact email, or the honest unconfigured marker. */
  contactEmail: string;
  /** Operating jurisdiction, or the honest unconfigured marker. */
  jurisdiction: string;
  configured: boolean;
}

const UNCONFIGURED = "[not yet configured, set LEGAL_OPERATOR_NAME]";

export function operatorInfo(): OperatorInfo {
  const name = process.env.LEGAL_OPERATOR_NAME?.trim() || UNCONFIGURED;
  const contactEmail =
    process.env.LEGAL_CONTACT_EMAIL?.trim() ||
    process.env.LEGAL_OPERATOR_EMAIL?.trim() ||
    "[not yet configured, set LEGAL_CONTACT_EMAIL]";
  const jurisdiction =
    process.env.LEGAL_JURISDICTION?.trim() ||
    "[not yet configured, set LEGAL_JURISDICTION]";
  return {
    name,
    contactEmail,
    jurisdiction,
    configured: process.env.LEGAL_OPERATOR_NAME?.trim() ? true : false,
  };
}

/**
 * Effective + last-updated dates for the legal set. The constant changes
 * whenever legal content changes — pages render both, per spec §40.
 */
export const LEGAL_EFFECTIVE_DATE = "2026-09-13";
export const LEGAL_LAST_UPDATED = "2026-09-13";

export const LEGAL_PAGES = [
  { slug: "/terms", title: "Terms of Service" },
  { slug: "/privacy", title: "Privacy Policy" },
  { slug: "/cookies", title: "Cookie Policy" },
  { slug: "/refunds", title: "Refund Policy" },
  { slug: "/acceptable-use", title: "Acceptable Use Policy" },
  { slug: "/copyright", title: "Copyright Policy" },
  { slug: "/accessibility", title: "Accessibility Statement" },
  { slug: "/voice-rights", title: "Voice & Likeness Rights" },
  { slug: "/abuse", title: "Abuse & Reporting" },
] as const;
