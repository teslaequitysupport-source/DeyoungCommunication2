/**
 * PhoneMockups — the app, previewed honestly.
 *
 * Two photographic device frames (brushed titanium edge, glass glare,
 * physical buttons, Dynamic Island) carrying the actual app layout:
 * the character roster and the live studio. CSS-built so the screens
 * stay crisp at any zoom and the preview stays honest.
 */

import { BrandMark } from "@/components/fx/brand-mark";
import { Clapperboard, Settings, UserRound, Users } from "lucide-react";

/* ── Status bar: system glyphs drawn to look like real hardware UI ── */

function StatusBar() {
  return (
    <div className="relative z-10 flex items-center justify-between px-6 pt-3.5 text-[11px] font-semibold tracking-wide text-white/85">
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {/* Cellular — four ascending bars */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <rect x="0" y="7.5" width="2.6" height="3.5" rx="0.9" />
          <rect x="4.2" y="5.5" width="2.6" height="5.5" rx="0.9" />
          <rect x="8.4" y="3" width="2.6" height="8" rx="0.9" />
          <rect x="12.6" y="0.5" width="2.6" height="10.5" rx="0.9" />
        </svg>
        {/* Wi-Fi — three arcs over a dot */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
          <path
            d="M1 3.8C4.6.5 10.4.5 14 3.8"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M3.4 6.3c2.3-2.1 5.9-2.1 8.2 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="7.5" cy="9.2" r="1.6" fill="currentColor" />
        </svg>
        {/* Battery — outline, fill level, nub */}
        <svg width="24" height="11" viewBox="0 0 24 11" fill="none">
          <rect
            x="0.6"
            y="0.6"
            width="20"
            height="9.8"
            rx="3"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1.2"
          />
          <rect x="2.2" y="2.2" width="13" height="6.6" rx="1.8" fill="currentColor" />
          <path
            d="M22.4 3.8v3.4c1-.3 1.6-1 1.6-1.7s-.6-1.4-1.6-1.7z"
            fill="currentColor"
            fillOpacity="0.45"
          />
        </svg>
      </span>
    </div>
  );
}

/* ── The device: titanium chassis, buttons, island, glass ── */

function PhoneFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[292px]" aria-label={label} role="img">
      <div className="device device-lift">
        {/* Side hardware: action + volume left, power right */}
        <span className="device-btn device-btn-left top-[104px] h-8" aria-hidden="true" />
        <span className="device-btn device-btn-left top-[146px] h-14" aria-hidden="true" />
        <span className="device-btn device-btn-left top-[168px] h-14" aria-hidden="true" />
        <span className="device-btn top-[132px] h-20" aria-hidden="true" />
        <div className="device-inner">
          <div className="device-screen">
            {/* Dynamic island — reads as hardware, never a dead pixel */}
            <div
              className="absolute left-1/2 top-2.5 z-20 flex h-[26px] w-[94px] -translate-x-1/2 items-center justify-end rounded-full border border-white/[0.07] bg-[#050507] pr-2.5"
              aria-hidden="true"
            >
              <span className="relative size-[9px] rounded-full bg-[#101018] ring-[0.5px] ring-white/15">
                <span className="absolute inset-[2.5px] rounded-full bg-[#20283c]" />
                <span className="absolute left-[3px] top-[2px] size-[2px] rounded-full bg-white/25" />
              </span>
            </div>
            <div className="flex h-[578px] flex-col">
              <StatusBar />
              {children}
            </div>
            {/* Glass glare — reads as one sweep of studio light */}
            <span className="device-glare" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shared tab bar ── */

function TabBar({ active }: { active: "characters" | "studio" | "settings" }) {
  const items = [
    { id: "characters", label: "Characters", icon: Users },
    { id: "studio", label: "Studio", icon: Clapperboard },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;
  return (
    <nav className="grid grid-cols-3 border-t border-white/10 px-5 pb-4 pt-2.5">
      {items.map((it) => {
        const on = it.id === active;
        const Icon = it.icon;
        return (
          <span
            key={it.id}
            className={
              "flex flex-col items-center gap-1 text-[10px] font-medium " +
              (on ? "text-white" : "text-white/40")
            }
          >
            <Icon className="size-[22px]" aria-hidden="true" />
            {it.label}
          </span>
        );
      })}
    </nav>
  );
}

/* ── Screen 1 — the character roster, all live ── */

function CharactersScreen() {
  const chars = [
    { name: "Ada", note: "Live character", img: "/studio/character-avatar.jpg" },
    { name: "Kamal", note: "Live character", img: "/studio/character-kamal.jpg" },
    { name: "Zara", note: "Live character", img: "/studio/character-zara.jpg" },
    { name: "Ada 2.0", note: "Live character", img: "/studio/character-ada2.jpg" },
  ];
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <p className="flex items-center gap-2 font-display text-[17px] font-bold text-white">
          <BrandMark size={18} />
          Deyoung Live
        </p>
        <span className="grid size-8 place-items-center rounded-full border border-white/15 bg-white/[0.06]">
          <UserRound className="size-4 text-white/70" aria-hidden="true" />
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2.5 px-4 pb-3.5">
        {chars.map((c) => (
          <div
            key={c.name}
            className="overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12]"
          >
            <div className="relative aspect-square w-full">
              <img
                src={c.img}
                alt={`${c.name}, live character preview`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
                <span className="on-air-dot size-1 rounded-full bg-primary" aria-hidden="true" />
                LIVE
              </span>
            </div>
            <div className="p-2.5">
              <p className="truncate text-xs font-semibold text-white">{c.name}</p>
              <p className="text-[10px] text-white/45">{c.note}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto px-4 pb-3">
        <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-xs font-semibold text-white">
          + New character
        </span>
      </div>
      <TabBar active="characters" />
    </div>
  );
}

/* ── Screen 2 — the live studio, mid-session ── */

function StudioScreen() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <p className="font-display text-[17px] font-bold text-white">Live Studio</p>
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
            alt="Live character output, rendered in real time"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {/* Camera input as picture-in-picture, the way live calls do it */}
          <div className="absolute right-2 top-2 w-20 overflow-hidden rounded-lg border border-white/25 shadow-[var(--shadow)]">
            <img
              src="/studio/camera-input.jpg"
              alt="Camera input driving the character"
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
      <div className="mt-3">
        <TabBar active="studio" />
      </div>
    </div>
  );
}

export function PhoneMockups() {
  return (
    <div className="grid gap-14 sm:grid-cols-2 sm:gap-10 lg:gap-16">
      <PhoneFrame label="App preview: the characters screen">
        <CharactersScreen />
      </PhoneFrame>
      <div className="sm:mt-10">
        <PhoneFrame label="App preview: the live studio screen">
          <StudioScreen />
        </PhoneFrame>
      </div>
    </div>
  );
}
