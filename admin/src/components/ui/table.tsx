import * as React from "react";
import { cn } from "@/lib/utils";

// maxHeight enables a scroll area with a sticky header ("fix th").
export const Table = ({ className, maxHeight, ...props }: React.HTMLAttributes<HTMLTableElement> & { maxHeight?: string }) => (
  <div className="relative w-full overscroll-x-contain overflow-x-auto" style={maxHeight ? { maxHeight } : undefined}>
    <table className={cn("w-full min-w-max caption-bottom text-sm [font-variant-numeric:tabular-nums]", className)} {...props} />
  </div>
);
export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("sticky top-0 z-10 border-b border-foreground/15 bg-card", className)} {...props} />
);
export const TBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="[&_tr:last-child]:border-0" {...props} />
);
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-border transition-colors hover:bg-accent/40", className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      "h-8 px-2.5 text-left align-middle font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
      className
    )}
    {...props}
  />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-2.5 py-2.5 align-middle", className)} {...props} />
);
