"use client";

import { motion } from "framer-motion";
import { BrandMark } from "@/components/fx/brand-mark";

/**
 * HeroGem — the hero centerpiece: the brand sigil floating inside two
 * orbiting rings, staged in true CSS 3D. The rings rotate on skew
 * axes around the gem, a red dwarf glints at the core, and depth is
 * real (translateZ) — parallax for free as the layout scrolls.
 */
export function HeroGem() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative mx-auto aspect-square w-full max-w-[420px] perspective-1200"
      aria-hidden="true"
    >
      {/* Core glow */}
      <div className="absolute inset-[18%] rounded-full bg-[oklch(0.62_0.235_22/0.22)] blur-2xl animate-pulse-glow" />

      {/* The 3D stage */}
      <div
        className="absolute inset-0 preserve-3d"
        style={{ animation: "orbit-y 26s linear infinite", transform: "rotateX(64deg)" }}
      >
        {/* Ring 1 — crimson */}
        <div
          className="absolute inset-[6%] rounded-full border border-[oklch(0.62_0.235_22/0.55)] preserve-3d"
          style={{ animation: "spin-z 12s linear infinite" }}
        >
          <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_4px_oklch(0.62_0.235_22/0.8)]" />
        </div>
        {/* Ring 2 — white hairline */}
        <div
          className="absolute inset-[16%] rounded-full border border-white/15 preserve-3d"
          style={{ animation: "spin-z 18s linear infinite reverse" }}
        >
          <div className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_12px_3px_oklch(1_0_0/0.5)]" />
        </div>
        {/* Ring 3 — deep crimson, wide */}
        <div
          className="absolute inset-[-4%] rounded-full border border-dashed border-[oklch(0.62_0.235_22/0.28)] preserve-3d"
          style={{ animation: "spin-z 34s linear infinite" }}
        />
      </div>

      {/* The gem itself — floats above the stage */}
      <motion.div
        className="absolute inset-0 grid place-items-center"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="drop-shadow-[0_0_38px_oklch(0.62_0.235_22/0.55)]">
          <BrandMark size={128} />
        </div>
      </motion.div>

      {/* Depth chips — parallax floaters at different heights */}
      <motion.div
        className="absolute left-[4%] top-[16%] rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-white/85 backdrop-blur-md shadow-[0_0_20px_-6px_oklch(0.62_0.235_22/0.45)]"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      >
        consent · active
      </motion.div>
      <motion.div
        className="absolute bottom-[14%] right-[6%] rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-white/85 backdrop-blur-md shadow-[0_0_20px_-6px_oklch(0.62_0.235_22/0.45)]"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
      >
        live · rendering
      </motion.div>
      <motion.div
        className="absolute right-[18%] top-[8%] rounded-full border border-white/12 bg-white/[0.05] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-white/70 backdrop-blur-md"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 2.2 }}
      >
        ndpr · aligned
      </motion.div>

      <style>{`
        @keyframes orbit-y {
          from { transform: rotateX(64deg) rotateZ(0deg); }
          to   { transform: rotateX(64deg) rotateZ(360deg); }
        }
        @keyframes spin-z {
          from { transform: rotateZ(0deg); }
          to   { transform: rotateZ(360deg); }
        }
      `}</style>
    </motion.div>
  );
}
