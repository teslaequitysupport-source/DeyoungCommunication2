import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Crimson Noir input — a glass field: transparent core, hairline
 * white border, and on focus a crimson halo with a soft inner glow,
 * as if the field were heating up.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "placeholder:text-white/30 selection:bg-primary selection:text-white",
        "dark:bg-input/20 border-input flex h-10 w-full min-w-0 rounded-lg border bg-transparent px-3.5 py-1 text-base",
        "shadow-[0_1px_0_oklch(1_0_0/0.04)_inset] transition-[color,box-shadow,border-color] duration-200 outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 md:text-sm",
        "hover:border-white/20",
        "focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_1px_oklch(0.62_0.235_22/0.4),0_0_0_4px_oklch(0.62_0.235_22/0.15),inset_0_0_24px_oklch(0.62_0.235_22/0.06)]",
        "aria-invalid:border-destructive/60 aria-invalid:shadow-[0_0_0_4px_oklch(0.55_0.24_26/0.15)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
