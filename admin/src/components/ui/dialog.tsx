import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Minimal modal — no dependency. Overlay + Esc + click-outside + body scroll lock.
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn("my-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl sm:my-8 sm:max-h-[calc(100dvh-4rem)]", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0 break-words text-[14px] font-semibold tracking-tight">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="ปิด">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// Key/value detail list for a record dialog.
export function KV({ pairs }: { pairs: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-border">
      {pairs.map(([k, v], idx) => (
        <div key={idx} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="fig break-words text-left text-sm sm:text-right">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
