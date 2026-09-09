import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileImage, FileText, Save, Upload, X } from "lucide-react";
import { toast } from "react-toastify";
import { apiGet, apiRaw, apiSend, apiSendForm } from "@/lib/api";
import { useMut, statusBadge, statusTh } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/input";

const documentTypeLabels: Record<string, string> = {
  profile_photo: "รูปโปรไฟล์",
  identity: "บัตรประชาชน / เอกสารยืนยันตัวตน",
  address: "เอกสารที่อยู่",
  contract: "สัญญา / ใบข้อตกลง",
  payment_evidence: "หลักฐานการชำระเงิน",
  other: "เอกสารอื่นๆ",
};

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export function CustomerDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useQuery({ queryKey: ["customer-detail", id], queryFn: () => apiGet(`/api/customers/${id}/detail`) });
  const resend = useMut((mid: string) => apiSend(`/api/messages/${mid}/resend`, "POST"), { success: "ส่งซ้ำแล้ว", invalidate: ["customer-detail"] });
  const update = useMut((body: Record<string, unknown>) => apiSend(`/api/customers/${id}`, "PATCH", body), { success: "บันทึกข้อมูลลูกค้าแล้ว", invalidate: ["customer-detail", "customers"] });
  const upload = useMut((body: FormData) => apiSendForm(`/api/customers/${id}/documents`, "POST", body), { success: "เพิ่มเอกสารแล้ว", invalidate: ["customer-detail"] });
  const data = d.data;

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate(Object.fromEntries(new FormData(event.currentTarget).entries()));
  };

  const uploadDocument = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement)?.files?.[0];
    if (!file) {
      toast.error("กรุณาเลือกไฟล์เอกสาร");
      return;
    }
    upload.mutate(new FormData(form), { onSuccess: () => form.reset() });
  };

  const openDocument = async (document: any) => {
    try {
      const response = await apiRaw(`/api/customers/${id}/documents/${document.id}/file`);
      if (!response.ok) throw new Error("ไม่สามารถเปิดเอกสารได้");
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.download = document.original_file_name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      toast.error(error?.message || "ไม่สามารถเปิดเอกสารได้");
    }
  };

  const instCols: Column<any>[] = [
    { key: "no", header: "งวด", align: "right", sortValue: (i) => i.installment_no, cell: (i) => <span className="fig">{i.installment_no}</span> },
    { key: "due", header: "ครบกำหนด", sortValue: (i) => i.due_date, cell: (i) => <span className="fig">{thDate(i.due_date)}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (i) => Number(i.amount_due), cell: (i) => <span className="fig">{baht(i.amount_due)}</span> },
    { key: "status", header: "สถานะ", sortValue: (i) => i.status, cell: (i) => statusBadge(i.status) },
  ];
  const payCols: Column<any>[] = [
    { key: "paid", header: "วันชำระ", sortValue: (p) => p.paid_at, cell: (p) => <span className="fig">{thDate(p.paid_at)}</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (p) => Number(p.amount), cell: (p) => <span className="fig">{baht(p.amount)}</span> },
    { key: "appr", header: "อนุมัติเมื่อ", sortValue: (p) => p.approved_at, cell: (p) => <span className="fig text-xs">{thDate(p.approved_at)}</span> },
  ];
  const msgCols: Column<any>[] = [
    { key: "sent", header: "เวลา", sortValue: (m) => m.sent_at, cell: (m) => <span className="fig text-xs">{m.sent_at?.replace("T", " ").slice(0, 16)}</span> },
    { key: "type", header: "ประเภท", sortValue: (m) => m.message_type, cell: (m) => <span className="text-xs">{m.message_type}</span> },
    { key: "status", header: "สถานะ", sortValue: (m) => m.status, cell: (m) => <Badge variant={m.status === "sent" ? "success" : "destructive"}>{m.status === "sent" ? "ส่งแล้ว" : "ส่งไม่สำเร็จ"}</Badge> },
    { key: "act", header: "", stop: true, cell: (m) => m.status === "failed" && <Button size="sm" variant="outline" onClick={() => resend.mutate(m.id)}>ส่งซ้ำ</Button> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-0" onClick={onClose}>
      <div className="min-h-full w-full max-w-none space-y-4 bg-card p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="flex-row items-start gap-2">
            <div className="min-w-0">
              <CardTitle className="break-words">{data?.customer?.display_name || data?.customer?.customer_code || "ลูกค้า"}</CardTitle>
              {data?.customer && <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="fig">{data.customer.customer_code}</span><Badge variant={data.customer.status === "active" ? "success" : "secondary"}>{statusTh(data.customer.status)}</Badge></div>}
            </div>
            <Button size="icon" variant="ghost" className="ml-auto" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>
          {data?.customer && <CardContent className="pt-0"><form className="space-y-4" onSubmit={saveProfile}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="ชื่อ-นามสกุล"><Input name="display_name" defaultValue={data.customer.display_name ?? ""} /></Field>
              <Field label="เบอร์โทร"><Input name="phone" inputMode="tel" defaultValue={data.customer.phone ?? ""} /></Field>
              <Field label="อีเมล"><Input name="email" type="email" defaultValue={data.customer.email ?? ""} /></Field>
              <Field label="Facebook"><Input name="facebook_url" placeholder="ชื่อบัญชีหรือ URL Facebook" defaultValue={data.customer.facebook_url ?? ""} /></Field>
              <Field label="LINE"><Input value={data.customer.line_user_id ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"} readOnly className="bg-muted" /></Field>
              <Field label="สถานะ"><Select name="status" defaultValue={data.customer.status}>{["active", "blocked", "closed"].map((status) => <option key={status} value={status}>{statusTh(status)}</option>)}</Select></Field>
            </div>
            <Field label="ที่อยู่"><textarea name="address" defaultValue={data.customer.address ?? ""} rows={2} className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/10" /></Field>
            <Field label="ข้อมูลติดต่อเพิ่มเติม"><textarea name="contact_note" defaultValue={data.customer.contact_note ?? ""} rows={2} placeholder="เช่น ผู้ติดต่อสำรอง เวลาที่สะดวก หรือช่องทางติดต่ออื่น" className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/10" /></Field>
            <div className="flex justify-end"><Button type="submit" disabled={update.isPending}><Save className="h-4 w-4" />บันทึกข้อมูลส่วนตัว</Button></div>
          </form></CardContent>}
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">เอกสารและรูปหลักฐาน</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end" onSubmit={uploadDocument}>
              <Field label="ประเภทเอกสาร"><Select name="document_type" defaultValue="other"><option value="profile_photo">รูปโปรไฟล์</option><option value="identity">บัตรประชาชน / ยืนยันตัวตน</option><option value="address">เอกสารที่อยู่</option><option value="contract">สัญญา / ข้อตกลง</option><option value="payment_evidence">หลักฐานการชำระเงิน</option><option value="other">เอกสารอื่นๆ</option></Select></Field>
              <Field label="ชื่อเอกสาร"><Input name="title" placeholder="เช่น บัตรประชาชนด้านหน้า" /></Field>
              <Field label="ไฟล์ (ไม่เกิน 10 MB)"><Input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx" required className="h-auto py-2 file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold" /></Field>
              <Button type="submit" disabled={upload.isPending}><Upload className="h-4 w-4" />เพิ่มเอกสาร</Button>
            </form>
            <div className="divide-y divide-border rounded-xl border border-border">
              {(data?.documents ?? []).map((document: any) => {
                const isImage = document.mime_type?.startsWith("image/");
                return <div key={document.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">{isImage ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{document.title}</div><div className="truncate text-xs text-muted-foreground">{documentTypeLabels[document.document_type] ?? document.document_type} · {document.original_file_name} · {formatBytes(document.file_size)}</div></div>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openDocument(document)}><ExternalLink className="h-4 w-4" />เปิดดู / ดาวน์โหลด</Button>
                </div>;
              })}
              {!data?.documents?.length && <p className="p-4 text-sm text-muted-foreground">ยังไม่มีเอกสารของลูกค้ารายนี้</p>}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">ไฟล์จะถูกเก็บใน Storage ที่ตั้งค่าไว้ และการเปิดดูต้องผ่านสิทธิ์ขององค์กรนี้เท่านั้น</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">บิล</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data?.bill_plans ?? []).map((p: any) => (
              <div key={p.id}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">บิล {p.bill_no} {statusBadge(p.status)}</div>
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
