import * as React from "react"
import { Loader2 } from "lucide-react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button — the primary control of the system.
 *
 * One red, used with discipline: the primary action is a solid red
 * plate with white ink. Hover darkens it, press sinks it a pixel.
 * No gradients, no glows. Every state is real: hover, focus-visible,
 * active, disabled, loading.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 select-none cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium tracking-tight transition-[background,border-color,color,box-shadow,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** The primary action — solid red, white ink */
        default:
          "border-transparent bg-primary text-primary-foreground font-semibold hover:bg-[var(--color-red-dark)] disabled:pointer-events-none disabled:bg-secondary disabled:text-white/50 disabled:hover:bg-secondary",
        /** Legacy alias for the primary action */
        ignite:
          "border-transparent bg-primary text-primary-foreground font-semibold hover:bg-[var(--color-red-dark)] disabled:pointer-events-none disabled:bg-secondary disabled:text-white/50 disabled:hover:bg-secondary",
        /** Destructive moments carry the same red */
        destructive:
          "border-transparent bg-primary text-primary-foreground font-semibold hover:bg-[var(--color-red-dark)] disabled:pointer-events-none disabled:bg-secondary disabled:text-white/50 disabled:hover:bg-secondary",
        /** Quiet secondary — dark plate, hairline border */
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:border-white/28 hover:bg-[#202028]",
        /** Outline — transparent, hairline border, brightens on hover */
        outline:
          "border-border bg-transparent text-foreground hover:border-white/28 hover:bg-white/[0.06]",
        /** Ghost — text only */
        ghost:
          "border-transparent bg-transparent text-foreground/80 hover:bg-white/[0.06] hover:text-foreground",
        /** White plate — maximum contrast inversions */
        invert:
          "border-transparent bg-white text-black font-semibold hover:bg-white-soft disabled:pointer-events-none disabled:bg-secondary disabled:text-white/50 disabled:hover:bg-secondary",
        link:
          "border-transparent bg-transparent text-primary underline-offset-4 decoration-primary/40 hover:underline",
      },
      size: {
        default: "h-12 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 rounded-md px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-12 px-7 has-[>svg]:px-5",
        xl: "h-14 rounded-xl px-8 text-base has-[>svg]:px-6",
        icon: "size-12",
        "icon-sm": "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner and blocks interaction while an action runs */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      data-loading={loading ? "true" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      <span className="inline-flex items-center gap-2">{children}</span>
    </Comp>
  )
}

export { Button, buttonVariants }
