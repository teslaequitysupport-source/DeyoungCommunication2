/**
 * HeroFX — the cinematic backdrop of the landing hero.
 *
 * Three layers of depth on the black canvas:
 *   1. Crimson orbs — heavy-blurred light sources that breathe
 *      (pulse-glow) and drift (float), as if the platform were lit
 *      from behind the glass.
 *   2. The engineering grid — a perspective floor that recedes to a
 *      vanishing point and drifts slowly, echoing the render grid of
 *      a 3D stage.
 *   3. Film grain — a barely-there noise plate that kills banding
 *      and sells the cinematic grade.
 *
 * Pure CSS/GPU animation. No JS, no libraries, no re-renders.
 */
export function HeroFX({ dense = false }: { dense?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Light sources */}
      <div
        className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[oklch(0.62_0.235_22/0.32)] animate-pulse-glow"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="absolute top-1/3 -left-40 h-[360px] w-[360px] rounded-full bg-[oklch(0.62_0.235_22/0.14)] animate-float-slow blur-3xl"
        style={{ animationDelay: "-3s" }}
      />
      <div
        className="absolute -right-32 bottom-0 h-[300px] w-[420px] rounded-full bg-[oklch(0.5_0.2_22/0.12)] animate-float blur-3xl"
        style={{ animationDelay: "-6s" }}
      />

      {/* Engineering grid — receding floor */}
      <div
        className={
          dense
            ? "absolute inset-0 bg-grid opacity-90 animate-grid-drift [mask-image:radial-gradient(ellipse_75%_65%_at_50%_40%,black,transparent)]"
            : "absolute inset-0 bg-grid opacity-70 animate-grid-drift [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]"
        }
      />

      {/* Horizon glow line */}
      <div className="absolute left-1/2 top-[62%] h-px w-[130%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[oklch(0.62_0.235_22/0.45)] to-transparent" />

      {/* Film grain */}
      <div className="bg-noise absolute inset-0" />

      {/* Vignette — keeps edges pure black */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,transparent,oklch(0.13_0.006_20)_100%)]" />
    </div>
  );
}
