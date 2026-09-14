import Link from "next/link";
import { BrandMark } from "@/components/fx/brand-mark";
import { BRAND, LEGAL_LINKS } from "@/lib/brand";

/** Product surfaces — the pages people actually browse. */
const PRODUCT_LINKS = [
  { href: "/", label: "Home" },
  { href: "/live", label: "Go live" },
  { href: "/app", label: "The app" },
  { href: "/support", label: "Support" },
  { href: "/help", label: "Help centre" },
];

/**
 * SiteFooter — shared across marketing pages. Two groups, one owner:
 * product left, legal right, brand above. Nothing decorative.
 */
export function SiteFooter() {
  const legalLinks = LEGAL_LINKS.filter(
    (l) => !PRODUCT_LINKS.some((p) => p.href === l.href)
  );

  return (
    <footer className="mt-auto border-t border-border bg-black">
      <div className="container-x px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_auto] md:gap-16">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <BrandMark size={26} />
              <div>
                <p className="font-display font-semibold tracking-tight">
                  {BRAND.name}
                </p>
                <p className="text-xs text-white/50">
                  Live characters, rendered responsibly.
                </p>
              </div>
            </div>
            <nav aria-label="Product">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Product
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm py-0.5 text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <nav aria-label="Legal">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              The fine print
            </p>
            <ul className="mt-3 grid max-w-sm grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm py-0.5 text-white/50 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} {BRAND.name}. Your face, your
            voice, your rules.
          </p>
        </div>
      </div>
    </footer>
  );
}
