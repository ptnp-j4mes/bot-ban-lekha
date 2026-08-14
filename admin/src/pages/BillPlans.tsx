import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<"interval" | "custom">("interval");
  const [rows, setRows] = useState([{ due_date: "", amount_due: "", penalty_amount: "" }]);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  const [payInst, setPayInst] = useState<any>(null);
  const [editInst, setEditInst] = useState<any>(null);
  const [previewBill, setPreviewBill] = useState<{ id: string; billNo: number } | null>(null);
  const [penaltyPlan, setPenaltyPlan] = useState<any>(null);

  const plans = useQuery({ queryKey: ["bill-plans", viewCust], queryFn: () => apiGet(`/api/customers/${viewCust}/bill-plans`), enabled: !!viewCust });
  const filteredPlans = (plans.data ?? []).filter((p: any) => {
    const matchesNumber = !billFilter.trim() || String(p.bill_no).includes(billFilter.trim());
    const matchesStatus = !billStatus || p.status === billStatus;
    return matchesNumber && matchesStatus;
  });
  const preview = useQuery({
    queryKey: ["bill-preview", previewBill?.id],
    queryFn: () => apiGet(`/api/bill-plans/${previewBill!.id}/preview`),
    enabled: !!previewBill,
  });
  const create = useMut((b: any) => apiSend("/api/bill-plans", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const createCustom = useMut((b: any) => apiSend("/api/bill-plans/custom-dates", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const cancel = useMut((id: string) => apiSend(`/api/bill-plans/${id}/cancel`, "PATCH"), { success: "ยกเลิกบิลแล้ว", invalidate: ["bill-plans"] });
  const cancelBill = async (id: string) => {
    if (await confirm({ title: "ยืนยันยกเลิกบิล", message: "ยกเลิกบิลนี้? งวดที่ยังไม่จ่ายจะถูกยกเลิก", confirmLabel: "ยกเลิกบิล", destructive: true })) cancel.mutate(id);
  };
  const sendBill = useMut((id: string) => apiSend(`/api/bill-plans/${id}/send`, "POST"), { success: "ส่งบิลให้ลูกค้าแล้ว" });
  const editPlanPenalty = useMut((b: { id: string; amount: number }) => apiSend(`/api/bill-plans/${b.id}/penalty`, "PATCH", { bill_penalty_amount: b.amount }), { success: "บันทึกค่าปรับหัวบิลแล้ว", invalidate: ["bill-plans", "bill-preview"] });
  const inv = ["bill-plans", "due-today", "overdue"];
  const pay = useMut((b: { id: string; amount: number }) => apiSend(`/api/installments/${b.id}/pay`, "POST", { amount: b.amount }), { success: "บันทึกรับชำระแล้ว", invalidate: inv });
  const editI = useMut((b: { id: string; data: any }) => apiSend(`/api/installments/${b.id}`, "PATCH", b.data), { success: "แก้งวดแล้ว", invalidate: inv });

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
      <option value="">(default)</option>
      {(banks.data ?? []).filter((b: any) => b.is_active).map((b: any) => <option key={b.id} value={b.id}>{b.bank_name} {b.account_no}</option>)}
    </Select>
  );

  const submitInterval = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => Number(fd.get(k));
    const customerId = String(fd.get("customer_id") ?? "");
    create.mutate({
      customer_id: fd.get("customer_id"), bill_no: num("bill_no"), principal_amount: num("principal_amount"),
      installment_amount: num("installment_amount"), cycle_type: "interval_days", cycle_days: num("cycle_days"),
      total_installments: num("total_installments"), start_date: fd.get("start_date"),
      bill_penalty_amount: num("bill_penalty_amount"), installment_penalty_amount: num("installment_penalty_amount"),
      bank_account_id: fd.get("bank_account_id") || undefined, note: fd.get("note") || undefined,
    }, { onSuccess: () => { setViewCust(customerId); setCreateOpen(false); } });
  };
  const submitCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const installments = rows.filter((r) => r.due_date && r.amount_due).map((r, i) => ({ installment_no: i + 1, due_date: r.due_date, amount_due: Number(r.amount_due), penalty_amount: Number(r.penalty_amount || 0) }));
    if (!installments.length) return;
    const customerId = String(fd.get("customer_id") ?? "");
    createCustom.mutate({
      customer_id: fd.get("customer_id"), bill_no: Number(fd.get("bill_no")), principal_amount: Number(fd.get("principal_amount")),
      cycle_type: "custom_dates", bank_account_id: fd.get("bank_account_id") || undefined, bill_penalty_amount: Number(fd.get("bill_penalty_amount") || 0), note: fd.get("note") || undefined, installments,
    }, { onSuccess: () => { setRows([{ due_date: "", amount_due: "", penalty_amount: "" }]); setViewCust(customerId); setCreateOpen(false); } });
  };

  return (
    <>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างบิล" className="max-w-5xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/40 p-2">
            <p className="text-sm text-muted-foreground">เลือกวิธีสร้างบิล แล้วกรอกข้อมูลให้ครบ</p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" type="button" variant={mode === "interval" ? "default" : "outline"} onClick={() => setMode("interval")}>ทุก X วัน</Button>
              <Button size="sm" type="button" variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>กำหนดวันเอง</Button>
            </div>
          </div>
          {mode === "interval" ? (
            <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submitInterval}>
              <Field label="ลูกค้า"><Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select></Field>
              <Field label="Bill No."><Input name="bill_no" type="number" required /></Field>
              <Field label="เงินต้น"><Input name="principal_amount" type="number" required /></Field>
              <Field label="ส่งงวดละ"><Input name="installment_amount" type="number" required /></Field>
              <Field label="ทุกกี่วัน"><Input name="cycle_days" type="number" required /></Field>
              <Field label="จำนวนงวด"><Input name="total_installments" type="number" required /></Field>
              <Field label="วันเริ่ม"><Input name="start_date" type="date" required /></Field>
              <Field label="บัญชีรับโอน">{bankSelect}</Field>
              <Field label="ค่าปรับหัวบิลรวม"><Input name="bill_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
              <Field label="ค่าปรับทุกงวด (default)"><Input name="installment_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
              <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-3"><Input name="note" /></Field>
              <Button type="submit" disabled={create.isPending}>สร้างบิล</Button>
            </form>
          ) : (
            <form className="space-y-2" onSubmit={submitCustom}>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="ลูกค้า"><Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select></Field>
                <Field label="Bill No."><Input name="bill_no" type="number" required /></Field>
                <Field label="เงินต้น"><Input name="principal_amount" type="number" required /></Field>
                <Field label="บัญชีรับโอน">{bankSelect}</Field>
                <Field label="ค่าปรับหัวบิลรวม"><Input name="bill_penalty_amount" type="number" min="0" step="0.01" placeholder="เช่น 500" /></Field>
                <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-4"><Input name="note" /></Field>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">งวด (วันครบกำหนด + ยอด)</div>
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[1.5rem_minmax(0,1fr)_8rem_7rem_auto]">
                    <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                    <Input type="date" value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} className="min-w-0" />
                    <Input type="number" placeholder="ยอด" value={r.amount_due} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount_due: e.target.value } : x))} className="col-start-2 row-start-2 w-full sm:col-start-auto sm:row-start-auto sm:w-full" />
                    <Input type="number" min="0" step="0.01" placeholder="ค่าปรับ" value={r.penalty_amount} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, penalty_amount: e.target.value } : x))} className="col-start-2 row-start-3 w-full sm:col-start-auto sm:row-start-auto sm:w-full" />
                    {rows.length > 1 && <Button size="icon" variant="ghost" type="button" className="col-start-3 row-start-3 sm:col-start-auto sm:row-start-auto" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" type="button" onClick={() => setRows([...rows, { due_date: "", amount_due: "", penalty_amount: "" }])}><Plus className="h-3 w-3 mr-1" /> เพิ่มงวด</Button>
              </div>
              <Button size="sm" type="submit" disabled={createCustom.isPending}>สร้างบิล</Button>
            </form>
          )}
        </div>
      </Dialog>

      <Card>
        <CardHeader className="items-start sm:items-center">
          <div className="min-w-0">
            <CardTitle>ดูบิลของลูกค้า</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">เลือกผู้ใช้เพื่อดูและกรองบิลของรายนั้น</p>
          </div>
          <Button size="sm" className="ml-0 w-full sm:ml-auto sm:w-auto" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> สร้างบิล</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <Select value={viewCust} onChange={(e) => { setViewCust(e.target.value); setBillFilter(""); setBillStatus(""); }}><option value="">— เลือกลูกค้า —</option>{custOptions}</Select>
            <Input value={billFilter} onChange={(e) => setBillFilter(e.target.value)} placeholder="กรองเลขที่บิล" disabled={!viewCust} />
            <Select value={billStatus} onChange={(e) => setBillStatus(e.target.value)} disabled={!viewCust}>
              <option value="">ทุกสถานะ</option>
              <option value="active">ใช้งาน</option>
              <option value="cancelled">ยกเลิก</option>
            </Select>
          </div>
          {viewCust && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>แสดง {filteredPlans.length} จาก {(plans.data ?? []).length} บิล</span>{(billFilter || billStatus) && <button type="button" className="text-primary hover:underline" onClick={() => { setBillFilter(""); setBillStatus(""); }}>ล้างตัวกรอง</button>}</div>}
          {filteredPlans.map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="py-2 flex-row items-center gap-2">
                <CardTitle className="text-base">บิล {p.bill_no}</CardTitle>
                {statusBadge(p.status)}
                {Number(p.penalty_amount ?? 0) > 0 && <span className="text-xs text-danger-text">ค่าปรับหัวบิล {baht(p.penalty_amount)}</span>}
                <div className="ml-0 flex w-full flex-wrap gap-1 sm:ml-auto sm:w-auto">
                  <Button size="sm" variant="ghost" type="button" aria-expanded={expandedPlans[p.id] ?? true} onClick={() => setExpandedPlans((current) => ({ ...current, [p.id]: !(current[p.id] ?? true) }))}>
                    {(expandedPlans[p.id] ?? true) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {(expandedPlans[p.id] ?? true) ? "ย่อ" : "ขยาย"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreviewBill({ id: p.id, billNo: p.bill_no })}>Preview Bill</Button>
                  <Button size="sm" variant="outline" onClick={() => setPenaltyPlan(p)}>แก้ค่าปรับหัวบิล</Button>
                  {p.status === "active" && <>
                    <Button size="sm" variant="outline" onClick={() => sendBill.mutate(p.id)}>ส่งบิล</Button>
                    <Button size="sm" variant="destructive" onClick={() => void cancelBill(p.id)}>ยกเลิกบิล</Button>
                  </>}
                </div>
              </CardHeader>
              {(expandedPlans[p.id] ?? true) && <CardContent className="p-0">
                <DataTable data={p.installments} columns={instCols} rowKey={(i) => i.id} initialSort={{ key: "no", dir: "asc" }} maxHeight="none" empty="ไม่มีงวด" />
              </CardContent>}
            </Card>
          ))}
          {viewCust && !plans.isLoading && filteredPlans.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">ไม่พบบิลตามตัวกรอง</p>}
          {!viewCust && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">เลือกลูกค้าเพื่อแสดงรายการบิล</p>}
        </CardContent>
      </Card>

      {/* รับชำระเงิน (เงินสด/นอกสลิป) */}
      <Dialog open={!!payInst} onClose={() => setPayInst(null)} title={`รับชำระ — งวด ${payInst?.installment_no ?? ""}`} className="max-w-sm">
        <form onSubmit={(e) => { e.preventDefault(); const amt = Number((e.currentTarget.elements.namedItem("amount") as HTMLInputElement).value); pay.mutate({ id: payInst.id, amount: amt }, { onSuccess: () => setPayInst(null) }); }}>
          <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">ยอดที่รับ (บาท)</label>
          <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={remaining(payInst)} className="mt-1" autoFocus required />
          <p className="mt-2 text-xs text-muted-foreground">คงเหลือของงวดนี้: {remaining(payInst).toLocaleString("th-TH")} บาท · ลูกค้าที่ผูก LINE จะได้รับใบยืนยันอัตโนมัติ</p>
          <Button size="sm" type="submit" className="mt-3 w-full" disabled={pay.isPending}>บันทึกรับชำระ</Button>
        </form>
      </Dialog>

      {/* แก้ไขงวด */}
      <Dialog open={!!editInst} onClose={() => setEditInst(null)} title={`แก้ไขงวด ${editInst?.installment_no ?? ""}`} className="max-w-sm">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget.elements as any;
          editI.mutate({ id: editInst.id, data: { amount_due: Number(f.amount_due.value), due_date: f.due_date.value, status: f.status.value, penalty_amount: Number(f.penalty_amount.value || 0) } }, { onSuccess: () => setEditInst(null) });
        }}>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">ยอด (บาท)</label>
            <Input name="amount_due" type="number" step="0.01" defaultValue={editInst?.amount_due} className="mt-1" />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">ครบกำหนด</label>
            <Input name="due_date" type="date" defaultValue={editInst?.due_date} className="mt-1" />
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">สถานะ</label>
            <Select name="status" defaultValue={editInst?.status} className="mt-1">
              {["pending", "partial_paid", "overdue", "paid", "cancelled"].map((s) => <option key={s} value={s}>{statusTh(s)}</option>)}
            </Select>
          </div>
          <div>
            <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">ค่าปรับงวดนี้ (บาท)</label>
            <Input name="penalty_amount" type="number" min="0" step="0.01" defaultValue={editInst?.penalty_amount ?? 0} className="mt-1" />
          </div>
          <Button size="sm" type="submit" className="w-full" disabled={editI.isPending}>บันทึก</Button>
        </form>
      </Dialog>

      <Dialog open={!!penaltyPlan} onClose={() => setPenaltyPlan(null)} title={`ค่าปรับหัวบิล ${penaltyPlan?.bill_no ?? ""}`} className="max-w-sm">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const amount = Number((e.currentTarget.elements.namedItem("bill_penalty_amount") as HTMLInputElement).value || 0);
          editPlanPenalty.mutate({ id: penaltyPlan.id, amount }, { onSuccess: () => setPenaltyPlan(null) });
        }}>
          <p className="text-xs text-muted-foreground">ค่าปรับหัวบิลจะแสดงแยกจากยอดงวดหลักใน Preview และข้อความ LINE</p>
          <Input name="bill_penalty_amount" type="number" min="0" step="0.01" defaultValue={penaltyPlan?.penalty_amount ?? 0} autoFocus />
          <Button size="sm" type="submit" className="w-full" disabled={editPlanPenalty.isPending}>บันทึกค่าปรับ</Button>
        </form>
      </Dialog>

      {/* Preview is the exact text sent by the bill renderer. */}
      <Dialog open={!!previewBill} onClose={() => setPreviewBill(null)} title={`Preview Bill ${previewBill?.billNo ?? ""}`} className="max-w-xl">
        <p className="mb-3 text-xs text-muted-foreground">ตัวอย่างข้อความนี้ใช้ renderer เดียวกับข้อความที่จะส่งให้ลูกค้าทาง LINE</p>
        {preview.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลดตัวอย่างบิล…</p>}
        {preview.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">โหลด Preview ไม่สำเร็จ</p>}
        {preview.data?.text && (
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-4 py-3 font-sans text-[15px] leading-7 text-foreground">
            {preview.data.text}
          </pre>
        )}
      </Dialog>
    </>
  );
}
