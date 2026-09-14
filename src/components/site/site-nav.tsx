"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/fx/brand-mark";
import { cn } from "@/lib/utils";

/**
 * The navigation model:
 *  - anchor links (The studio / How it works) resolve to "#…" on the
 *    home page and "/#…" everywhere else
 *  - page links (Go live / The app / Support) get an active treatment
 *    when their route is open
 */
type NavLink = {
  label: string;
  anchor?: string;
  page?: string;
};

const LINKS: NavLink[] = [
  { label: "The studio", anchor: "product" },
  { label: "How it works", anchor: "how" },
  { label: "Go live", page: "/live" },
  { label: "The app", page: "/app" },
  { label: "Support", page: "/support" },
];

/**
 * SiteNav — the shared marketing header.
 *
 * Solid surface, hairline bottom border. On mobile the links fold
 * into a disclosure panel; the primary action never leaves the bar.
 */
export function SiteNav({
  brandName,
  tagline,
}: {
  brandName: string;
  tagline: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isHome = pathname === "/";

  // Close on Escape; return focus to the toggle.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hrefFor = (link: NavLink) => {
    if (link.page) return link.page;
    return isHome ? `#${link.anchor}` : `/#${link.anchor}`;
  };
  const isActive = (link: NavLink) =>
    Boolean(link.page) && pathname === link.page;
  const startHref = isHome ? "#start" : "/#start";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-black">
      <div className="container-x flex h-16 items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md outline-offset-4"
          aria-label={`${brandName}, back to top`}
        >
          <BrandMark size={26} />
          <span className="font-display text-lg font-semibold tracking-tight">
            {brandName}
          </span>
        </Link>
        <span className="ml-2 hidden text-xs text-white/55 lg:inline">
          {tagline}
        </span>

        <nav
          aria-label="Main"
          className="ml-auto hidden items-center gap-7 text-sm text-white/70 md:flex"
        >
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={hrefFor(link)}
              className={cn(
                "rounded-sm underline-offset-4 transition-colors hover:text-white focus-visible:underline",
                isActive(link) && "font-semibold text-white"
              )}
            >
              {link.label}
              {isActive(link) && (
                <span
                  className="mx-auto mt-1 block h-px w-5 bg-primary"
                  aria-hidden="true"
                />
              )}
            </Link>
          ))}
        </nav>

        <Link
          href={startHref}
          className="ml-auto inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px md:ml-7"
        >
          Get started
        </Link>

        {/* Mobile disclosure */}
        <button
          type="button"
          className="grid size-11 place-items-center rounded-xl border border-border text-white/80 md:hidden"
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        id="site-nav-mobile"
        ref={panelRef}
        hidden={!open}
        className="border-t border-border bg-black md:hidden"
      >
        <nav
          aria-label="Main"
          className="container-x flex flex-col gap-1 px-4 py-4 sm:px-6"
        >
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={hrefFor(link)}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-11 items-center rounded-lg px-3 text-[15px] text-white/75",
                "transition-colors hover:bg-white/[0.06] hover:text-white",
                isActive(link) && "bg-white/[0.06] font-semibold text-white"
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={startHref}
            onClick={() => setOpen(false)}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-white"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
