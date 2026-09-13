/**
 * Brand — the single source of truth for product identity on every
 * user-facing surface. Change the name here, it changes everywhere.
 *
 * Legal identity is NOT this: the operator block on legal pages is
 * env-driven (LEGAL_* vars) and never invented here.
 */
export const BRAND = {
  name: "Deyoung Live",
  shortName: "DY",
  tagline: "Live characters. Rendered in real time.",
  description:
    "Create a character, grant consent once, and see your live camera transform in real time — with credits you control and data you can export or delete any time.",
} as const;

export const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/help", label: "Help" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/refunds", label: "Refunds" },
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/copyright", label: "Copyright" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/voice-rights", label: "Voice & likeness" },
  { href: "/abuse", label: "Abuse" },
];
