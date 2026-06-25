import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export type Notif = { id: string; label: string; count: number; tone: "danger" | "warn" | "info"; onClick: () => void };

const dot = (t: Notif["tone"]) => (t === "danger" ? "bg-[#EF4444]" : t === "warn" ? "bg-amber-500" : "bg-primary");

export function NotificationBell({ items }: { items: Notif[] }) {
  const [open, setOpen] = useState(false);
  const active = items.filter((i) => i.count > 0);
  const total = active.reduce((s, i) => s + i.count, 0);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-foreground hover:bg-accent" aria-label="การแจ้งเตือน">
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 font-mono text-[10px] font-semibold text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-md border border-border bg-card shadow-xl">
            <div className="border-b border-border px-3 py-2 text-[13px] font-semibold">การแจ้งเตือน</div>
            {active.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">ไม่มีรายการต้องดำเนินการ</p>
            ) : (
              <ul className="max-h-80 overflow-auto py-1">
                {active.map((i) => (
                  <li key={i.id}>
                    <button onClick={() => { i.onClick(); setOpen(false); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot(i.tone))} />
                      <span className="flex-1">{i.label}</span>
                      <span className="fig text-sm font-semibold">{i.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
