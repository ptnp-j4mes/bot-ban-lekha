import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Settings() {
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet("/api/settings") });
  const save = useMut((b: any) => apiSend("/api/settings", "PATCH", b), { success: "บันทึกแล้ว", invalidate: ["settings"] });
  const changePw = useMut((b: any) => apiSend("/api/auth/change-password", "POST", b), { success: "เปลี่ยนรหัสแล้ว" });

  const saveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const retention = fd.get("slip_retention_days");
    save.mutate({
      name: fd.get("name"), timezone: fd.get("timezone"), bill_footer: fd.get("bill_footer"),
      reminder_hour: Number(fd.get("reminder_hour")), deadline_hour: Number(fd.get("deadline_hour")),
      reminder_text: fd.get("reminder_text"),
      slip_retention_days: retention === "" ? null : Number(retention),
      auto_approve_enabled: fd.get("auto_approve") === "on",
    });
  };
  const submitPw = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    changePw.mutate({ current_password: fd.get("current_password") || undefined, new_password: fd.get("new_password") });
    e.currentTarget.reset();
  };

  const d = s.data;
  return (
    <>
      <Card>
        <CardHeader><CardTitle>ตั้งค่าองค์กร</CardTitle></CardHeader>
        <CardContent>
          {d && (
            <form className="space-y-3 max-w-xl" onSubmit={saveSettings}>
              <div>
                <label className="text-sm text-muted-foreground">ชื่อองค์กร</label>
                <Input name="name" defaultValue={d.name} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Timezone</label>
                <Input name="timezone" defaultValue={d.timezone} placeholder="Asia/Bangkok" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">ข้อความท้ายบิล (footer / เงื่อนไขค่าปรับ)</label>
                <textarea name="bill_footer" defaultValue={d.bill_footer ?? ""} rows={3}
                  className="flex w-full rounded-md border-0 px-3.5 py-2 text-sm neu-inset focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="ปล่อยว่าง = ใช้ข้อความเริ่มต้นของระบบ" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">เวลาส่งเตือน (เช้า)</label>
                  <Select name="reminder_hour" defaultValue={String(d.reminder_hour ?? 9)} className="mt-1">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 น.</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">เวลาเตือนก่อนหมดเขต</label>
                  <Select name="deadline_hour" defaultValue={String(d.deadline_hour ?? 15)} className="mt-1">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 น.</option>)}
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">ข้อความเตือน (ปล่อยว่าง = ใช้ข้อความมาตรฐาน)</label>
                <textarea name="reminder_text" defaultValue={d.reminder_text ?? ""} rows={3}
                  className="flex w-full rounded-md border-0 px-3.5 py-2 text-sm neu-inset focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="เช่น วันนี้ครบกำหนดชำระค่ะ 🙏 ส่งสลิปกลับมาได้เลยนะคะ" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">เก็บรูปสลิปกี่วัน (0 = ลบทันทีหลัง OCR, ปล่อยว่าง = ใช้ค่าเริ่มต้นของระบบ)</label>
                <Input name="slip_retention_days" type="number" min={0} defaultValue={d.slip_retention_days ?? ""} placeholder="ค่าเริ่มต้นของระบบ" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="auto_approve" defaultChecked={d.auto_approve_enabled} className="mt-0.5" />
                <span>
                  อนุมัติสลิปอัตโนมัติเมื่อระบบจับคู่ได้แน่นอน
                  <span className="block text-xs text-muted-foreground">เฉพาะสลิปโอนที่ยอดและวันที่ตรงกับงวด — บิลเงินสดยังรอแอดมินตรวจเสมอ</span>
                </span>
              </label>
              <Button size="sm" type="submit">บันทึก</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>เปลี่ยนรหัสผ่านของฉัน</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2 items-end" onSubmit={submitPw}>
            <Input name="current_password" type="password" placeholder="รหัสปัจจุบัน" className="w-44" />
            <Input name="new_password" type="password" placeholder="รหัสใหม่ (≥6)" className="w-44" required minLength={6} />
            <Button size="sm" type="submit">เปลี่ยนรหัส</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
