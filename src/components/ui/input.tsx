import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input — the standard field.
 *
 * A darker well on the card surface with a hairline border. Focus
 * brings the red: border plus a quiet ring. Errors use the same red
 * with an aria-invalid state; colour is never the only signal.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "selection:bg-primary selection:text-white",
        "flex h-12 w-full min-w-0 rounded-lg border border-border bg-black/40 px-3.5 py-1 text-base",
        "transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-white/50",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 md:text-sm",
        "hover:border-white/28",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/25",
        "aria-invalid:border-primary aria-invalid:ring-[3px] aria-invalid:ring-primary/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
