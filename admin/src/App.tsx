import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { LayoutDashboard, Users as UsersIcon, Landmark, FileText, Receipt, Menu, LogOut, MessageSquare, ArrowLeft, Settings as SettingsIcon, BarChart3, History, UserCheck, Users2 } from "lucide-react";
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
import { Reports } from "@/pages/Reports";
import { Logs } from "@/pages/Logs";
import { Senders } from "@/pages/Senders";
import { Groups } from "@/pages/Groups";
import { Users } from "@/pages/Users";
import { Login } from "@/pages/Login";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, el: <Dashboard /> },
  { id: "customers", label: "ลูกค้า", icon: UsersIcon, el: <Customers /> },
  { id: "banks", label: "บัญชีรับโอน", icon: Landmark, el: <BankAccounts /> },
  { id: "plans", label: "สร้างบิล", icon: FileText, el: <BillPlans /> },
  { id: "subs", label: "สลิป / อนุมัติ", icon: Receipt, el: <Submissions /> },
  { id: "senders", label: "ผู้ส่งสลิป", icon: UserCheck, el: <Senders /> },
  { id: "groups", label: "กลุ่ม LINE", icon: Users2, el: <Groups /> },
  { id: "reports", label: "รายงาน", icon: BarChart3, el: <Reports /> },
  { id: "oa", label: "LINE OA", icon: MessageSquare, el: <LineOa /> },
  { id: "logs", label: "ประวัติ", icon: History, el: <Logs /> },
  { id: "settings", label: "ตั้งค่า", icon: SettingsIcon, el: <Settings /> },
];

function Frame({ title, brand, right, children, nav }: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:flex">
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-60 bg-background p-3 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shrink-0", open ? "translate-x-0 neu-raised" : "-translate-x-full")}>
        <div className="flex h-12 items-center gap-2 px-2 font-bold">💸 Bill Admin</div>
        {nav?.(() => setOpen(false))}
        {brand}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-background px-3 py-3 md:px-4">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </header>
        <main className="space-y-4 p-3 md:p-5">{children}</main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function Shell() {
  const { me, loading, isPlatformAdmin, impersonating, orgId, orgName, exitOrg, logout } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const pending = useQuery({
    queryKey: ["subs-pending-nav"],
    queryFn: () => apiGet("/api/admin/payment-submissions?review_status=pending_review&limit=1"),
    enabled: !!orgId && (!isPlatformAdmin || impersonating),
    refetchInterval: 30000,
  });
  const pendingCount = pending.data?.total ?? 0;

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">กำลังโหลด…</div>;
  if (!hasCreds() || !me) return <Login />;

  // Super admin (not impersonating): user-management console only.
  if (isPlatformAdmin && !impersonating) {
    return (
      <Frame
        title="จัดการผู้ใช้"
        right={<><span className="hidden text-sm sm:inline">{me.name}</span><Badge variant="warning">super admin</Badge><Button size="icon" variant="ghost" onClick={logout}><LogOut className="h-4 w-4" /></Button></>}
      >
        <Users />
      </Frame>
    );
  }

  // Operational console: a normal user, or a super admin who entered an org.
  const active = NAV.find((n) => n.id === tab) ?? NAV[0];
  const navFn = (close: () => void) => (
    <nav className="mt-2 space-y-2">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => { setTab(n.id); close(); }} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-shadow", active.id === n.id ? "neu-inset text-primary font-semibold" : "neu-raised-sm neu-press")}>
          <n.icon className="h-4 w-4" /> {n.label}
          {n.id === "subs" && pendingCount > 0 && <Badge variant="destructive" className="ml-auto">{pendingCount}</Badge>}
        </button>
      ))}
    </nav>
  );

  return (
    <Frame
      title={active.label}
      nav={navFn}
      right={
        <>
          {impersonating && (
            <Button size="sm" variant="outline" onClick={exitOrg}><ArrowLeft className="h-3 w-3 mr-1" /> ออกจาก org</Button>
          )}
          <span className="hidden text-sm sm:inline">{orgName}</span>
          {impersonating ? <Badge variant="warning">ดูในมุม user</Badge> : <Badge variant="secondary">{me.name}</Badge>}
          <Button size="icon" variant="ghost" onClick={logout}><LogOut className="h-4 w-4" /></Button>
        </>
      }
    >
      {active.el}
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
