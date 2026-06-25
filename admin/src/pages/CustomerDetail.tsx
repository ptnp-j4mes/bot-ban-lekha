import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

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
