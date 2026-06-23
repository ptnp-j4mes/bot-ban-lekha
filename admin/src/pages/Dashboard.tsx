import { useQuery } from "@tanstack/react-query";
import { CalendarDays, AlertTriangle, Receipt, Send } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusBadge } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const custName = (i: any) =>
  i.bill_plan?.customer?.display_name || i.bill_plan?.customer?.customer_code || "-";

function InstTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>;
  return (
    <Table>
      <THead>
        <TR>
          <TH>ลูกค้า</TH><TH>บิล</TH><TH>งวด</TH><TH>due</TH><TH>ยอด</TH><TH>สถานะ</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((i) => (
          <TR key={i.id}>
            <TD>{custName(i)}</TD>
            <TD>บิล {i.bill_plan?.bill_no ?? "-"}</TD>
            <TD>งวด {i.installment_no}</TD>
            <TD>{i.due_date}</TD>
            <TD>{i.amount_due}</TD>
            <TD>{statusBadge(i.status)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function Stat({ icon: Icon, n, label }: { icon: any; n: number; label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
        <div>
          <div className="text-2xl font-bold">{n}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
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

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" disabled={remind.isPending}
          onClick={() => remind.mutate(undefined as any, { onSuccess: (r: any) => toast.message(`ส่ง ${r.sent}/${r.candidates} ราย`) })}>
          <Send className="h-3 w-3 mr-1" /> ส่งเตือนวันนี้
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={CalendarDays} n={due.data?.length ?? 0} label="ครบกำหนดวันนี้" />
        <Stat icon={AlertTriangle} n={over.data?.length ?? 0} label="ค้างชำระ" />
        <Stat icon={Receipt} n={pend.data?.total ?? 0} label="สลิปรอตรวจ" />
      </div>
      <Card>
        <CardHeader><CardTitle>ครบกำหนดวันนี้</CardTitle></CardHeader>
        <CardContent><InstTable rows={due.data ?? []} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>ค้างชำระ</CardTitle></CardHeader>
        <CardContent><InstTable rows={over.data ?? []} /></CardContent>
      </Card>
    </>
  );
}
