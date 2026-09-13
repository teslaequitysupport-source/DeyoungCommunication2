import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Crimson Noir badges. Positive states read as white ink on glass
 * (never green — the palette is red, white and black only);
 * attention states carry the crimson.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium tracking-tight w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow,border-color] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-primary/40 bg-primary/12 text-primary shadow-[0_0_16px_-6px_oklch(0.62_0.235_22/0.55)] [a&]:hover:bg-primary/20",
        secondary:
          "border-white/10 bg-white/[0.06] text-foreground/90 [a&]:hover:bg-white/[0.1]",
        destructive:
          "border-destructive/50 bg-destructive/15 text-[oklch(0.75_0.16_24)] [a&]:hover:bg-destructive/25",
        outline:
          "text-foreground/85 border-white/12 [a&]:hover:bg-white/[0.06] [a&]:hover:text-foreground",
        /** Solid crimson plate — the premium chip */
        solid:
          "border-transparent bg-gradient-to-b from-primary to-[oklch(0.53_0.225_22)] text-primary-foreground font-semibold shadow-[0_4px_16px_-6px_oklch(0.62_0.235_22/0.7)]",
        /** White plate — maximum contrast */
        invert:
          "border-transparent bg-white text-black [a&]:hover:bg-white/90",
        /** Positive/neutral status — white ink, no colour invention */
        status:
          "border-white/12 bg-white/[0.05] text-white/95 shadow-[0_1px_0_oklch(1_0_0/0.08)_inset]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
