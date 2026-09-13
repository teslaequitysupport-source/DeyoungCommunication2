"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/fx/brand-mark";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#product", label: "The studio" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
  { href: "/help", label: "Help" },
];

/**
 * SiteNav — the landing header.
 *
 * Solid surface, hairline bottom border. On mobile the links fold
 * into a disclosure panel; the primary action never leaves the bar.
 */
export function SiteNav({ brandName, tagline }: { brandName: string; tagline: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape; return focus to the toggle.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-black">
      <div className="container-x flex h-16 items-center gap-3 px-4 sm:px-6">
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded-md outline-offset-4"
          aria-label={`${brandName} — back to top`}
        >
          <BrandMark size={26} />
          <span className="font-display text-lg font-semibold tracking-tight">
            {brandName}
          </span>
        </a>
        <span className="ml-2 hidden text-xs text-white/55 lg:inline">
          {tagline}
        </span>

        <nav
          aria-label="Main"
          className="ml-auto hidden items-center gap-7 text-sm text-white/70 md:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm underline-offset-4 transition-colors hover:text-white focus-visible:underline"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#start"
          className="ml-auto inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px md:ml-7"
        >
          Get started
        </a>

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
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex h-11 items-center rounded-lg px-3 text-[15px] text-white/75",
                "transition-colors hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#start"
            onClick={() => setOpen(false)}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-white"
          >
            Get started
          </a>
        </nav>
      </div>
    </header>
  );
}
