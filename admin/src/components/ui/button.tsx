import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        // Primary: navy fill. Secondary(outline): navy border. Ghost: slate text. Sage for positive.
        default: "bg-primary text-primary-foreground hover:bg-[#020617]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-[#DC2626]",
        outline: "border border-primary bg-transparent text-primary hover:bg-primary/[0.04]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-[#475569] hover:bg-[#F1F5F9]",
        success: "bg-[#059669] text-white hover:bg-[#047857]",
      },
      size: {
        default: "h-[42px] px-[22px]",
        sm: "h-8 px-3.5 text-[13px]",
        lg: "h-12 px-7 text-base",
        icon: "h-[42px] w-[42px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";
