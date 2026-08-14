import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge, statusTh } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";

export function BillPlans() {
  const custs = useQuery({ queryKey: ["customers"], queryFn: () => apiGet("/api/customers?limit=200") });
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const [viewCust, setViewCust] = useState("");
  const [mode, setMode] = useState<"interval" | "custom">("interval");
  const [rows, setRows] = useState([{ due_date: "", amount_due: "" }]);

  const [payInst, setPayInst] = useState<any>(null);
  const [editInst, setEditInst] = useState<any>(null);

  const plans = useQuery({ queryKey: ["bill-plans", viewCust], queryFn: () => apiGet(`/api/customers/${viewCust}/bill-plans`), enabled: !!viewCust });
  const create = useMut((b: any) => apiSend("/api/bill-plans", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const createCustom = useMut((b: any) => apiSend("/api/bill-plans/custom-dates", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const cancel = useMut((id: string) => apiSend(`/api/bill-plans/${id}/cancel`, "PATCH"), { success: "ยกเลิกบิลแล้ว", invalidate: ["bill-plans"] });
  const sendBill = useMut((id: string) => apiSend(`/api/bill-plans/${id}/send`, "POST"), { success: "ส่งบิลให้ลูกค้าแล้ว" });
  const inv = ["bill-plans", "due-today", "overdue"];
  const pay = useMut((b: { id: string; amount: number }) => apiSend(`/api/installments/${b.id}/pay`, "POST", { amount: b.amount }), { success: "บันทึกรับชำระแล้ว", invalidate: inv });
  const editI = useMut((b: { id: string; data: any }) => apiSend(`/api/installments/${b.id}`, "PATCH", b.data), { success: "แก้งวดแล้ว", invalidate: inv });

  const remaining = (i: any) => Number(i?.amount_due ?? 0) - Number(i?.amount_paid ?? 0);

  const instCols: Column<any>[] = [
    { key: "no", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig">{i.installment_no}</span> },
    { key: "due", header: "ครบกำหนด", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{thDate(i.due_date)}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig">{baht(i.amount_due)}</span> },
    { key: "paid", header: "จ่าย", align: "right", sortValue: (i) => Number(i.amount_paid), cell: (i) => <span className="fig">{baht(i.amount_paid)}</span> },
    { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
    { key: "act", header: "", stop: true, cell: (i) => (i.status === "paid" || i.status === "cancelled") ? null : (
      <div className="flex justify-end gap-1">
        <Button size="sm" onClick={() => setPayInst(i)}>รับชำระ</Button>
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
    create.mutate({
      customer_id: fd.get("customer_id"), bill_no: num("bill_no"), principal_amount: num("principal_amount"),
      installment_amount: num("installment_amount"), cycle_type: "interval_days", cycle_days: num("cycle_days"),
      total_installments: num("total_installments"), start_date: fd.get("start_date"),
      bank_account_id: fd.get("bank_account_id") || undefined, note: fd.get("note") || undefined,
    });
  };
  const submitCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const installments = rows.filter((r) => r.due_date && r.amount_due).map((r, i) => ({ installment_no: i + 1, due_date: r.due_date, amount_due: Number(r.amount_due) }));
    if (!installments.length) return;
    createCustom.mutate({
      customer_id: fd.get("customer_id"), bill_no: Number(fd.get("bill_no")), principal_amount: Number(fd.get("principal_amount")),
      cycle_type: "custom_dates", bank_account_id: fd.get("bank_account_id") || undefined, note: fd.get("note") || undefined, installments,
    });
    setRows([{ due_date: "", amount_due: "" }]);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>สร้างบิล</CardTitle>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant={mode === "interval" ? "default" : "outline"} onClick={() => setMode("interval")}>ทุก X วัน</Button>
            <Button size="sm" variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>กำหนดวันเอง</Button>
          </div>
        </CardHeader>
        <CardContent>
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
              <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-3"><Input name="note" /></Field>
              <Button type="submit">สร้างบิล</Button>
            </form>
          ) : (
            <form className="space-y-2" onSubmit={submitCustom}>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="ลูกค้า"><Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select></Field>
                <Field label="Bill No."><Input name="bill_no" type="number" required /></Field>
                <Field label="เงินต้น"><Input name="principal_amount" type="number" required /></Field>
                <Field label="บัญชีรับโอน">{bankSelect}</Field>
                <Field label="หมายเหตุ" className="sm:col-span-2 lg:col-span-4"><Input name="note" /></Field>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">งวด (วันครบกำหนด + ยอด)</div>
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-6 text-sm text-muted-foreground">{i + 1}</span>
                    <Input type="date" value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} className="w-44" />
                    <Input type="number" placeholder="ยอด" value={r.amount_due} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount_due: e.target.value } : x))} className="w-32" />
                    {rows.length > 1 && <Button size="icon" variant="ghost" type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" type="button" onClick={() => setRows([...rows, { due_date: "", amount_due: "" }])}><Plus className="h-3 w-3 mr-1" /> เพิ่มงวด</Button>
              </div>
              <Button size="sm" type="submit">สร้างบิล</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ดูบิลของลูกค้า</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={viewCust} onChange={(e) => setViewCust(e.target.value)} className="w-72"><option value="">— เลือกลูกค้า —</option>{custOptions}</Select>
          {(plans.data ?? []).map((p: any) => (
            <Card key={p.id}>
              <CardHeader className="py-2 flex-row items-center gap-2">
                <CardTitle className="text-base">บิล {p.bill_no}</CardTitle>
                {statusBadge(p.status)}
                {p.status === "active" && (
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => sendBill.mutate(p.id)}>ส่งบิล</Button>
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm("ยกเลิกบิลนี้? งวดที่ยังไม่จ่ายจะถูกยกเลิก")) cancel.mutate(p.id); }}>ยกเลิกบิล</Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <DataTable data={p.installments} columns={instCols} rowKey={(i) => i.id} initialSort={{ key: "no", dir: "asc" }} maxHeight="none" empty="ไม่มีงวด" />
              </CardContent>
            </Card>
          ))}
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
          editI.mutate({ id: editInst.id, data: { amount_due: Number(f.amount_due.value), due_date: f.due_date.value, status: f.status.value } }, { onSuccess: () => setEditInst(null) });
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
          <Button size="sm" type="submit" className="w-full" disabled={editI.isPending}>บันทึก</Button>
        </form>
      </Dialog>
    </>
  );
}
