import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--primary)] text-white",
        secondary: "border-transparent bg-[var(--secondary)] text-white",
        destructive: "border-transparent bg-[var(--destructive)] text-white",
        outline: "border-[var(--border)] text-[var(--foreground)]",
        success: "border-transparent bg-emerald-50 text-emerald-700",
        warning: "border-transparent bg-amber-50 text-amber-700",
        info: "border-transparent bg-[var(--pale-teal)] text-[var(--teal)]",
        pending: "border-transparent bg-[#FFF9EC] text-[#92400E]",
        confirmed: "border-transparent bg-[#ECFDF5] text-[#065F46]",
        cancelled: "border-transparent bg-[#FEE2E2] text-[#DC2626]",
        rescheduled: "border-transparent bg-[#EDE9FE] text-[#5B21B6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
