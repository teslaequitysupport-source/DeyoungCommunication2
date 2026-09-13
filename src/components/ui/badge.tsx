import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge — small status labels.
 *
 * The red carries meaning (active, attention); neutral chips are
 * white ink on quiet plates. Text on the red plate is always white
 * (4.9:1). Meaning is never carried by color alone — badges are
 * always labelled with words.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium tracking-tight whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3 transition-[color,background,border-color]",
  {
    variants: {
      variant: {
        /** Solid red plate, white ink — active/attention */
        default:
          "border-transparent bg-primary text-primary-foreground font-semibold [a&]:hover:bg-[var(--color-red-dark)]",
        /** Solid red plate — the same red, for destructive labels */
        destructive:
          "border-transparent bg-primary text-primary-foreground font-semibold [a&]:hover:bg-[var(--color-red-dark)]",
        /** Quiet neutral chip */
        secondary:
          "border-border bg-secondary text-secondary-foreground [a&]:hover:bg-[#202028]",
        outline:
          "border-border bg-transparent text-foreground/85 [a&]:hover:bg-white/[0.06] [a&]:hover:text-foreground",
        /** Solid red plate, semibold — the emphasis chip */
        solid:
          "border-transparent bg-primary text-primary-foreground font-semibold [a&]:hover:bg-[var(--color-red-dark)]",
        /** White plate — maximum contrast */
        invert:
          "border-transparent bg-white text-black [a&]:hover:bg-white-soft",
        /** Neutral status — white ink, no invented colour */
        status:
          "border-border bg-white/[0.05] text-white/95",
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
