"use client";

/**
 * CookieConsent — the honest notice.
 *
 * One bar, one decision. Essential cookies keep the session alive;
 * nothing else is set without consent. The choice is written to BOTH
 * a first-party cookie and localStorage, so it survives reloads,
 * navigation, and storage quirks in embedded previews — it never
 * comes back to nag after a decision. No dark patterns: "Essential
 * only" is exactly as prominent as "Accept".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const KEY = "dy-consent-v1";
const COOKIE = "dy-consent";

function readConsent(): string | null {
  try {
    const local = window.localStorage.getItem(KEY);
    if (local) return local;
  } catch {
    /* storage unavailable — fall through to the cookie */
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeConsent(value: "all" | "essential") {
  const days = 365;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // Written twice on purpose: cookie survives storage clearing,
  // localStorage survives cookie clearing.
  document.cookie = `${COOKIE}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* ignore */
  }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Deferred a frame so hydration completes first; no sync setState.
    const id = requestAnimationFrame(() => {
      setOpen(readConsent() === null);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  function decide(value: "all" | "essential") {
    writeConsent(value);
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
        <p className="pr-8 text-sm leading-relaxed text-white/75 sm:pr-12">
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
        <button
          type="button"
          onClick={() => decide("essential")}
          aria-label="Dismiss the cookie notice"
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white sm:static sm:size-10"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
