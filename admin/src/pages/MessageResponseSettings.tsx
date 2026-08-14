import { useEffect, useState } from "react";
import { Plus, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";

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

type CustomMessage = { id: string; name: string; trigger: string; text: string; enabled: boolean };
type CustomDraft = Omit<CustomMessage, "id">;

const TEXTAREA_CLASS = "mt-2 flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/10";
const emptyCustom = (): CustomDraft => ({ name: "", trigger: "", text: "", enabled: true });

export function MessageResponseSettings() {
  const confirm = useConfirm();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet("/api/settings") });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [customMessages, setCustomMessages] = useState<CustomMessage[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(emptyCustom);

  useEffect(() => {
    const data: any = settings.data;
    if (!data) return;
    setDrafts(Object.fromEntries(FIELDS.map(({ key }) => [key, data.message_templates?.[key] ?? ""])));
    setCustomMessages(Array.isArray(data.message_templates?.custom_messages) ? data.message_templates.custom_messages : []);
  }, [settings.data]);

  const save = useMut((payload: { templates: Record<string, string>; customMessages: CustomMessage[] }) =>
    apiSend("/api/settings", "PATCH", { message_templates: { ...payload.templates, custom_messages: payload.customMessages } }),
  { success: "บันทึกข้อความตอบกลับแล้ว", invalidate: ["settings"] });

  const persist = (templates = drafts, custom = customMessages) => save.mutate({ templates, customMessages: custom });
  const resetBuiltIn = (key: string) => persist({ ...drafts, [key]: "" });

  const openCustom = (message?: CustomMessage) => {
    setEditingId(message?.id ?? null);
    setCustomDraft(message ? { name: message.name, trigger: message.trigger, text: message.text, enabled: message.enabled } : emptyCustom());
    setCustomOpen(true);
  };

  const submitCustom = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nextMessage: CustomMessage = {
      id: editingId ?? crypto.randomUUID(),
      name: customDraft.name.trim(),
      trigger: customDraft.trigger.trim(),
      text: customDraft.text,
      enabled: customDraft.enabled,
    };
    if (!nextMessage.name || !nextMessage.trigger || !nextMessage.text.trim()) return;
    const next = editingId ? customMessages.map((m) => m.id === editingId ? nextMessage : m) : [...customMessages, nextMessage];
    save.mutate({ templates: drafts, customMessages: next }, { onSuccess: () => setCustomOpen(false) });
  };

  const removeCustom = async (message: CustomMessage) => {
    if (!await confirm({ title: "ลบข้อความกำหนดเอง", message: `ลบ “${message.name}” หรือไม่?`, confirmLabel: "ลบข้อความ", destructive: true })) return;
    persist(drafts, customMessages.filter((m) => m.id !== message.id));
  };

  const toggleCustom = (message: CustomMessage) =>
    persist(drafts, customMessages.map((m) => m.id === message.id ? { ...m, enabled: !m.enabled } : m));

  if (settings.isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลดการตั้งค่าข้อความ…</p>;
  if (settings.isError) return <p className="rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-sm text-danger-text">โหลดการตั้งค่าข้อความไม่สำเร็จ</p>;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>ตั้งค่าข้อความตอบกลับ LINE Messaging API</CardTitle>
          <p className="basis-full text-sm text-muted-foreground">แก้ไขข้อความมาตรฐานขององค์กรนี้ได้ทีละรายการ ช่องที่ล้างข้อความจะกลับไปใช้ค่าเริ่มต้นของระบบ</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {FIELDS.map(({ key, label, hint }) => (
            <Card key={key} className="border border-border bg-background/30 shadow-none">
              <CardHeader className="items-start px-4 pt-3 pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                </div>
                <Badge variant="secondary">ระบบ</Badge>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <textarea value={drafts[key] ?? ""} onChange={(e) => setDrafts((current) => ({ ...current, [key]: e.target.value }))} rows={4} maxLength={4000} className={TEXTAREA_CLASS} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{(drafts[key] ?? "").length}/4000</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => resetBuiltIn(key)} disabled={save.isPending}><RotateCcw className="h-3.5 w-3.5" /> ใช้ค่าเริ่มต้น</Button>
                    <Button type="button" size="sm" onClick={() => persist()} disabled={save.isPending}>บันทึกแก้ไข</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="items-start sm:items-center">
          <div className="min-w-0">
            <CardTitle>ข้อความกำหนดเอง</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">เพิ่มข้อความตาม keyword ที่ผู้ใช้พิมพ์เข้ามา ระบบจะตรวจตามลำดับรายการ</p>
          </div>
          <Button type="button" size="sm" className="ml-0 w-full sm:ml-auto sm:w-auto" onClick={() => openCustom()}><Plus className="h-3.5 w-3.5" /> เพิ่มข้อความ</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!customMessages.length && <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อความกำหนดเอง</p>}
          {customMessages.map((message) => (
            <div key={message.id} className="rounded-xl border border-border bg-background/30 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{message.name}</h3><Badge variant={message.enabled ? "success" : "secondary"}>{message.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">เมื่อพบ keyword: <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">{message.trigger}</code></p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => toggleCustom(message)}>{message.enabled ? "ปิด" : "เปิด"}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => openCustom(message)}><Pencil className="h-3.5 w-3.5" /> แก้ไข</Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void removeCustom(message)}><Trash2 className="h-3.5 w-3.5" /> ลบ</Button>
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 font-sans text-sm leading-6 text-foreground">{message.text}</pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Guide: Message text ของ LINE</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">ตัวแปรต้องเขียนด้วยวงเล็บปีกกา เช่น <code className="rounded bg-secondary px-1.5 py-0.5 text-foreground">&#123;count&#125;</code> ระบบจะเติมค่าจริงก่อนส่งข้อความไป LINE</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {FIELDS.map(({ key, label, hint }) => (
              <div key={key} className="rounded-lg border border-border px-3 py-2"><div className="font-medium">{label}</div><div className="mt-1 text-xs text-muted-foreground"><code>{key}</code> · {hint}</div></div>
            ))}
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="font-medium">ตัวแปรที่ใช้ได้</div>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li><code className="text-foreground">&#123;outstanding&#125;</code> ยอดค้างชำระรวม</li>
              <li><code className="text-foreground">&#123;count&#125;</code> จำนวนงวดที่ค้าง</li>
              <li><code className="text-foreground">&#123;next_due&#125;</code> วันครบกำหนดงวดถัดไป</li>
              <li><code className="text-foreground">&#123;bill_text&#125;</code> ข้อความบิลล่าสุดหลังอนุมัติ</li>
              <li><code className="text-foreground">&#123;reason&#125;</code> เหตุผลที่ปฏิเสธสลิป</li>
              <li><code className="text-foreground">&#123;customer_name&#125;</code> ชื่อลูกค้าในข้อความกำหนดเอง</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-background/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground"><Search className="h-3.5 w-3.5" />ข้อความกำหนดเองทำงานอย่างไร</div>
            <p className="mt-1">เมื่อผู้ใช้ส่งข้อความ ระบบจะตรวจว่า text มี keyword ที่ตั้งไว้หรือไม่ แบบไม่แยกตัวพิมพ์เล็ก/ใหญ่ รายการที่อยู่ด้านบนจะถูกเลือกก่อน ถ้าไม่ตรงจึงกลับไปใช้ข้อความมาตรฐาน เช่น “ยอด” จะไปใช้ข้อความเช็คยอดตามระบบเดิม</p>
            <p className="mt-1">ข้อความกำหนดเองรองรับเฉพาะการตอบกลับข้อความตัวอักษร 1:1 ไม่ทำงานในกลุ่ม LINE และไม่แทนที่ข้อความแจ้งสลิป/อนุมัติ/ปฏิเสธ</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} title={editingId ? "แก้ไขข้อความกำหนดเอง" : "เพิ่มข้อความกำหนดเอง"} className="max-w-xl">
        <form className="space-y-4" onSubmit={submitCustom}>
          <Field label="ชื่อข้อความ"><Input value={customDraft.name} onChange={(e) => setCustomDraft((d) => ({ ...d, name: e.target.value }))} placeholder="เช่น แจ้งเวลาทำการ" maxLength={120} required /></Field>
          <Field label="Keyword ที่ใช้เรียก"><Input value={customDraft.trigger} onChange={(e) => setCustomDraft((d) => ({ ...d, trigger: e.target.value }))} placeholder="เช่น เวลาทำการ" maxLength={120} required /></Field>
          <Field label="ข้อความตอบกลับ"><textarea value={customDraft.text} onChange={(e) => setCustomDraft((d) => ({ ...d, text: e.target.value }))} rows={7} maxLength={4000} className={TEXTAREA_CLASS.replace("mt-2", "mt-1")} placeholder="ข้อความที่จะส่งกลับทาง LINE" required /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customDraft.enabled} onChange={(e) => setCustomDraft((d) => ({ ...d, enabled: e.target.checked }))} /> เปิดใช้งานทันที</label>
          <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "กำลังบันทึก…" : "บันทึกข้อความ"}</Button>
        </form>
      </Dialog>
    </div>
  );
}
