import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["customer-detail", id], queryFn: () => apiGet(`/api/customers/${id}/detail`) });
  const resend = useMut((mid: string) => apiSend(`/api/messages/${mid}/resend`, "POST"), { success: "ส่งซ้ำแล้ว", invalidate: ["customer-detail"] });
  const data = d.data;

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
                <div className="text-sm font-medium flex items-center gap-2">บิล {p.bill_no} {statusBadge(p.status)}</div>
                <Table>
                  <TBody>
                    {p.installments.map((i: any) => (
                      <TR key={i.id}><TD className="w-10">{i.installment_no}</TD><TD>{i.due_date}</TD><TD>{i.amount_due}</TD><TD>{statusBadge(i.status)}</TD></TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ))}
            {!data?.bill_plans?.length && <p className="text-sm text-muted-foreground">ไม่มีบิล</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ประวัติชำระ</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>วันชำระ</TH><TH>ยอด</TH><TH>อนุมัติเมื่อ</TH></TR></THead>
              <TBody>
                {(data?.payments ?? []).map((p: any) => (
                  <TR key={p.id}><TD>{p.paid_at?.slice(0, 10) ?? "—"}</TD><TD>{p.amount}</TD><TD className="text-xs">{p.approved_at?.slice(0, 10)}</TD></TR>
                ))}
              </TBody>
            </Table>
            {!data?.payments?.length && <p className="text-sm text-muted-foreground">ยังไม่มีการชำระ</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ข้อความ LINE</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>เวลา</TH><TH>ประเภท</TH><TH>สถานะ</TH><TH></TH></TR></THead>
              <TBody>
                {(data?.message_logs ?? []).map((m: any) => (
                  <TR key={m.id}>
                    <TD className="text-xs">{m.sent_at?.replace("T", " ").slice(0, 16)}</TD>
                    <TD className="text-xs">{m.message_type}</TD>
                    <TD><Badge variant={m.status === "sent" ? "success" : "destructive"}>{m.status}</Badge></TD>
                    <TD>{m.status === "failed" && <Button size="sm" variant="outline" onClick={() => resend.mutate(m.id)}>ส่งซ้ำ</Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {!data?.message_logs?.length && <p className="text-sm text-muted-foreground">ยังไม่มีข้อความ</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
