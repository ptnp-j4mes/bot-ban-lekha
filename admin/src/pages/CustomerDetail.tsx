import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge, followUpBadge, FOLLOW_UP_STATUSES } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

const formObj = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
};

function FollowUpSection({ customerId, followUp, activities }: { customerId: string; followUp: any; activities: any[] }) {
  const add = useMut((b: any) => apiSend(`/api/customers/${customerId}/collection-activities`, "POST", b), {
    success: "บันทึกการติดตามแล้ว", invalidate: ["customer-detail"],
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const raw = formObj(e);
    const body: Record<string, string> = {};
    if (raw.status) body.status = raw.status;
    if (raw.note) body.note = raw.note;
    if (raw.promise_to_pay_date) body.promise_to_pay_date = raw.promise_to_pay_date;
    if (raw.next_follow_up_date) body.next_follow_up_date = raw.next_follow_up_date;
    if (!Object.keys(body).length) return;
    add.mutate(body);
    e.currentTarget.reset();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle className="text-base">การติดตามลูกหนี้</CardTitle>
        {followUp && followUpBadge(followUp.status)}
      </CardHeader>
      <CardContent className="space-y-4">
        {followUp && (
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-4">
            <div>นัดจ่าย: <span className="fig text-foreground">{followUp.promise_to_pay_date ?? "—"}</span></div>
            <div>ติดตามอีกครั้ง: <span className="fig text-foreground">{followUp.next_follow_up_date ?? "—"}</span></div>
          </div>
        )}

        <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
          <Field label="สถานะ">
            <Select name="status" defaultValue="">
              <option value="">— ไม่เปลี่ยนสถานะ —</option>
              {FOLLOW_UP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="วันที่นัดจ่าย"><Input type="date" name="promise_to_pay_date" /></Field>
          <Field label="ติดตามอีกครั้งวันที่"><Input type="date" name="next_follow_up_date" /></Field>
          <Field label="โน้ต" className="lg:col-span-4"><Input name="note" placeholder="บันทึกการติดตาม เช่น โทรแล้วไม่รับสาย" /></Field>
          <Button type="submit" disabled={add.isPending}>บันทึก</Button>
        </form>

        <div className="space-y-2">
          {(activities ?? []).map((a: any) => (
            <div key={a.id} className="rounded-lg border border-border p-2.5 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="fig">{a.created_at?.replace("T", " ").slice(0, 16)}</span>
                {a.status && followUpBadge(a.status)}
              </div>
              {a.note && <div className="mt-1">{a.note}</div>}
              {(a.promise_to_pay_date || a.next_follow_up_date) && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {a.promise_to_pay_date && <>นัดจ่าย {a.promise_to_pay_date} </>}
                  {a.next_follow_up_date && <>ติดตามอีกครั้ง {a.next_follow_up_date}</>}
                </div>
              )}
            </div>
          ))}
          {!activities?.length && <p className="text-sm text-muted-foreground">ยังไม่มีประวัติการติดตาม</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["customer-detail", id], queryFn: () => apiGet(`/api/customers/${id}/detail`) });
  const resend = useMut((mid: string) => apiSend(`/api/messages/${mid}/resend`, "POST"), { success: "ส่งซ้ำแล้ว", invalidate: ["customer-detail"] });
  const data = d.data;

  const instCols: Column<any>[] = [
    { key: "no", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig">{i.installment_no}</span> },
    { key: "due", header: "ครบกำหนด", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{i.due_date}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig">{i.amount_due}</span> },
    { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
  ];
  const payCols: Column<any>[] = [
    { key: "paid", header: "วันชำระ", sortValue: (p) => p.paid_at, cell: (p) => <span className="fig">{p.paid_at?.slice(0, 10) ?? "—"}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (p) => Number(p.amount), cell: (p) => <span className="fig">{p.amount}</span> },
    { key: "appr", header: "อนุมัติเมื่อ", sortValue: (p) => p.approved_at, cell: (p) => <span className="fig text-xs">{p.approved_at?.slice(0, 10)}</span> },
  ];
  const msgCols: Column<any>[] = [
    { key: "sent", header: "เวลา", sortValue: (m) => m.sent_at, cell: (m) => <span className="fig text-xs">{m.sent_at?.replace("T", " ").slice(0, 16)}</span> },
    { key: "type", header: "ประเภท", sortValue: (m) => m.message_type, cell: (m) => <span className="text-xs">{m.message_type}</span> },
    { key: "status", header: "สถานะ", sortValue: (m) => m.status, cell: (m) => <Badge variant={m.status === "sent" ? "success" : "destructive"}>{m.status}</Badge> },
    { key: "act", header: "", stop: true, cell: (m) => m.status === "failed" && <Button size="sm" variant="outline" onClick={() => resend.mutate(m.id)}>ส่งซ้ำ</Button> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl space-y-4 my-4" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <CardTitle>{data?.customer?.display_name || data?.customer?.customer_code || "ลูกค้า"}</CardTitle>
            {data?.customer && <Badge variant="secondary">{data.customer.status}</Badge>}
            <Button size="icon" variant="ghost" className="ml-auto" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>
          {data?.customer && (
            <CardContent className="text-sm text-muted-foreground">
              code {data.customer.customer_code} · {data.customer.phone || "ไม่มีเบอร์"} · LINE {data.customer.line_user_id ? "ผูกแล้ว" : "ยังไม่ผูก"}
            </CardContent>
          )}
        </Card>

        {data?.customer && (
          <FollowUpSection customerId={data.customer.id} followUp={data.follow_up} activities={data.collection_activities} />
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">บิล</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.bill_plans ?? []).map((p: any) => (
              <div key={p.id}>
                <div className="mb-1 text-sm font-medium flex items-center gap-2">บิล {p.bill_no} {statusBadge(p.status)}</div>
                <DataTable data={p.installments} columns={instCols} rowKey={(i) => i.id} initialSort={{ key: "no", dir: "asc" }} maxHeight="none" />
              </div>
            ))}
            {!data?.bill_plans?.length && <p className="text-sm text-muted-foreground">ไม่มีบิล</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ประวัติชำระ</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable data={data?.payments ?? []} columns={payCols} rowKey={(p) => p.id} initialSort={{ key: "paid", dir: "desc" }} maxHeight="none" empty="ยังไม่มีการชำระ" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ข้อความ LINE</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable data={data?.message_logs ?? []} columns={msgCols} rowKey={(m) => m.id} initialSort={{ key: "sent", dir: "desc" }} maxHeight="none" empty="ยังไม่มีข้อความ" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
