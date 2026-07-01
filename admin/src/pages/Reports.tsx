import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiRaw } from "@/lib/api";
import { statusBadge } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DataTable, type Column } from "@/components/ui/data-table";
import { KV } from "@/components/ui/dialog";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const ocust = (i: any) => i.bill_plan?.customer?.display_name || i.bill_plan?.customer?.customer_code || "—";

export function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const daily = useQuery({ queryKey: ["report-daily", day], queryFn: () => apiGet(`/api/reports/daily?date=${day}`) });
  const range = `${from ? `from=${from}` : ""}${to ? `&to=${to}` : ""}`;
  const summary = useQuery({ queryKey: ["report-summary", from, to], queryFn: () => apiGet(`/api/reports/summary?${range}`) });
  const overdue = useQuery({ queryKey: ["overdue"], queryFn: () => apiGet("/api/installments/overdue") });
  const byBank = useQuery({ queryKey: ["report-bank", from, to], queryFn: () => apiGet(`/api/reports/collections/bank?${range}`) });
  const bySender = useQuery({ queryKey: ["report-senders", from, to], queryFn: () => apiGet(`/api/reports/collections/senders?${range}`) });
  const aging = useQuery({ queryKey: ["report-aging"], queryFn: () => apiGet("/api/reports/aging") });
  const approvals = useQuery({ queryKey: ["report-approvals", from, to], queryFn: () => apiGet(`/api/reports/approvals?${range}`) });
  const unmatched = useQuery({ queryKey: ["report-unmatched", from, to], queryFn: () => apiGet(`/api/reports/unmatched?${range}`) });

  const download = async (path: string, filename: string) => {
    const res = await apiRaw(path);
    if (!res.ok) return toast.error("ดาวน์โหลดไม่สำเร็จ");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const s = summary.data;
  const stat = (label: string, val: string) => (
    <Card><CardContent className="p-4"><div className="text-2xl font-bold">{val}</div><div className="text-sm text-muted-foreground">{label}</div></CardContent></Card>
  );
  const exportButton = (label: string, path: string, filename: string) => (
    <Button size="sm" variant="outline" onClick={() => download(path, filename)}><Download className="h-3 w-3 mr-1" /> {label}</Button>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>รายงาน</CardTitle>
          <div className="ml-auto flex items-end gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="pb-2">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Button size="sm" onClick={() => download(`/api/reports/payments.csv?${range}`, "payments.csv")}><Download className="h-3 w-3 mr-1" /> CSV การชำระ</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stat("ยอดเก็บได้ (บาท)", fmt(s?.collected ?? 0))}
            {stat("จำนวนรายการชำระ", String(s?.payment_count ?? 0))}
            {stat("สลิปรอตรวจ", String(s?.pending_count ?? 0))}
            {stat("งวดค้างชำระ", String(s?.overdue_count ?? 0))}
            {stat("ยอดค้างชำระ (บาท)", fmt(s?.overdue_amount ?? 0))}
            {stat("ลูกค้าทั้งหมด", String(s?.customers ?? 0))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>รายงานรายวัน — ต่อกลุ่ม LINE</CardTitle>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="ml-auto w-40" />
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>กลุ่ม</TH><TH>รับสลิป</TH><TH>อนุมัติ</TH><TH>รอตรวจ</TH><TH>ต้องแอดมิน</TH><TH>ปฏิเสธ</TH><TH>ยอดอนุมัติ</TH></TR></THead>
            <TBody>
              {(daily.data?.groups ?? []).map((g: any) => (
                <TR key={g.line_group_id}>
                  <TD>{g.name}</TD><TD>{g.received}</TD><TD>{g.approved}</TD><TD>{g.pending}</TD><TD>{g.needs_admin}</TD><TD>{g.rejected}</TD><TD>{fmt(g.amount)}</TD>
                </TR>
              ))}
              {daily.data?.combined && (
                <TR className="font-semibold">
                  <TD>รวมทุกกลุ่ม</TD>
                  <TD>{daily.data.combined.received}</TD><TD>{daily.data.combined.approved}</TD><TD>{daily.data.combined.pending}</TD>
                  <TD>{daily.data.combined.needs_admin}</TD><TD>{daily.data.combined.rejected}</TD><TD>{fmt(daily.data.combined.amount)}</TD>
                </TR>
              )}
            </TBody>
          </Table>
          {!daily.data?.groups?.length && <p className="text-sm text-muted-foreground mt-2">วันนี้ยังไม่มีสลิปจากกลุ่ม</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>สรุปยอดรับตามบัญชีธนาคาร</CardTitle>
          <div className="ml-auto">{exportButton("CSV", `/api/reports/collections/bank.csv?${range}`, "collections-by-bank.csv")}</div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>ธนาคาร</TH><TH>เลขบัญชี</TH><TH>ชื่อบัญชี</TH><TH>จำนวนรายการ</TH><TH>ยอดรวม</TH></TR></THead>
            <TBody>
              {(byBank.data?.rows ?? []).map((r: any, i: number) => (
                <TR key={r.bank_account_id ?? i}>
                  <TD>{r.bank_name}</TD><TD>{r.account_no}</TD><TD>{r.account_name}</TD><TD>{r.count}</TD><TD>{fmt(r.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!byBank.data?.rows?.length && <p className="text-sm text-muted-foreground mt-2">ไม่มีรายการรับเงินในช่วงนี้</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>สรุปยอดรับตามกลุ่ม LINE / ผู้ส่ง</CardTitle>
          <div className="ml-auto">{exportButton("CSV", `/api/reports/collections/senders.csv?${range}`, "collections-by-sender.csv")}</div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>กลุ่ม</TH><TH>ผู้ส่งสลิป</TH><TH>จำนวนรายการ</TH><TH>ยอดรวม</TH></TR></THead>
            <TBody>
              {(bySender.data?.rows ?? []).map((r: any, i: number) => (
                <TR key={i}>
                  <TD>{r.group_name ?? "—"}</TD><TD>{r.sender_name}</TD><TD>{r.count}</TD><TD>{fmt(r.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!bySender.data?.rows?.length && <p className="text-sm text-muted-foreground mt-2">ไม่มีรายการรับเงินในช่วงนี้</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>รายงานอายุหนี้ (Aging)</CardTitle>
          <div className="ml-auto">{exportButton("CSV", "/api/reports/aging.csv", "aging.csv")}</div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {stat("1-7 วัน (บาท)", fmt(aging.data?.buckets?.["1-7"]?.amount ?? 0))}
            {stat("8-30 วัน (บาท)", fmt(aging.data?.buckets?.["8-30"]?.amount ?? 0))}
            {stat("31+ วัน (บาท)", fmt(aging.data?.buckets?.["31+"]?.amount ?? 0))}
          </div>
          <Table>
            <THead><TR><TH>ลูกค้า</TH><TH>บิล</TH><TH>งวด</TH><TH>ครบกำหนด</TH><TH>เกินกำหนด (วัน)</TH><TH>ค้างชำระ</TH></TR></THead>
            <TBody>
              {(aging.data?.rows ?? []).map((r: any) => (
                <TR key={`${r.customer_id}-${r.bill_no}-${r.installment_no}`}>
                  <TD>{r.customer_name || r.customer_code}</TD><TD>บิล {r.bill_no}</TD><TD>{r.installment_no}</TD>
                  <TD>{r.due_date}</TD><TD>{r.days_overdue}</TD><TD>{fmt(r.outstanding)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!aging.data?.rows?.length && <p className="text-sm text-muted-foreground mt-2">ไม่มีลูกหนี้ค้างชำระ</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>รายงานอนุมัติการชำระ</CardTitle>
          <div className="ml-auto">{exportButton("CSV", `/api/reports/approvals.csv?${range}`, "approvals.csv")}</div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {stat("จำนวนรายการที่อนุมัติ", String(approvals.data?.count ?? 0))}
            {stat("ยอดอนุมัติรวม (บาท)", fmt(approvals.data?.total ?? 0))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>รายงานสลิปที่ยังไม่จับคู่</CardTitle>
          <div className="ml-auto">{exportButton("CSV", `/api/reports/unmatched.csv?${range}`, "unmatched.csv")}</div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {stat("จำนวนสลิป", String(unmatched.data?.count ?? 0))}
            {stat("ยอดตาม OCR (ยังไม่อนุมัติ, บาท)", fmt(unmatched.data?.total_parsed_amount ?? 0))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ค้างชำระ ({overdue.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={overdue.data ?? []}
            columns={[
              { key: "cust", header: "ลูกค้า", sortValue: ocust, cell: ocust },
              { key: "bill", header: "บิล", sortValue: (i) => i.bill_plan?.bill_no, cell: (i) => <span className="fig">บิล {i.bill_plan?.bill_no}</span> },
              { key: "inst", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig">{i.installment_no}</span> },
              { key: "due", header: "due", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{i.due_date}</span> },
              { key: "amt", header: "ยอด", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig">{fmt(Number(i.amount_due))}</span> },
              { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
            ] as Column<any>[]}
            rowKey={(i) => i.id}
            initialSort={{ key: "due", dir: "asc" }}
            empty="ไม่มีงวดค้างชำระ"
            detailTitle="งวดค้างชำระ"
            detail={(i) => ({ body: <KV pairs={[["ลูกค้า", ocust(i)], ["บิล", i.bill_plan?.bill_no], ["งวด", i.installment_no], ["ครบกำหนด", i.due_date], ["ยอด", fmt(Number(i.amount_due))], ["สถานะ", statusBadge(i.status)]]} /> })}
          />
        </CardContent>
      </Card>
    </>
  );
}
