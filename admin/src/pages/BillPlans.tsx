import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ChevronDown, ChevronUp, Download, Eye, Pencil, Plus, Search, Send, SlidersHorizontal, Trash2, X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge, statusTh } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";

export function BillPlans() {
  const confirm = useConfirm();
  const custs = useQuery({ queryKey: ["customers"], queryFn: () => apiGet("/api/customers?limit=200") });
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const [viewCust, setViewCust] = useState("");
  const [billFilter, setBillFilter] = useState("");
  const [billStatus, setBillStatus] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<"interval" | "custom">("interval");
  const [rows, setRows] = useState([{ due_date: "", amount_due: "", penalty_amount: "" }]);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const [payInst, setPayInst] = useState<any>(null);
  const [editInst, setEditInst] = useState<any>(null);
  const [previewBill, setPreviewBill] = useState<{ id: string; billNo: number; title?: string } | null>(null);
  const [autoPreview, setAutoPreview] = useState<{ billNo: number; text: string } | null>(null);
  const [penaltyPlan, setPenaltyPlan] = useState<any>(null);

  const plans = useQuery({ queryKey: ["bill-plans", viewCust], queryFn: () => viewCust ? apiGet(`/api/customers/${viewCust}/bill-plans`) : apiGet("/api/bill-plans") });
  const allPlans: any[] = plans.data ?? [];
  const filteredPlans = allPlans.filter((p: any) => {
    const matchesNumber = !billFilter.trim() || String(p.bill_no).includes(billFilter.trim());
    const matchesStatus = !billStatus || p.status === billStatus;
    return matchesNumber && matchesStatus;
  });
  const groupedPlans = [
    { status: "active", label: "กำลังใช้งาน" },
    { status: "completed", label: "เสร็จสิ้น" },
    { status: "cancelled", label: "ยกเลิกแล้ว" },
  ].map((group) => ({ ...group, plans: filteredPlans.filter((p: any) => p.status === group.status) }))
    .filter((group) => group.plans.length > 0);
  const planTabs = [
    { id: "", label: "บิลทั้งหมด", count: allPlans.length },
    { id: "active", label: "กำลังใช้งาน", count: allPlans.filter((p) => p.status === "active").length },
    { id: "completed", label: "เสร็จสิ้น", count: allPlans.filter((p) => p.status === "completed").length },
    { id: "cancelled", label: "ยกเลิกแล้ว", count: allPlans.filter((p) => p.status === "cancelled").length },
  ];
  const preview = useQuery({
    queryKey: ["bill-preview", previewBill?.id],
    queryFn: () => apiGet(`/api/bill-plans/${previewBill!.id}/preview`),
    enabled: !!previewBill,
  });
  const create = useMut((b: any) => apiSend("/api/bill-plans", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const createCustom = useMut((b: any) => apiSend("/api/bill-plans/custom-dates", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const previewAutoBill = useMut((b: any) => apiSend("/api/bill-plans/preview", "POST", b));
  const cancel = useMut((id: string) => apiSend(`/api/bill-plans/${id}/cancel`, "PATCH"), { success: "ยกเลิกบิลแล้ว", invalidate: ["bill-plans"] });
  const cancelBill = async (id: string) => {
    if (await confirm({ title: "ยืนยันยกเลิกบิล", message: "ยกเลิกบิลนี้? งวดที่ยังไม่จ่ายจะถูกยกเลิก", confirmLabel: "ยกเลิกบิล", destructive: true })) cancel.mutate(id);
  };
  const sendBill = useMut((id: string) => apiSend(`/api/bill-plans/${id}/send`, "POST"), { success: "ส่งบิลให้ลูกค้าแล้ว" });
  const editPlanPenalty = useMut((b: { id: string; amount: number }) => apiSend(`/api/bill-plans/${b.id}/penalty`, "PATCH", { bill_penalty_amount: b.amount }), { success: "บันทึกค่าปรับหัวบิลแล้ว", invalidate: ["bill-plans", "bill-preview"] });
  const inv = ["bill-plans", "due-today", "overdue"];
  const pay = useMut((b: { id: string; amount: number }) => apiSend(`/api/installments/${b.id}/pay`, "POST", { amount: b.amount }), { success: "บันทึกรับชำระแล้ว", invalidate: inv });
  const editI = useMut((b: { id: string; data: any }) => apiSend(`/api/installments/${b.id}`, "PATCH", b.data), { success: "แก้งวดแล้ว", invalidate: inv });

  const exportCsv = () => {
    const header = ["Bill No.", "สถานะ", "เงินต้น", "จำนวนงวด", "ลูกค้า"];
    const body = filteredPlans.map((p: any) => [p.bill_no, statusTh(p.status), p.principal_amount, p.total_installments, p.customer?.display_name || p.customer?.customer_code || ""]);
    const csv = [header, ...body].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bill-plans.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const remaining = (i: any) => Number(i?.amount_due ?? 0) - Number(i?.amount_paid ?? 0);

  const instCols: Column<any>[] = [
    { key: "no", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig">{i.installment_no}</span> },
    { key: "due", header: "ครบกำหนด", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{thDate(i.due_date)}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig">{baht(i.amount_due)}</span> },
    { key: "paid", header: "จ่าย", align: "right", sortValue: (i) => Number(i.amount_paid), cell: (i) => <span className="fig">{baht(i.amount_paid)}</span> },
    { key: "penalty", header: "ค่าปรับ", align: "right", sortValue: (i) => Number(i.penalty_amount), cell: (i) => <span className="fig text-danger-text">{Number(i.penalty_amount ?? 0) > 0 ? baht(i.penalty_amount) : "—"}</span> },
    { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
    { key: "act", header: "", stop: true, cell: (i) => i.status === "cancelled" ? null : (
      <div className="flex justify-end gap-1">
        {i.status !== "paid" && <Button size="sm" onClick={() => setPayInst(i)}>รับชำระ</Button>}
        <Button size="sm" variant="outline" onClick={() => setEditInst(i)}>แก้</Button>
      </div>
    ) },
  ];

  const custOptions = (custs.data?.items ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.customer_code} {c.display_name || ""}</option>);
  const bankSelect = (
    <Select name="bank_account_id" defaultValue="">
      <option value="">บัญชีหลัก (ค่าเริ่มต้น)</option>
      {(banks.data ?? []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.bank_name} {b.account_no}</option>)}
    </Select>
  );

  const intervalPayload = (fd: FormData) => {
    const num = (k: string) => Number(fd.get(k));
    return {
      customer_id: fd.get("customer_id"), bill_no: num("bill_no"), principal_amount: num("principal_amount"),
      installment_amount: num("installment_amount"), cycle_type: "interval_days", cycle_days: num("cycle_days"),
      total_installments: num("total_installments"), start_date: fd.get("start_date"),
      bill_penalty_amount: num("bill_penalty_amount"), installment_penalty_amount: num("installment_penalty_amount"),
      bank_account_id: fd.get("bank_account_id") || undefined, note: fd.get("note") || undefined,
    };
  };
  const previewInterval = (form: HTMLFormElement) => {
    previewAutoBill.mutate(intervalPayload(new FormData(form)), {
      onSuccess: (result: any) => setAutoPreview({ billNo: result.bill_no, text: result.text }),
    });
  };
  const submitInterval = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    create.mutate(intervalPayload(new FormData(e.currentTarget)), { onSuccess: () => { setViewCust(""); setCreateOpen(false); } });
  };
  const submitCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const installments = rows.filter((r) => r.due_date && r.amount_due).map((r, i) => ({ installment_no: i + 1, due_date: r.due_date, amount_due: Number(r.amount_due), penalty_amount: Number(r.penalty_amount || 0) }));
    if (!installments.length) return;
    createCustom.mutate({
      customer_id: fd.get("customer_id"), bill_no: Number(fd.get("bill_no")), principal_amount: Number(fd.get("principal_amount")),
      cycle_type: "custom_dates", bank_account_id: fd.get("bank_account_id") || undefined, bill_penalty_amount: Number(fd.get("bill_penalty_amount") || 0), note: fd.get("note") || undefined, installments,
    }, { onSuccess: () => { setRows([{ due_date: "", amount_due: "", penalty_amount: "" }]); setViewCust(""); setCreateOpen(false); } });
  };

  return (
    <>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างบิลใหม่" className="max-w-5xl">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">เลือกวิธีตั้งงวด</p>
              <p className="mt-0.5 text-xs text-muted-foreground">เลือกรอบชำระอัตโนมัติ หรือระบุวันครบกำหนดทีละงวด</p>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="วิธีตั้งงวด">
              <Button size="sm" type="button" variant={mode === "interval" ? "default" : "outline"} aria-pressed={mode === "interval"} onClick={() => setMode("interval")}><CalendarClock className="h-3.5 w-3.5" />ทุก X วัน</Button>
              <Button size="sm" type="button" variant={mode === "custom" ? "default" : "outline"} aria-pressed={mode === "custom"} onClick={() => setMode("custom")}><CalendarDays className="h-3.5 w-3.5" />กำหนดวันเอง</Button>
            </div>
          </div>
          {mode === "interval" ? (
            <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submitInterval}>
              <Field label="ลูกค้า"><Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select></Field>
              <Field label="เลขที่บิล"><Input name="bill_no" type="number" min="1" placeholder="เช่น 1001" required /></Field>
              <Field label="เงินต้น (บาท)"><Input name="principal_amount" type="number" min="0.01" step="0.01" placeholder="เช่น 12000" required /></Field>
              <Field label="ยอดต่องวด (บาท)"><Input name="installment_amount" type="number" min="0.01" step="0.01" placeholder="เช่น 1000" required /></Field>
              <Field label="รอบชำระ (วัน)"><Input name="cycle_days" type="number" min="1" placeholder="เช่น 7" required /></Field>
              <Field label="จำนวนงวด"><Input name="total_installments" type="number" min="1" placeholder="เช่น 12" required /></Field>
              <Field label="วันเริ่ม"><Input name="start_date" type="date" required /></Field>
              <Field label="บัญชีรับโอน">{bankSelect}</Field>
              <Field label="ค่าปรับหัวบิลรวม"><Input name="bill_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
              <Field label="ค่าปรับต่องวด (ค่าเริ่มต้น)"><Input name="installment_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
              <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-3"><Input name="note" placeholder="เช่น นัดชำระทุกวันจันทร์" /></Field>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3 sm:col-span-2 lg:col-span-3 sm:justify-end">
                <Button type="button" variant="outline" disabled={previewAutoBill.isPending} onClick={(e) => { if (e.currentTarget.form) previewInterval(e.currentTarget.form); }}>
                  {previewAutoBill.isPending ? "กำลังสร้างตัวอย่าง…" : "ดูตัวอย่างบิล"}
                </Button>
                <Button type="submit" disabled={create.isPending}>สร้างบิล</Button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={submitCustom}>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="ลูกค้า"><Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select></Field>
                <Field label="เลขที่บิล"><Input name="bill_no" type="number" min="1" placeholder="เช่น 1001" required /></Field>
                <Field label="เงินต้น (บาท)"><Input name="principal_amount" type="number" min="0.01" step="0.01" placeholder="เช่น 12000" required /></Field>
                <Field label="บัญชีรับโอน">{bankSelect}</Field>
                <Field label="ค่าปรับหัวบิลรวม"><Input name="bill_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
                <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-4"><Input name="note" placeholder="เช่น นัดชำระทุกวันจันทร์" /></Field>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">กำหนดงวดชำระ</p>
                    <p className="text-xs text-muted-foreground">ระบุวันครบกำหนด ยอดงวด และค่าปรับของแต่ละงวด</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{rows.length} งวด</span>
                </div>
                <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_8rem_7rem_auto] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                  <span>งวด</span><span>วันครบกำหนด</span><span>ยอด (บาท)</span><span>ค่าปรับ (บาท)</span><span />
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 rounded-lg border border-border/70 bg-card p-2 sm:grid-cols-[1.5rem_minmax(0,1fr)_8rem_7rem_auto] sm:border-0 sm:bg-transparent sm:p-0">
                    <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                    <Input type="date" aria-label={`วันครบกำหนด งวดที่ ${i + 1}`} value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} className="min-w-0" />
                    <Input type="number" min="0.01" step="0.01" placeholder="ยอด (บาท)" aria-label={`ยอดงวดที่ ${i + 1}`} value={r.amount_due} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount_due: e.target.value } : x))} className="col-start-2 row-start-2 w-full sm:col-start-auto sm:row-start-auto sm:w-full" />
                    <Input type="number" min="0" step="0.01" placeholder="ค่าปรับ" aria-label={`ค่าปรับงวดที่ ${i + 1}`} value={r.penalty_amount} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, penalty_amount: e.target.value } : x))} className="col-start-2 row-start-3 w-full sm:col-start-auto sm:row-start-auto sm:w-full" />
                    {rows.length > 1 && <Button size="icon" variant="ghost" type="button" className="col-start-2 row-start-4 justify-self-start sm:col-start-auto sm:row-start-auto" aria-label={`ลบงวดที่ ${i + 1}`} title={`ลบงวดที่ ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => setRows([...rows, { due_date: "", amount_due: "", penalty_amount: "" }])}><Plus className="mr-1 h-3 w-3" /> เพิ่มงวด</Button>
                  <span className="text-xs text-muted-foreground">เพิ่มได้หลายงวดตามจริง</span>
                </div>
              </div>
              <div className="flex justify-end border-t border-border pt-3">
                <Button type="submit" disabled={createCustom.isPending}>สร้างบิล</Button>
              </div>
            </form>
          )}
        </div>
      </Dialog>

      <Card className="overflow-hidden">
        <CardHeader className="items-start border-b border-border/60 bg-background/40 sm:items-center">
          <div className="min-w-0">
            <CardTitle className="text-lg">รายการบิล</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">ดูสถานะงวด รับชำระ และส่งบิลให้ลูกค้าได้จากที่เดียว</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{allPlans.length} บิล</span>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={billFilter} onChange={(e) => setBillFilter(e.target.value)} placeholder="ค้นหาเลขที่บิล" className="h-11 pl-10 pr-10" aria-label="ค้นหาเลขที่บิล" />
              {billFilter && <button type="button" onClick={() => setBillFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="ล้างคำค้น"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11" aria-expanded={filtersOpen} aria-controls="plans-filters" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className="h-4 w-4" /> ตัวกรอง{(viewCust || billFilter || billStatus) && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">{Number(!!viewCust) + Number(!!billFilter) + Number(!!billStatus)}</span>}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={exportCsv} disabled={!filteredPlans.length}><Download className="h-4 w-4" /> ดาวน์โหลด CSV</Button>
              <Button type="button" className="h-11" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> สร้างบิลใหม่</Button>
            </div>
          </div>

          <div role="tablist" aria-label="กรองตามสถานะบิล" className="flex overflow-x-auto rounded-xl border border-border p-1">
            {planTabs.map((item) => <button key={item.id || "all"} type="button" role="tab" aria-selected={billStatus === item.id} aria-controls="plans-list" onClick={() => setBillStatus(item.id)} className={`min-w-[135px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${billStatus === item.id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{item.label} <span className="ml-1 text-xs opacity-70">({item.count})</span></button>)}
          </div>

          {filtersOpen && <div id="plans-filters" className="grid grid-cols-1 gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"><Field label="ลูกค้า"><Select value={viewCust} onChange={(e) => { setViewCust(e.target.value); setBillFilter(""); setBillStatus(""); }}><option value="">ลูกค้าทั้งหมด</option>{custOptions}</Select></Field><Field label="สถานะบิล"><Select value={billStatus} onChange={(e) => setBillStatus(e.target.value)}><option value="">ทุกสถานะ</option><option value="active">กำลังใช้งาน</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิกแล้ว</option></Select></Field><Button type="button" variant="ghost" className="h-[42px]" onClick={() => { setViewCust(""); setBillFilter(""); setBillStatus(""); }}>ล้างตัวกรอง</Button></div>}

          <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span aria-live="polite">{`แสดง ${filteredPlans.length} จาก ${allPlans.length} บิล`}</span>{(viewCust || billFilter || billStatus) && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setViewCust(""); setBillFilter(""); setBillStatus(""); }}>ล้างตัวกรอง</button>}</div>
        </CardContent>
        <div id="plans-list" className="border-t border-border p-4 md:p-5">
          {plans.isLoading && <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">กำลังโหลดบิล…</p>}
          {groupedPlans.map((group) => (
            <Card key={group.status} className="mb-4 overflow-hidden last:mb-0">
              <CardHeader className="border-b border-border bg-muted/30 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <CardTitle>บิล {group.label}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{group.plans.length} บิลในกลุ่มนี้</p>
                </div>
                {group.status === "active" && <Button
                  size="sm"
                  variant="outline"
                  className="ml-0 sm:ml-auto"
                  onClick={() => setPreviewBill({ id: group.plans[0].id, billNo: group.plans[0].bill_no, title: "ดูตัวอย่างรวม, บิลกำลังใช้งาน" })}
                ><Eye className="h-3.5 w-3.5" />ดูตัวอย่างรวม</Button>}
              </CardHeader>
              <CardContent className="space-y-3 p-3">
                {group.plans.map((p: any) => (
                    <Card key={p.id}>
                    <CardHeader className="flex-col items-stretch gap-3 py-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <CardTitle className="text-base">บิล {p.bill_no}</CardTitle>
                        {p.customer && <span className="text-xs text-muted-foreground">{p.customer.display_name || p.customer.customer_code}</span>}
                        {statusBadge(p.status)}
                        {Number(p.penalty_amount ?? 0) > 0 && <span className="text-xs text-danger-text">ค่าปรับหัวบิล {baht(p.penalty_amount)}</span>}
                      </div>
                      <div className="ml-0 flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto sm:justify-end">
                        <Button size="sm" variant="ghost" type="button" aria-expanded={expandedPlans[p.id] ?? false} onClick={() => setExpandedPlans((current) => ({ ...current, [p.id]: !(current[p.id] ?? false) }))}>
                          {(expandedPlans[p.id] ?? false) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {(expandedPlans[p.id] ?? false) ? "ซ่อนงวด" : "ดูงวด"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPreviewBill({ id: p.id, billNo: p.bill_no })}><Eye className="h-3.5 w-3.5" />ดูตัวอย่าง</Button>
                        <Button size="sm" variant="outline" onClick={() => setPenaltyPlan(p)}><Pencil className="h-3.5 w-3.5" />แก้ค่าปรับ</Button>
                        {p.status === "active" && <>
                          <Button size="sm" onClick={() => sendBill.mutate(p.id)}><Send className="h-3.5 w-3.5" />ส่งให้ลูกค้า</Button>
                          <Button size="sm" variant="destructive" onClick={() => void cancelBill(p.id)}>ยกเลิกบิล</Button>
                        </>}
                      </div>
                    </CardHeader>
                    {(expandedPlans[p.id] ?? false) && <CardContent className="p-0">
                      <DataTable data={p.installments} columns={instCols} rowKey={(i) => i.id} initialSort={{ key: "no", dir: "asc" }} maxHeight="none" empty="ไม่มีงวด" />
                    </CardContent>}
                  </Card>
                ))}
              </CardContent>
            </Card>
          ))}
          {!plans.isLoading && filteredPlans.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center"><p className="text-sm text-muted-foreground">{allPlans.length ? "ไม่พบบิลตามตัวกรอง" : "ยังไม่มีบิล"}</p>{allPlans.length > 0 && <Button size="sm" variant="outline" className="mt-3" onClick={() => { setViewCust(""); setBillFilter(""); setBillStatus(""); }}>ล้างตัวกรอง</Button>}</div>}
        </div>
      </Card>

      {/* รับชำระเงิน (เงินสด/นอกสลิป) */}
      <Dialog open={!!payInst} onClose={() => setPayInst(null)} title={`รับชำระ, งวดที่ ${payInst?.installment_no ?? ""}`} className="max-w-sm">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const amt = Number((e.currentTarget.elements.namedItem("amount") as HTMLInputElement).value); pay.mutate({ id: payInst.id, amount: amt }, { onSuccess: () => setPayInst(null) }); }}>
          <div className="rounded-xl bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">ยอดคงเหลือของงวดนี้</p>
            <p className="fig mt-1 text-lg font-semibold">{remaining(payInst).toLocaleString("th-TH")} บาท</p>
          </div>
          <Field label="ยอดที่รับ (บาท)"><Input name="amount" type="number" step="0.01" min="0.01" defaultValue={remaining(payInst)} autoFocus required /></Field>
          <p className="text-xs text-muted-foreground">เมื่อลูกค้าผูก LINE แล้ว ระบบจะส่งใบยืนยันให้อัตโนมัติ</p>
          <Button type="submit" className="w-full" disabled={pay.isPending}>บันทึกรับชำระ</Button>
        </form>
      </Dialog>

      {/* แก้ไขงวด */}
      <Dialog open={!!editInst} onClose={() => setEditInst(null)} title={`แก้ไขงวด ${editInst?.installment_no ?? ""}`} className="max-w-sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget.elements as any;
          editI.mutate({ id: editInst.id, data: { amount_due: Number(f.amount_due.value), due_date: f.due_date.value, status: f.status.value, penalty_amount: Number(f.penalty_amount.value || 0) } }, { onSuccess: () => setEditInst(null) });
        }}>
          <Field label="ยอดงวด (บาท)"><Input name="amount_due" type="number" min="0.01" step="0.01" defaultValue={editInst?.amount_due} required /></Field>
          <Field label="วันครบกำหนด"><Input name="due_date" type="date" defaultValue={editInst?.due_date} required /></Field>
          <Field label="สถานะงวด"><Select name="status" defaultValue={editInst?.status}>
              {["pending", "partial_paid", "overdue", "paid", "cancelled"].map((s) => <option key={s} value={s}>{statusTh(s)}</option>)}
            </Select></Field>
          <Field label="ค่าปรับงวดนี้ (บาท)"><Input name="penalty_amount" type="number" min="0" step="0.01" defaultValue={editInst?.penalty_amount ?? 0} /></Field>
          <Button type="submit" className="w-full" disabled={editI.isPending}>บันทึกการแก้ไข</Button>
        </form>
      </Dialog>

      <Dialog open={!!penaltyPlan} onClose={() => setPenaltyPlan(null)} title={`ค่าปรับหัวบิล ${penaltyPlan?.bill_no ?? ""}`} className="max-w-sm">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const amount = Number((e.currentTarget.elements.namedItem("bill_penalty_amount") as HTMLInputElement).value || 0);
          editPlanPenalty.mutate({ id: penaltyPlan.id, amount }, { onSuccess: () => setPenaltyPlan(null) });
        }}>
          <p className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">ค่าปรับหัวบิลจะแสดงแยกจากยอดงวดหลักในตัวอย่างบิลและข้อความ LINE</p>
          <Field label="ค่าปรับหัวบิล (บาท)"><Input name="bill_penalty_amount" type="number" min="0" step="0.01" defaultValue={penaltyPlan?.penalty_amount ?? 0} autoFocus /></Field>
          <Button size="sm" type="submit" className="w-full" disabled={editPlanPenalty.isPending}>บันทึกค่าปรับ</Button>
        </form>
      </Dialog>

      <Dialog open={!!autoPreview} onClose={() => setAutoPreview(null)} title={`ดูตัวอย่างบิลอัตโนมัติ ${autoPreview?.billNo ?? ""}`} className="max-w-xl">
        <p className="mb-3 text-xs text-muted-foreground">ตัวอย่างนี้สร้างจากข้อมูลที่กรอกไว้ และยังไม่บันทึกลงระบบ</p>
        <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-4 py-3 font-sans text-[15px] leading-7 text-foreground">
          {autoPreview?.text}
        </pre>
      </Dialog>

      {/* Preview is the exact text sent by the bill renderer. */}
      <Dialog open={!!previewBill} onClose={() => setPreviewBill(null)} title={previewBill?.title ?? `ดูตัวอย่างบิล ${previewBill?.billNo ?? ""}`} className="max-w-xl">
        <p className="mb-3 text-xs text-muted-foreground">ข้อความนี้เหมือนกับข้อความที่จะส่งให้ลูกค้าทาง LINE</p>
        {preview.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลดตัวอย่างบิล…</p>}
        {preview.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">โหลดตัวอย่างบิลไม่สำเร็จ</p>}
        {preview.data?.text && (
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-4 py-3 font-sans text-[15px] leading-7 text-foreground">
            {preview.data.text}
          </pre>
        )}
      </Dialog>
    </>
  );
}
