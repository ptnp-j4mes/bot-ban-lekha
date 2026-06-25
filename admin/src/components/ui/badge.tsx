import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.5px]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-white",
        secondary: "border-[#E2E8F0] bg-[#F8FAFC] text-primary",
        success: "border-transparent bg-[#22C55E26] text-[#16A34A]",
        warning: "border-transparent bg-[#EAB30826] text-[#CA8A04]",
        destructive: "border-transparent bg-[#EF444426] text-[#DC2626]",
        outline: "border-[#E2E8F0] text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
