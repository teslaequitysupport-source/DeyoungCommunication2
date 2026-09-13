import { cn } from "@/lib/utils";

/**
 * BrandMark — the Deyoung Live sigil.
 *
 * One flat idea: a red diamond with a light core — the character
 * emerging on the dark stage. Solid colours only, legible from
 * 16 px up. Works on black, white and red backgrounds (the core
 * separates on all three).
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
      {/* Stage frame */}
      <rect
        x="10.5"
        y="10.5"
        width="27"
        height="27"
        rx="3"
        transform="rotate(45 24 24)"
        stroke="#e11d2e"
        strokeWidth="2.4"
      />
      {/* The character plate */}
      <rect
        x="17.5"
        y="17.5"
        width="13"
        height="13"
        rx="1.5"
        transform="rotate(45 24 24)"
        fill="#e11d2e"
      />
      {/* The light — live */}
      <circle cx="24" cy="24" r="2" fill="#ffffff" />
    </svg>
  );
}
