"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { TransformCanvas } from "@/components/fx/transform-canvas";
import { Badge } from "@/components/ui/badge";

/** Subscribes to a media query the React way (SSR-safe). */
function useMediaQuery(query: string, serverSnapshot = true) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverSnapshot
  );
}

/** A session timer that actually ticks — the mockup breathes. */
function useSessionClock(reduced: boolean) {
  const [secs, setSecs] = useState(724); // 12:04
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [reduced]);
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * StudioStage — the one 3D moment of the site.
 *
 * The actual Live Studio interface, in a window that settles onto
 * the stage and answers the pointer with a few degrees of tilt.
 * The render panel runs a real WebGL pass — the camera frame
 * dissolving into the character through a red scan, on loop.
 * Sample imagery, honestly labelled. Static with
 * prefers-reduced-motion or on touch devices.
 */
export function StudioStage() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Fine-pointer check — touch devices get the still composition.
  const finePointer = useMediaQuery("(pointer: fine)");
  const clock = useSessionClock(Boolean(reduced));

  const canTilt = !reduced && finePointer;

  const rx = useSpring(0, { stiffness: 140, damping: 22, mass: 0.9 });
  const ry = useSpring(0, { stiffness: 140, damping: 22, mass: 0.9 });

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canTilt) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      ry.set((px - 0.5) * 7);
      rx.set(-(py - 0.5) * 5);
    },
    [canTilt, rx, ry]
  );

  const onPointerLeave = useCallback(() => {
    rx.set(0);
    ry.set(0);
  }, [rx, ry]);

  return (
    <div className="perspective-1200">
      {/* Entrance — the window settles onto the stage */}
      <motion.div
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.85, ease: [0.25, 1, 0.5, 1], delay: 0.15 }}
      >
        <motion.div
          ref={ref}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          style={canTilt ? { rotateX: rx, rotateY: ry } : undefined}
        >
          {/* The studio window */}
          <div className="overflow-hidden rounded-xl border border-border bg-card text-left shadow-[var(--shadow)]">
            {/* Window chrome */}
            <div className="flex items-center gap-3 border-b border-border bg-black/40 px-4 py-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
              </span>
              <span className="mx-auto rounded-md border border-border bg-black/40 px-3 py-1 text-[11px] text-white/50">
                deyoung.live/studio
              </span>
              <span className="hidden items-center gap-1.5 text-[11px] font-medium text-white/70 sm:inline-flex">
                <span
                  className="on-air-dot size-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                Live
              </span>
            </div>

            {/* Studio body — a session in progress */}
            <div className="grid gap-3 p-4 sm:grid-cols-[1fr_200px] sm:p-5">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Camera input — the raw frame */}
                  <figure className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-black">
                    <img
                      src="/studio/camera-input.jpg"
                      alt="Camera input, sample frame of the performer"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <figcaption className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-black/70 px-2 py-1 text-[10px] font-medium text-white/60">
                      <span
                        className="on-air-dot size-1.5 rounded-full bg-white/50"
                        aria-hidden="true"
                      />
                      Camera · live input
                    </figcaption>
                  </figure>

                  {/* Render output — the WebGL transform, on loop */}
                  <figure className="relative aspect-[4/3] overflow-hidden rounded-lg border border-primary/50 bg-black">
                    <TransformCanvas
                      cameraSrc="/studio/camera-input.jpg"
                      characterSrc="/studio/character-output.jpg"
                      alt="Character render output, the live transform, shown as a looping sample"
                    />
                    <figcaption className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-black/70 px-2 py-1 text-[10px] font-medium text-white/70">
                      <span
                        className="on-air-dot size-1.5 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                      Character · render
                    </figcaption>
                    <span className="absolute bottom-2 right-2 rounded-md border border-border bg-black/70 px-2 py-1 text-[10px] font-medium text-white/60">
                      24 fps
                    </span>
                  </figure>
                </div>

                {/* Session bar */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-black/40 px-3 py-2.5">
                  <Badge>Connected</Badge>
                  <span className="text-xs tabular-nums text-white/60">
                    Session {clock}
                  </span>
                  <span className="ml-auto inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-white">
                    End session
                  </span>
                </div>
              </div>

              {/* Side rail — hidden on small screens so the stage stays legible */}
              <div className="hidden space-y-3 sm:block">
                <div className="rounded-lg border border-border bg-black/30 p-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/studio/character-avatar.jpg"
                      alt="Ada, sample live character"
                      className="size-9 shrink-0 rounded-full border border-primary/50 object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        Ada
                      </p>
                      <p className="text-[11px] text-white/55">
                        Live character
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <Badge variant="status" className="text-[10px]">
                      ACTIVE
                    </Badge>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-black/30 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                    <ShieldCheck
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    Camera transform
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
                    Consent granted, withdraw any time.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-black/30 p-3">
                  <p className="text-[11px] font-medium text-white/70">Credits</p>
                  <p className="mt-1 font-display text-lg font-bold text-white">
                    96
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <p className="mt-4 text-center text-xs text-white/45">
        The Live Studio, shown with a sample session.
      </p>
    </div>
  );
}
