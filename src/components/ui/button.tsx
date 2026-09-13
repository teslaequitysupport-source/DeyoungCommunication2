import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Crimson Noir button system.
 *
 * Every variant is built from the same three colours — black canvas,
 * white ink, crimson energy. The signature "ignite" variant carries a
 * gradient core, a hovering shine sweep and a physical press depth
 * (translateZ-style shadow collapse on :active). Focus is always a
 * crimson halo, never the browser default.
 */
const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight transition-[background,border-color,box-shadow,transform,color] duration-200 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring/70 focus-visible:border-primary/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 active:translate-y-px active:shadow-none select-none cursor-pointer",
  {
    variants: {
      variant: {
        /** Crimson gradient core + shine sweep + glow lift */
        ignite:
          "bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] text-primary-foreground font-semibold shadow-[0_1px_0_oklch(1_0_0/0.25)_inset,0_8px_24px_-8px_oklch(0.62_0.235_22/0.65)] hover:shadow-[0_1px_0_oklch(1_0_0/0.3)_inset,0_12px_36px_-6px_oklch(0.62_0.235_22/0.8)] hover:brightness-110 active:from-primary active:to-primary",
        default:
          "bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] text-primary-foreground font-semibold shadow-[0_1px_0_oklch(1_0_0/0.25)_inset,0_8px_24px_-8px_oklch(0.62_0.235_22/0.65)] hover:shadow-[0_1px_0_oklch(1_0_0/0.3)_inset,0_12px_36px_-6px_oklch(0.62_0.235_22/0.8)] hover:brightness-110",
        /** White plate on black — maximum contrast for destructive moments */
        destructive:
          "bg-gradient-to-b from-destructive to-[oklch(0.47_0.22_26)] text-white font-semibold shadow-[0_8px_24px_-8px_oklch(0.55_0.24_26/0.7)] hover:brightness-110 focus-visible:ring-destructive/40",
        /** Glass outline — hairline white border, crimson underglow on hover */
        outline:
          "border border-white/12 bg-white/[0.03] text-foreground backdrop-blur-sm shadow-[0_1px_0_oklch(1_0_0/0.05)_inset] hover:border-primary/50 hover:bg-white/[0.06] hover:shadow-[0_0_0_1px_oklch(0.62_0.235_22/0.35),0_8px_28px_-10px_oklch(0.62_0.235_22/0.4)]",
        secondary:
          "bg-secondary text-secondary-foreground border border-white/[0.06] shadow-[0_1px_0_oklch(1_0_0/0.04)_inset] hover:bg-white/[0.07] hover:border-white/12",
        ghost:
          "text-foreground/80 hover:text-foreground hover:bg-white/[0.06] hover:shadow-[0_0_20px_-6px_oklch(0.62_0.235_22/0.3)]",
        link:
          "text-primary underline-offset-4 hover:underline hover:text-primary/90 decoration-primary/40",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-12 rounded-xl px-7 text-[0.95rem] has-[>svg]:px-5",
        xl: "h-14 rounded-xl px-9 text-base has-[>svg]:px-7",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * The shine sweep — a diagonal light band that glides across the
 * button on hover. Pure CSS, positioned absolutely inside the
 * overflow-hidden shell. Applied only to the crimson variants.
 */
function ShineSweep() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100 group-active/btn:opacity-0"
    >
      <span className="absolute -inset-y-8 -left-3/4 w-1/2 rotate-[18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent blur-[6px] transition-transform duration-[900ms] ease-out group-hover/btn:translate-x-[340%]" />
    </span>
  )
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  const withShine =
    variant === "ignite" || variant === "default" || variant === "destructive"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {withShine ? <ShineSweep /> : null}
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
    </Comp>
  )
}

export { Button, buttonVariants }
