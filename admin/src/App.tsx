import { createContext, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { LayoutDashboard, Users as UsersIcon, Landmark, FileText, Receipt, Menu, LogOut, MessageSquare, Reply, ArrowLeft, Settings as SettingsIcon, HardDrive, BarChart3, History, UserCheck, Users2, Sun, Moon } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from "@/lib/auth";
import { hasCreds } from "@/lib/api";
import { Dashboard } from "@/pages/Dashboard";
import { Customers } from "@/pages/Customers";
import { BankAccounts } from "@/pages/BankAccounts";
import { BillPlans } from "@/pages/BillPlans";
import { Submissions } from "@/pages/Submissions";
import { LineOa } from "@/pages/LineOa";
import { Settings } from "@/pages/Settings";
import { MessageResponseSettings } from "@/pages/MessageResponseSettings";
import { Reports } from "@/pages/Reports";
import { Logs } from "@/pages/Logs";
import { Senders } from "@/pages/Senders";
import { Groups } from "@/pages/Groups";
import { Users } from "@/pages/Users";
import { PlatformSettings } from "@/pages/PlatformSettings";
import { GoogleDriveSettings } from "@/pages/GoogleDriveSettings";
import { Login } from "@/pages/Login";
import { NotificationBell, type Notif } from "@/components/NotificationBell";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Lets pages jump to another nav tab (e.g. the Dashboard setup checklist).
export const NavCtx = createContext<(tabId: string) => void>(() => {});

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.theme = dark ? "dark" : "light";
}
// Init before first paint.
applyTheme(localStorage.theme ? localStorage.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);

