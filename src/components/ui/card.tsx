import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Crimson Noir card system.
 *
 * Cards are elevated glass plates on the black canvas: a hairline
 * white border, a subtle inner top highlight (as if lit from above),
 * deep layered shadows below, and an optional crimson aura that
 * breathes on hover. `Card` accepts an `interactive` prop that adds
 * the lift + glow choreography used by feature and dashboard cards.
 */
function Card({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "relative bg-card/85 text-card-foreground flex flex-col gap-6 rounded-xl border border-white/[0.07] py-6 backdrop-blur-md",
        "shadow-[0_1px_0_0_oklch(1_0_0/0.05)_inset,0_8px_24px_-12px_oklch(0_0_0/0.6)]",
        "bg-gradient-to-b from-white/[0.035] to-transparent",
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_1px_0_0_oklch(1_0_0/0.07)_inset,0_16px_40px_-12px_oklch(0_0_0/0.7),0_8px_36px_-10px_oklch(0.62_0.235_22/0.28)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display leading-none font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 [.border-t]:pt-6",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
