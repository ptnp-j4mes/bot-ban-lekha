import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function BillPlans() {
  const custs = useQuery({ queryKey: ["customers"], queryFn: () => apiGet("/api/customers?limit=200") });
  const banks = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const [viewCust, setViewCust] = useState("");
  const [mode, setMode] = useState<"interval" | "custom">("interval");
  const [rows, setRows] = useState([{ due_date: "", amount_due: "" }]);

  const plans = useQuery({ queryKey: ["bill-plans", viewCust], queryFn: () => apiGet(`/api/customers/${viewCust}/bill-plans`), enabled: !!viewCust });
  const create = useMut((b: any) => apiSend("/api/bill-plans", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const createCustom = useMut((b: any) => apiSend("/api/bill-plans/custom-dates", "POST", b), { success: "สร้างบิลแล้ว", invalidate: ["bill-plans"] });
  const cancel = useMut((id: string) => apiSend(`/api/bill-plans/${id}/cancel`, "PATCH"), { success: "ยกเลิกบิลแล้ว", invalidate: ["bill-plans"] });

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
            <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" onSubmit={submitInterval}>
              <Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select>
              <Input name="bill_no" type="number" placeholder="bill_no" required />
              <Input name="principal_amount" type="number" placeholder="ต้น" required />
              <Input name="installment_amount" type="number" placeholder="ส่งงวดละ" required />
              <Input name="cycle_days" type="number" placeholder="ทุกกี่วัน" required />
              <Input name="total_installments" type="number" placeholder="กี่งวด" required />
              <Input name="start_date" type="date" required />
              {bankSelect}
              <Input name="note" placeholder="note" className="sm:col-span-2 lg:col-span-3" />
              <Button size="sm" type="submit">สร้างบิล</Button>
            </form>
          ) : (
            <form className="space-y-2" onSubmit={submitCustom}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <Select name="customer_id" required defaultValue=""><option value="" disabled>— เลือกลูกค้า —</option>{custOptions}</Select>
                <Input name="bill_no" type="number" placeholder="bill_no" required />
                <Input name="principal_amount" type="number" placeholder="ต้น" required />
                {bankSelect}
                <Input name="note" placeholder="note" className="sm:col-span-2 lg:col-span-4" />
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
                  <Button size="sm" variant="destructive" className="ml-auto" onClick={() => { if (confirm("ยกเลิกบิลนี้? งวดที่ยังไม่จ่ายจะถูกยกเลิก")) cancel.mutate(p.id); }}>ยกเลิกบิล</Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <THead><TR><TH>งวด</TH><TH>due</TH><TH>ยอด</TH><TH>จ่าย</TH><TH>สถานะ</TH></TR></THead>
                  <TBody>
                    {p.installments.map((i: any) => (
                      <TR key={i.id}><TD>{i.installment_no}</TD><TD>{i.due_date}</TD><TD>{i.amount_due}</TD><TD>{i.amount_paid}</TD><TD>{statusBadge(i.status)}</TD></TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
