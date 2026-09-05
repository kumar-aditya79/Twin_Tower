import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-md font-mono text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-cyan-300 text-zinc-950 ring-1 ring-cyan-300 hover:bg-cyan-200",
        outline: "bg-white/5 text-white ring-1 ring-white/15 hover:bg-white/10",
        ghost: "text-zinc-300 hover:bg-white/8 hover:text-white",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-7 px-2.5",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {children}
      {(size === "icon" || size === "sm") && (
        <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" aria-hidden="true" />
      )}
    </button>
  ),
)
Button.displayName = "Button"

export { Button }
