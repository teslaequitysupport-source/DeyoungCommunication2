"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * TiltCard — the signature 3D surface of Crimson Noir.
 *
 * The card lives inside a perspective stage and rotates toward the
 * pointer with spring physics (rotateX/rotateY), while a soft crimson
 * spotlight tracks the cursor across the glass. Children sit at a
 * raised depth via translateZ, so headlines float above the surface —
 * real parallax, not a flat fake. Honors prefers-reduced-motion.
 */
export function TiltCard({
  children,
  className,
  intensity = 9,
  spotlight = true,
  glareOpacity = 0.5,
}: {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees */
  intensity?: number;
  /** Cursor-tracking crimson spotlight */
  spotlight?: boolean;
  glareOpacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useRef(false);

  const rx = useSpring(0, { stiffness: 320, damping: 28, mass: 0.6 });
  const ry = useSpring(0, { stiffness: 320, damping: 28, mass: 0.6 });
  const mx = useMotionValue(50);
  const my = useMotionValue(50);

  const spotlightBg = useMotionTemplate`radial-gradient(420px circle at ${mx}% ${my}%, oklch(0.62 0.235 22 / ${0.14 * glareOpacity + 0.02}), transparent 65%)`;

  if (typeof window !== "undefined" && reduceMotion.current === false) {
    // lazily probe once; keep SSR-safe
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || reduceMotion.current) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      ry.set((px - 0.5) * intensity * 2);
      rx.set(-(py - 0.5) * intensity * 2);
      mx.set(Math.round(px * 100));
      my.set(Math.round(py * 100));
    },
    [intensity, rx, ry, mx, my]
  );

  const onPointerLeave = useCallback(() => {
    rx.set(0);
    ry.set(0);
    mx.set(50);
    my.set(50);
  }, [rx, ry, mx, my]);

  return (
    <div className={cn("perspective-1200", className)}>
      <motion.div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={{
          rotateX: rx,
          rotateY: ry,
          transformStyle: "preserve-3d",
        }}
        className="group/tilt relative h-full w-full rounded-xl transition-shadow duration-300"
      >
        {spotlight ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] rounded-xl"
            style={{ background: spotlightBg }}
          />
        ) : null}
        <div style={{ transform: "translateZ(28px)", transformStyle: "preserve-3d" }} className="h-full">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
