import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FIELDS = [
  { key: "text_help", label: "ข้อความทั่วไป / วิธีใช้งาน", hint: "ตอบเมื่อผู้ใช้ส่งข้อความทั่วไป" },
  { key: "customer_balance_empty", label: "ตอบยอด: ไม่มียอดค้าง", hint: "ตอบเมื่อไม่พบยอดค้างชำระ" },
  { key: "customer_balance_due", label: "ตอบยอด: มียอดค้าง", hint: "ตัวแปร: {outstanding}, {count}, {next_due}" },
  { key: "payment_received", label: "ได้รับสลิปแล้ว", hint: "สลิปจับคู่ได้และรอผลตรวจสอบ/อนุมัติ" },
  { key: "cash_bill_received", label: "ได้รับบิลเงินสด", hint: "บิลเงินสดจะรอแอดมินตรวจสอบเสมอ" },
  { key: "needs_admin_match", label: "จับคู่สลิปไม่ได้", hint: "ตัวอย่างเช่น ยอดหรือวันที่ไม่ตรงกับงวด" },
  { key: "payment_approved", label: "อนุมัติสลิปแล้ว", hint: "ตัวแปร: {bill_text} คือข้อความบิลล่าสุด" },
  { key: "payment_rejected", label: "ปฏิเสธสลิป", hint: "ตัวแปร: {reason} คือเหตุผลที่ปฏิเสธ" },
  { key: "duplicate_slip", label: "สลิปซ้ำ", hint: "เมื่อพบว่าสลิปนี้เคยส่งแล้ว" },
  { key: "unsupported_slip", label: "ไฟล์สลิปไม่รองรับ", hint: "เมื่อไฟล์ไม่ใช่รูปภาพที่ระบบอ่านได้" },
  { key: "rate_limited", label: "ส่งสลิปถี่เกินไป", hint: "เมื่อผู้ใช้ส่งสลิปเกิน rate limit" },
] as const;

export function MessageResponseSettings() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet("/api/settings") });
  const save = useMut((message_templates: Record<string, string>) => apiSend("/api/settings", "PATCH", { message_templates }), { success: "บันทึกข้อความตอบกลับแล้ว", invalidate: ["settings"] });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const templates = Object.fromEntries(FIELDS.map(({ key }) => [key, String(fd.get(key) ?? "")]));
    save.mutate(templates);
  };

  const d = settings.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>ตั้งค่าข้อความตอบกลับ LINE Messaging API</CardTitle>
        <p className="text-sm text-muted-foreground">ข้อความชุดนี้ใช้ตอบกลับลูกค้าขององค์กรนี้ผ่าน LINE OA ทุกข้อความที่เว้นว่างจะกลับไปใช้ค่าเริ่มต้นของระบบ</p>
      </CardHeader>
      <CardContent>
        {d && (
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {FIELDS.map(({ key, label, hint }) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                  <textarea
                    name={key}
                    defaultValue={d.message_templates?.[key] ?? ""}
                    rows={4}
                    maxLength={4000}
                    className="mt-1 flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/10"
                  />
                </label>
              ))}
            </div>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "กำลังบันทึก…" : "บันทึกข้อความตอบกลับ"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
