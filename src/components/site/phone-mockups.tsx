/**
 * PhoneMockups — the app, previewed honestly.
 *
 * Two device frames carrying the actual app layout (characters grid,
 * live studio) at pocket scale. Pure CSS: crisp at any zoom, zero
 * image weight, honest labelling as a preview of the mobile app.
 */

import { BrandMark } from "@/components/fx/brand-mark";
import { Clapperboard, Settings, UserRound, Users } from "lucide-react";

function StatusBar({ dark = true }: { dark?: boolean }) {
  return (
    <div
      className={
        "flex items-center justify-between px-5 pt-2 text-[10px] font-medium " +
        (dark ? "text-white/70" : "text-black/70")
      }
    >
      <span>9:41</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {/* Signal, wifi, battery — abstract marks, not vendor art */}
        <span className="flex items-end gap-[2px]">
          <span className="block h-1 w-[3px] rounded-sm bg-current" />
          <span className="block h-1.5 w-[3px] rounded-sm bg-current" />
          <span className="block h-2 w-[3px] rounded-sm bg-current" />
        </span>
        <span className="block h-2 w-2 rounded-full border border-current" />
        <span className="block h-2.5 w-5 rounded-[3px] border border-current" />
      </span>
    </div>
  );
}

function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="mx-auto w-full max-w-[290px]" aria-label={label} role="img">
      <div className="rounded-[2.6rem] border border-white/20 bg-[#050507] p-2 shadow-[var(--shadow)]">
        <div className="relative overflow-hidden rounded-[2.1rem] border border-white/10 bg-black">
          {/* Dynamic-island style notch */}
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex h-[560px] flex-col">
            <StatusBar />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Screen 1 — the characters tab. */
function CharactersScreen() {
  const chars = [
    { name: "Ada", note: "Live character", img: "/studio/character-avatar.jpg" },
    { name: "Kamal", note: "Draft", letter: "K" },
    { name: "Zara", note: "Live character", letter: "Z" },
    { name: "Ada 2.0", note: "Live character", letter: "A" },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-3 pt-4">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <BrandMark size={18} />
          Deyoung Live
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2.5 px-4">
        {chars.map((c) => (
          <div
            key={c.name}
            className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]"
          >
            <div className="aspect-square w-full bg-[#15151b]">
              {c.img ? (
                 
                <img
                  src={c.img}
                  alt=""
                  className="h-full w-full object-cover opacity-90"
                  loading="lazy"
                />
              ) : (
                <span className="grid h-full w-full place-items-center font-display text-3xl font-bold text-white/20">
                  {c.letter}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-semibold text-white">{c.name}</p>
              <p className="text-[10px] text-white/45">{c.note}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto px-4 pb-2">
        <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-semibold text-white">
          + New character
        </span>
      </div>
      {/* Tab bar */}
      <nav className="grid grid-cols-3 border-t border-white/10 px-4 py-2.5 text-white/40">
        <span className="flex flex-col items-center gap-1 text-[10px] text-white">
          <Users className="size-5" aria-hidden="true" />
          Characters
        </span>
        <span className="flex flex-col items-center gap-1 text-[10px]">
          <Clapperboard className="size-5" aria-hidden="true" />
          Studio
        </span>
        <span className="flex flex-col items-center gap-1 text-[10px]">
          <Settings className="size-5" aria-hidden="true" />
          Settings
        </span>
      </nav>
    </div>
  );
}

/** Screen 2 — the live studio, mid-session (video-call layout). */
function StudioScreen() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <p className="font-display text-lg font-bold text-white">Live Studio</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-white">
          <span className="on-air-dot size-1.5 rounded-full bg-primary" aria-hidden="true" />
          LIVE
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4">
        {/* The character output, full frame */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-primary/50">
          <img
            src="/studio/character-output.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {/* Camera input as picture-in-picture, the way live calls do it */}
          <div className="absolute right-2 top-2 w-20 overflow-hidden rounded-lg border border-white/25 shadow-[var(--shadow)]">
            <img
              src="/studio/camera-input.jpg"
              alt=""
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          </div>
          <span className="absolute bottom-2 left-2 rounded-md border border-primary/40 bg-black/70 px-2 py-0.5 text-[10px] text-white/70">
            Character · 24 fps
          </span>
        </div>
        <div className="mt-2.5 space-y-2.5 pb-1">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0d12] px-3 py-2.5 text-[11px] text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Connected
            </span>
            <span className="tabular-nums">12:04</span>
            <span className="font-semibold text-white">96 credits</span>
          </div>
          <span className="flex h-11 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">
            End session
          </span>
        </div>
      </div>
      <nav className="mt-3 grid grid-cols-3 border-t border-white/10 px-4 py-2.5 text-white/40">
        <span className="flex flex-col items-center gap-1 text-[10px]">
          <Users className="size-5" aria-hidden="true" />
          Characters
        </span>
        <span className="flex flex-col items-center gap-1 text-[10px] text-white">
          <Clapperboard className="size-5" aria-hidden="true" />
          Studio
        </span>
        <span className="flex flex-col items-center gap-1 text-[10px]">
          <UserRound className="size-5" aria-hidden="true" />
          Settings
        </span>
      </nav>
    </div>
  );
}

export function PhoneMockups() {
  return (
    <div className="grid gap-10 sm:grid-cols-2 lg:gap-16">
      <PhoneFrame label="App preview: the characters screen">
        <CharactersScreen />
      </PhoneFrame>
      <PhoneFrame label="App preview: the live studio screen">
        <StudioScreen />
      </PhoneFrame>
    </div>
  );
}
