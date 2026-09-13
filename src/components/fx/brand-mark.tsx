import { cn } from "@/lib/utils";

/**
 * BrandMark — the Deyoung Live sigil.
 * Three stacked diamonds receding in Z: a gem catching crimson light.
 * Rendered inline so it inherits CSS animations (e.g. animate-spin-slow).
 */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dy-gem-a" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF5A5F" />
          <stop offset="1" stopColor="#C81E28" />
        </linearGradient>
        <linearGradient id="dy-gem-b" x1="24" y1="12" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="#FF5A5F" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* Outer gem */}
      <rect
        x="9.6"
        y="9.6"
        width="28.8"
        height="28.8"
        rx="3"
        transform="rotate(45 24 24)"
        stroke="url(#dy-gem-a)"
        strokeWidth="2.6"
      />
      {/* Mid layer */}
      <rect
        x="14.8"
        y="14.8"
        width="18.4"
        height="18.4"
        rx="1.6"
        transform="rotate(45 24 24)"
        fill="url(#dy-gem-a)"
        fillOpacity="0.16"
        stroke="url(#dy-gem-a)"
        strokeOpacity="0.45"
        strokeWidth="1.4"
      />
      {/* Core */}
      <rect
        x="19.4"
        y="19.4"
        width="9.2"
        height="9.2"
        rx="1"
        transform="rotate(45 24 24)"
        fill="url(#dy-gem-b)"
      />
      {/* Light catch */}
      <circle cx="24" cy="24" r="1.7" fill="#FFFFFF" />
    </svg>
  );
}