function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  return (
    <button onClick={() => { const d = !dark; setDark(d); applyTheme(d); }} className="rounded-md p-2 text-foreground hover:bg-accent" aria-label="สลับธีมสว่าง/มืด">
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

const NAV_GROUPS = [
  {
    label: "ภาพรวม",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, el: <Dashboard /> },
    ],
  },
  {
    label: "จัดการ",
    items: [
      { id: "customers", label: "ลูกค้า", icon: UsersIcon, el: <Customers /> },
      { id: "banks", label: "บัญชีรับโอน", icon: Landmark, el: <BankAccounts /> },
      { id: "plans", label: "สร้างบิล", icon: FileText, el: <BillPlans /> },
      { id: "subs", label: "สลิป / อนุมัติ", icon: Receipt, el: <Submissions /> },
      { id: "senders", label: "ผู้ส่งสลิป", icon: UserCheck, el: <Senders /> },
      { id: "groups", label: "กลุ่ม LINE", icon: Users2, el: <Groups /> },
    ],
  },
  {
    label: "รายงาน & ระบบ",
    items: [
      { id: "reports", label: "รายงาน", icon: BarChart3, el: <Reports /> },
      { id: "oa", label: "LINE OA", icon: MessageSquare, el: <LineOa /> },
      { id: "logs", label: "ประวัติ", icon: History, el: <Logs /> },
      { id: "settings", label: "ตั้งค่า", icon: SettingsIcon, el: <Settings /> },
      { id: "message-settings", label: "ข้อความตอบกลับ LINE", icon: Reply, el: <MessageResponseSettings /> },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);
// Flat (id,label) list + default categories for the menu-management UI in Settings.
function SidebarBrand() {
  return (
    <div className="flex h-[62px] shrink-0 items-center gap-3 border-b border-border px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
        <span className="fig text-base font-bold text-white">฿</span>
      </div>
      <div className="leading-tight">
        <div className="font-head text-[15px] font-bold text-foreground">Bill Admin</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">สมุดลูกหนี้</div>
      </div>
    </div>
  );
}

function Frame({ title, brand, right, children, nav }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:flex">
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn(
        "sidebar-light fixed inset-y-0 left-0 z-40 flex w-60 flex-col text-foreground transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:z-auto lg:translate-x-0 lg:shrink-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarBrand />
        <div className="flex-1 overflow-y-auto py-2 px-2.5">
          {nav?.(() => setOpen(false))}
        </div>
        {brand && <div className="p-3 border-t border-border">{brand}</div>}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[62px] shrink-0 flex-wrap items-center gap-3 border-b border-foreground/15 bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="leading-snug">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">หน้าหลัก</div>
            <h1 className="text-[17px] font-bold tracking-tight">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2.5"><ThemeToggle />{right}</div>
        </header>
        <main className="space-y-5 p-4 md:p-6 lg:p-7">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function Shell() {
  const { me, loading, isPlatformAdmin, impersonating, orgId, orgName, exitOrg, logout, menuPrefs } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [ptab, setPtab] = useState("users");
  const opEnabled = !!orgId && (!isPlatformAdmin || impersonating);
  const pending = useQuery({
    queryKey: ["subs-pending-nav"],
    queryFn: () => apiGet("/api/admin/payment-submissions?review_status=pending_review&limit=1"),
    enabled: opEnabled,
    refetchInterval: 30000,
  });
  // Shared cache keys with Dashboard — no extra fetch.
  const dueToday = useQuery({ queryKey: ["due-today"], queryFn: () => apiGet("/api/installments/due-today"), enabled: opEnabled, refetchInterval: 60000 });
  const overdue = useQuery({ queryKey: ["overdue"], queryFn: () => apiGet("/api/installments/overdue"), enabled: opEnabled, refetchInterval: 60000 });
  const pendingCount = pending.data?.total ?? 0;

  // Toast when new slips arrive (pending count goes up).
  const prevPending = useRef<number | null>(null);
  useEffect(() => {
    if (!opEnabled) { prevPending.current = null; return; }
    if (prevPending.current != null && pendingCount > prevPending.current) {
      toast.message(`มีสลิปใหม่รอตรวจ ${pendingCount - prevPending.current} รายการ`, { description: "เปิดเมนู สลิป / อนุมัติ เพื่อตรวจสอบ" });
    }
    prevPending.current = pendingCount;
  }, [pendingCount, opEnabled]);

  const notifs: Notif[] = [
    { id: "subs", label: "สลิปรอตรวจสอบ", count: pendingCount, tone: "warn", onClick: () => setTab("subs") },
    { id: "due", label: "ครบกำหนดวันนี้", count: dueToday.data?.length ?? 0, tone: "info", onClick: () => setTab("dashboard") },
    { id: "overdue", label: "ค้างชำระ", count: overdue.data?.length ?? 0, tone: "danger", onClick: () => setTab("dashboard") },
  ];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">กำลังโหลด…</div>
    </div>
  );
  if (!hasCreds() || !me) return <Login />;

  const roleText = impersonating ? "กำลังดูในมุม user" : isPlatformAdmin ? "Super Admin" : (orgName || "ผู้ใช้");
  const initials = (me.name ?? "U").trim().slice(0, 2).toUpperCase();
  const profile = (
    <div className="rounded-xl bg-secondary p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{initials}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{roleText}</div>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-2.5 w-full" onClick={logout}><LogOut className="h-3.5 w-3.5" /> ออกจากระบบ</Button>
    </div>
  );

  if (isPlatformAdmin && !impersonating) {
    const PLATFORM = [
      { id: "users", label: "ผู้ใช้ & องค์กร", icon: UsersIcon, el: <Users /> },
      { id: "system", label: "ตั้งค่าระบบ", icon: SettingsIcon, el: <PlatformSettings /> },
      { id: "gdrive", label: "Google Drive", icon: HardDrive, el: <GoogleDriveSettings /> },
    ];
    const pActive = PLATFORM.find((p) => p.id === ptab) ?? PLATFORM[0];
    const platformGroups = [
      { label: "แพลตฟอร์ม", items: PLATFORM.filter((p) => p.id === "users") },
      { label: "ตั้งค่า", items: PLATFORM.filter((p) => p.id !== "users") },
    ];
    const platformNav = (close: () => void) => (
      <nav>
        {platformGroups.map((group) => (
          <div key={group.label}>
            <div className="nav-section">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPtab(p.id); close(); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    pActive.id === p.id
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <p.icon className={cn("h-[18px] w-[18px] shrink-0", pActive.id === p.id ? "text-primary" : "")} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="px-3 pt-5 text-[12px] leading-relaxed text-muted-foreground">
          กด <span className="font-medium text-foreground">เข้าจัดการ</span> ที่ผู้ใช้รายใดในตาราง เพื่อเข้าไปดูแลบิล/ลูกค้าขององค์กรนั้น
        </p>
      </nav>
    );
    return (
      <Frame
        title={pActive.label}
        nav={platformNav}
        brand={profile}
        right={<Badge variant="warning">super admin</Badge>}
      >
        {pActive.el}
      </Frame>
    );
  }

  const active = NAV.find((n) => n.id === tab) ?? NAV[0];

  const hidden = new Set(menuPrefs?.hidden ?? []);
  const customGroups = menuPrefs?.groups?.length ? menuPrefs.groups : null;
  const customOrder = menuPrefs?.order?.length ? menuPrefs.order : null;

  const navFn = (close: () => void) => {
    const item = (n: typeof NAV[number]) => (
      <button
        key={n.id}
        onClick={() => { setTab(n.id); close(); }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
          active.id === n.id
            ? "bg-secondary font-semibold text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        )}
      >
        <n.icon className={cn("h-[18px] w-[18px] shrink-0", active.id === n.id ? "text-primary" : "")} />
        {n.label}
        {n.id === "subs" && pendingCount > 0 && (
          <span className="ml-auto rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[10px] font-semibold text-white">{pendingCount}</span>
        )}
      </button>
    );

    // Custom categories take precedence, then custom flat order, else the default grouped layout.
    if (customGroups) {
      const placed = new Set(customGroups.flatMap((g) => g.items));
      const missing = NAV.filter((n) => !placed.has(n.id));
      const groups = missing.length ? [...customGroups, { label: "อื่นๆ", items: missing.map((n) => n.id) }] : customGroups;
      return (
        <nav>
          {groups.map((g, gi) => {
            const items = g.items.map((id) => NAV.find((n) => n.id === id)).filter((n): n is typeof NAV[number] => !!n && !hidden.has(n.id));
            if (!items.length) return null;
            return (
              <div key={gi}>
                <div className="nav-section">{g.label}</div>
                <div className="space-y-0.5">{items.map(item)}</div>
              </div>
            );
          })}
        </nav>
      );
    }
    if (customOrder) {
      const ordered = [
        ...customOrder.map((id) => NAV.find((n) => n.id === id)).filter((n): n is typeof NAV[number] => !!n),
        ...NAV.filter((n) => !customOrder.includes(n.id)),
      ].filter((n) => !hidden.has(n.id));
      return <nav><div className="nav-section">เมนู</div><div className="space-y-0.5">{ordered.map(item)}</div></nav>;
    }
    return (
      <nav>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((n) => !hidden.has(n.id));
          if (!items.length) return null;
          return (
            <div key={group.label}>
              <div className="nav-section">{group.label}</div>
              <div className="space-y-0.5">{items.map(item)}</div>
            </div>
          );
        })}
      </nav>
    );
  };

  return (
    <Frame
      title={active.label}
      nav={navFn}
      brand={profile}
      right={
        <>
          <NotificationBell items={notifs} />
          {impersonating && (
            <Button size="sm" variant="outline" onClick={exitOrg}>
              <ArrowLeft className="h-3 w-3 mr-1" /> ออกจาก org
            </Button>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">{orgName}</span>
          {impersonating && <Badge variant="warning">ดูในมุม user</Badge>}
        </>
      }
    >
      <NavCtx.Provider value={setTab}>{active.el}</NavCtx.Provider>
    </Frame>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
