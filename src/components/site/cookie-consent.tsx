"use client";

/**
 * CookieConsent — the honest notice.
 *
 * One bar, one decision. Essential cookies keep the session alive;
 * nothing else is set without consent. The choice is remembered in
 * localStorage and the full policy is one click away. No dark
 * patterns: "Essential only" is exactly as prominent as "Accept".
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "dy-consent-v1";

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Deferred one frame so hydration completes before the banner
    // can appear — and so no setState runs synchronously in the effect.
    const id = requestAnimationFrame(() => {
      try {
        if (!window.localStorage.getItem(KEY)) setOpen(true);
      } catch {
        // Storage unavailable (private mode) — don't nag on every render.
        setOpen(false);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function decide(value: "all" | "essential") {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-border bg-black/95 p-4 backdrop-blur-sm sm:px-6"
    >
      <div className="container-x flex flex-col gap-4 sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-white/75">
          We use essential cookies to keep you signed in and your sessions
          secure. Nothing else is set without your say.{" "}
          <Link
            href="/cookies"
            className="whitespace-nowrap font-medium text-white underline decoration-primary underline-offset-4 hover:text-primary"
          >
            Read the cookie policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-3 sm:ml-auto">
          <button
            type="button"
            onClick={() => decide("essential")}
            className="inline-flex h-10 items-center rounded-xl border border-border bg-transparent px-5 text-sm font-medium text-white/85 transition-colors hover:border-white/35 hover:bg-white/[0.06] active:translate-y-px"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => decide("all")}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-red-dark)] active:translate-y-px"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
