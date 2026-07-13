import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, CheckCircle2, Circle, CalendarDays, AlertTriangle, Receipt, Clock } from "lucide-react";
import { NavCtx } from "@/App";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog, KV } from "@/components/ui/dialog";

const custName = (i: any) =>
  i.bill_plan?.customer?.display_name || i.bill_plan?.customer?.customer_code || "—";

// Left status tick: green = settled, oxblood = overdue, amber = waiting.
const tick = (s: string) =>
  s === "completed" || s === "paid" ? "bg-primary" : s === "cancelled" ? "bg-muted-foreground/40" : "bg-[#EF4444]";

function InstTable({ rows, empty, loading }: { rows: any[]; empty: string; loading?: boolean }) {
  const [payInst, setPayInst] = useState<any>(null);
  const pay = useMut((b: { id: string; amount: number }) => apiSend(`/api/installments/${b.id}/pay`, "POST", { amount: b.amount }), { success: "บันทึกรับชำระแล้ว", invalidate: ["due-today", "overdue"] });
  const remind = useMut((id: string) => apiSend(`/api/installments/${id}/remind`, "POST"), { success: "ส่งเตือนแล้ว" });
  const remaining = (i: any) => Number(i?.amount_due ?? 0) - Number(i?.amount_paid ?? 0);
  const columns: Column<any>[] = [
    { key: "tick", header: "", className: "w-1 p-0", cell: (i) => <div className={`h-7 w-[3px] rounded-full ${tick(i.status)}`} /> },
    { key: "cust", header: "ลูกค้า", sortValue: custName, cell: (i) => <span className="font-medium">{custName(i)}</span> },
    { key: "bill", header: "บิล", sortValue: (i) => i.bill_plan?.bill_no, cell: (i) => <span className="fig text-muted-foreground">#{i.bill_plan?.bill_no ?? "—"}</span> },
    { key: "inst", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig text-muted-foreground">{i.installment_no}</span> },
    { key: "due", header: "ครบกำหนด", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{thDate(i.due_date)}</span> },
    { key: "amt", header: "ยอด (฿)", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig font-medium">{baht(i.amount_due)}</span> },
    { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
    { key: "act", header: "", stop: true, cell: (i) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" disabled={remind.isPending} onClick={() => remind.mutate(i.id)}>เตือน</Button>
        <Button size="sm" variant="outline" onClick={() => setPayInst(i)}>รับชำระ</Button>
      </div>
    ) },
  ];
  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(i) => i.id}
        empty={empty}
        loading={loading}
        detailTitle="รายละเอียดงวด"
        detail={(i) => ({
          body: <KV pairs={[
            ["ลูกค้า", custName(i)],
            ["บิล", `#${i.bill_plan?.bill_no ?? "—"}`],
            ["งวดที่", i.installment_no],
            ["ครบกำหนด", thDate(i.due_date)],
            ["ยอด (฿)", baht(i.amount_due)],
            ["สถานะ", statusBadge(i.status)],
          ]} />,
        })}
      />
      <Dialog open={!!payInst} onClose={() => setPayInst(null)} title={`รับชำระ — ${custName(payInst ?? {})}`} className="max-w-sm">
        <form onSubmit={(e) => { e.preventDefault(); const amt = Number((e.currentTarget.elements.namedItem("amount") as HTMLInputElement).value); pay.mutate({ id: payInst.id, amount: amt }, { onSuccess: () => setPayInst(null) }); }}>
          <label className="text-sm font-medium text-foreground">ยอดที่รับ (บาท) :</label>
          <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={remaining(payInst)} className="mt-1" autoFocus required />
          <p className="mt-2 text-xs text-muted-foreground">คงเหลืองวดนี้ {baht(remaining(payInst))} บาท · ลูกค้าที่ผูก LINE จะได้รับใบยืนยันอัตโนมัติ</p>
          <Button size="sm" type="submit" className="mt-3 w-full" disabled={pay.isPending}>บันทึกรับชำระ</Button>
        </form>
      </Dialog>
    </>
  );
}

function StatCard({ icon: Icon, label, n, tint, onClick }: { icon: any; label: string; n: number; tint: string; onClick?: () => void }) {
  return (
    <Card
      className={`p-5 ${onClick ? "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 font-head text-[2rem] font-bold leading-none">{n.toLocaleString("th-TH")}</div>
      <div className="mt-1.5 text-sm text-muted-foreground">{label}{onClick ? " →" : ""}</div>
    </Card>
  );
}

export function Dashboard() {
  const due = useQuery({ queryKey: ["due-today"], queryFn: () => apiGet("/api/installments/due-today") });
  const over = useQuery({ queryKey: ["overdue"], queryFn: () => apiGet("/api/installments/overdue") });
  const pend = useQuery({
    queryKey: ["subs-pending"],
    queryFn: () => apiGet("/api/admin/payment-submissions?review_status=pending_review&limit=1"),
  });

  const remind = useMut(() => apiSend("/api/installments/send-reminders", "POST"), { success: "ส่งเตือนแล้ว", invalidate: ["due-today"] });
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

  // First-run setup checklist.
  const oas = useQuery({ queryKey: ["line-oa"], queryFn: () => apiGet("/api/line-oa-accounts") });
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const custCount = useQuery({ queryKey: ["customers", "", 1], queryFn: () => apiGet("/api/customers?limit=1&page=1") });
  const go = useContext(NavCtx);
  const setup = [
    { done: (oas.data?.length ?? 0) > 0, label: "เชื่อมต่อ LINE OA", tab: "oa" },
    { done: (banks.data?.length ?? 0) > 0, label: "เพิ่มบัญชีรับโอน", tab: "banks" },
    { done: (custCount.data?.total ?? 0) > 0, label: "เพิ่มลูกค้า", tab: "customers" },
  ];
  const loaded = oas.isSuccess && banks.isSuccess && custCount.isSuccess;
  const showSetup = loaded && setup.some((s) => !s.done);

  // Overdue aging buckets, computed from due_date (no backend).
  const aging = { d7: 0, d30: 0, d30p: 0 };
  const now = Date.now();
  for (const i of over.data ?? []) {
    const days = Math.floor((now - new Date(i.due_date).getTime()) / 86400000);
    if (days <= 7) aging.d7++;
    else if (days <= 30) aging.d30++;
    else aging.d30p++;
  }

  return (
    <>
      {showSetup && (
        <Card className="border-l-[3px] border-l-primary">
          <CardHeader><CardTitle>เริ่มต้นใช้งาน</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {setup.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-sm">
                {s.done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                {!s.done && <Button size="sm" variant="outline" className="ml-auto" onClick={() => go(s.tab)}>ไปตั้งค่า</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* toolbar: ledger date + action */}
      <div className="flex items-center justify-between">
        <div className="fig text-sm text-muted-foreground">ประจำวันที่ {today}</div>
        <Button size="sm" disabled={remind.isPending}
          onClick={() => remind.mutate(undefined as any, { onSuccess: (r: any) => toast.message(`ส่งเตือน ${r.sent}/${r.candidates} ราย`) })}>
          <Send className="h-3.5 w-3.5" /> ส่งเตือนวันนี้
        </Button>
      </div>

      {/* summary stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarDays} label="ครบกำหนดวันนี้" n={due.data?.length ?? 0} tint="bg-sky-50 text-sky-600" />
        <StatCard icon={AlertTriangle} label="ค้างชำระ" n={over.data?.length ?? 0} tint="bg-red-50 text-red-500" />
        <StatCard icon={Receipt} label="สลิปรอตรวจ" n={pend.data?.total ?? 0} tint="bg-amber-50 text-amber-600" onClick={() => go("subs")} />
      </div>

      {/* overdue aging */}
      {(over.data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={Clock} label="ค้าง 1–7 วัน" n={aging.d7} tint="bg-amber-50 text-amber-600" />
          <StatCard icon={Clock} label="ค้าง 8–30 วัน" n={aging.d30} tint="bg-orange-50 text-orange-600" />
          <StatCard icon={AlertTriangle} label="ค้างเกิน 30 วัน" n={aging.d30p} tint="bg-red-50 text-red-500" />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>ครบกำหนดวันนี้</CardTitle></CardHeader>
        <CardContent className="p-0"><InstTable rows={due.data ?? []} empty="ยังไม่มีรายการครบกำหนดวันนี้" loading={due.isLoading} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>ค้างชำระ</CardTitle></CardHeader>
        <CardContent className="p-0"><InstTable rows={over.data ?? []} empty="ไม่มีรายการค้างชำระ" loading={over.isLoading} /></CardContent>
      </Card>
    </>
  );
}
