import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, Eye, EyeOff, GripVertical, Plus, X } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth, type MenuGroup } from "@/lib/auth";
import { MENU, DEFAULT_GROUPS } from "@/App";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const label = (id: string) => MENU.find((m) => m.id === id)?.label ?? id;

// Seed editable groups: saved prefs or the defaults, with any missing menu ids appended to the last group.
function seedGroups(saved?: MenuGroup[]): MenuGroup[] {
  const base = (saved?.length ? saved : DEFAULT_GROUPS).map((g) => ({ label: g.label, items: g.items.filter((id) => MENU.some((m) => m.id === id)) }));
  const placed = new Set(base.flatMap((g) => g.items));
  const missing = MENU.filter((m) => !placed.has(m.id)).map((m) => m.id);
  if (missing.length) (base[base.length - 1] ??= { label: "อื่นๆ", items: [] }).items.push(...missing);
  return base;
}

function MenuManager() {
  const { menuPrefs } = useAuth();
  const [groups, setGroups] = useState<MenuGroup[]>(() => seedGroups(menuPrefs?.groups));
  const [hidden, setHidden] = useState<Set<string>>(new Set(menuPrefs?.hidden ?? []));
  const [dragId, setDragId] = useState<string | null>(null);
  const save = useMut((b: any) => apiSend("/api/auth/menu-prefs", "PATCH", b), { success: "บันทึกเมนูแล้ว", invalidate: ["me"] });

  const toggle = (id: string) => setHidden((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const renameGroup = (gi: number, v: string) => setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, label: v } : g)));
  const addGroup = () => setGroups((gs) => [...gs, { label: "หมวดใหม่", items: [] }]);
  const moveGroup = (gi: number, d: number) => setGroups((gs) => { const j = gi + d; if (j < 0 || j >= gs.length) return gs; const a = [...gs]; [a[gi], a[j]] = [a[j], a[gi]]; return a; });
  const removeGroup = (gi: number) => setGroups((gs) => {
    if (gs.length <= 1) return gs;
    const into = gi === 0 ? 1 : gi - 1;
    const next = gs.map((g) => ({ ...g, items: [...g.items] }));
    next[into].items.push(...next[gi].items);
    next.splice(gi, 1);
    return next;
  });
  // Drop a dragged item before `targetId` (or appended) inside group gi.
  const drop = (gi: number, targetId: string | null) => {
    if (!dragId) return;
    setGroups((gs) => {
      const next = gs.map((g) => ({ ...g, items: g.items.filter((x) => x !== dragId) }));
      const arr = next[gi].items;
      const at = targetId ? arr.indexOf(targetId) : -1;
      arr.splice(at < 0 ? arr.length : at, 0, dragId);
      return next;
    });
    setDragId(null);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>จัดการเมนู & หมวด</CardTitle>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={addGroup}><Plus className="h-3.5 w-3.5" /> เพิ่มหมวด</Button>
        <Button size="sm" variant="ghost" onClick={() => { setGroups(seedGroups()); setHidden(new Set()); save.mutate({ groups: [], hidden: [], order: [] }); }}>คืนค่าเริ่มต้น</Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ groups, hidden: [...hidden] })}>บันทึก</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((g, gi) => (
          <div key={gi} className="rounded-md border border-border p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(gi, null)}>
            <div className="mb-1.5 flex items-center gap-1">
              <Input value={g.label} onChange={(e) => renameGroup(gi, e.target.value)} className="h-7 max-w-[200px] font-semibold" />
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveGroup(gi, -1)} disabled={gi === 0}><ChevronUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveGroup(gi, 1)} disabled={gi === groups.length - 1}><ChevronDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeGroup(gi)} disabled={groups.length <= 1} aria-label="ลบหมวด"><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              {g.items.map((id) => (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); drop(gi, id); }}
                  onDragEnd={() => setDragId(null)}
                  className={cn("flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing", dragId === id && "opacity-40")}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className={hidden.has(id) ? "text-muted-foreground line-through" : ""}>{label(id)}</span>
                  <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" onClick={() => toggle(id)} aria-label="ซ่อน/แสดง">
                    {hidden.has(id) ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
              {g.items.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">ลากเมนูมาวางที่นี่</p>}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">ลากเมนูข้ามหมวดได้ · แก้ชื่อหมวดในช่อง · ตา = ซ่อน/แสดง · บันทึกเพื่อใช้ทุกเครื่อง</p>
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet("/api/settings") });
  const save = useMut((b: any) => apiSend("/api/settings", "PATCH", b), { success: "บันทึกแล้ว", invalidate: ["settings"] });
  const changePw = useMut((b: any) => apiSend("/api/auth/change-password", "POST", b), { success: "เปลี่ยนรหัสแล้ว" });

  const saveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const retentionRaw = String(fd.get("slip_retention_days") ?? "").trim();
    save.mutate({
      name: fd.get("name"), timezone: fd.get("timezone"), bill_footer: fd.get("bill_footer"),
      reminder_hour: Number(fd.get("reminder_hour")), deadline_hour: Number(fd.get("deadline_hour")),
      reminder_text: fd.get("reminder_text"),
      slip_retention_days: retentionRaw === "" ? null : Number(retentionRaw),
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
                <Input name="slip_retention_days" type="number" min={0} defaultValue={d.slip_retention_days ?? ""} placeholder="เช่น 30" />
              </div>
              <Button size="sm" type="submit">บันทึก</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <MenuManager />

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
