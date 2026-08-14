import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { MenuManager } from "@/components/MenuManager";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="fig text-sm">{v}</span>
    </div>
  );
}

export function PlatformSettings() {
  const s = useQuery({ queryKey: ["platform-settings"], queryFn: () => apiGet("/api/platform/settings") });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => apiGet("/api/platform/organizations") });
  const info = useQuery({ queryKey: ["system-info"], queryFn: () => apiGet("/api/platform/system-info"), refetchInterval: 15000 });
  const save = useMut((b: any) => apiSend("/api/platform/settings", "PATCH", b), { success: "บันทึกแล้ว", invalidate: ["platform-settings", "gdrive-status", "gdrive-files", "system-info"] });
  const editOrg = useMut((b: { id: string; data: any }) => apiSend(`/api/platform/organizations/${b.id}`, "PATCH", b.data), { success: "อัปเดตองค์กรแล้ว", invalidate: ["orgs"] });
  const removeOrg = useMut((id: string) => apiSend(`/api/platform/organizations/${id}`, "DELETE"), { success: "ลบองค์กรแล้ว", invalidate: ["orgs", "system-info"] });
  const [storageOrg, setStorageOrg] = useState<any | null>(null);

  const saveStorage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: any = { storage_driver: fd.get("driver"), gdrive_root_folder_id: fd.get("root") };
    const sa = (fd.get("sa") as string)?.trim();
    if (sa) body.gdrive_service_account = sa; // empty = keep existing
    save.mutate(body, { onError: (err: any) => {} });
    (e.currentTarget.elements.namedItem("sa") as HTMLTextAreaElement).value = "";
  };

  const saveDefaults = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const retention = fd.get("slip_retention_days");
    save.mutate({
      default_bill_footer: fd.get("footer"),
      default_timezone: fd.get("tz"),
      default_slip_retention_days: retention === "" ? null : Number(retention),
    });
  };

  const d = s.data;
  const i = info.data;

  const orgCols: Column<any>[] = [
    { key: "name", header: "องค์กร", sortValue: (o) => o.name, cell: (o) => (
      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setStorageOrg(o)}>{o.name}</button>
    ) },
    { key: "users", header: "ผู้ใช้", align: "right", sortValue: (o) => o._count?.memberships ?? 0, cell: (o) => <span className="text-muted-foreground">{o._count?.memberships ?? 0}</span> },
    { key: "custs", header: "ลูกค้า", align: "right", sortValue: (o) => o._count?.customers ?? 0, cell: (o) => <span className="text-muted-foreground">{o._count?.customers ?? 0}</span> },
    { key: "storage", header: "โฟลเดอร์สลิป", cell: (o) => o.gdrive_folder_id ? <Badge variant="success">กำหนดแล้ว</Badge> : <Badge variant="secondary">อัตโนมัติ</Badge> },
    { key: "status", header: "สถานะ", sortValue: (o) => (o.is_active ? 1 : 0), cell: (o) => <Badge variant={o.is_active ? "success" : "secondary"}>{o.is_active ? "active" : "off"}</Badge> },
    { key: "act", header: "", stop: true, cell: (o) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => setStorageOrg(o)}>ตั้งค่า Storage</Button>
        <Button size="sm" variant="outline" onClick={() => { const n = prompt("ชื่อองค์กรใหม่:", o.name); if (n && n.trim()) editOrg.mutate({ id: o.id, data: { name: n.trim() } }); }}>เปลี่ยนชื่อ</Button>
        <Button size="sm" variant={o.is_active ? "destructive" : "success"} onClick={() => editOrg.mutate({ id: o.id, data: { is_active: !o.is_active } })}>{o.is_active ? "ปิด" : "เปิด"}</Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={removeOrg.isPending}
          onClick={() => {
            if (window.confirm(`ต้องการลบองค์กร “${o.name}” ใช่หรือไม่? ลบได้เฉพาะองค์กรที่ยังไม่มีข้อมูล`)) removeOrg.mutate(o.id);
          }}
        >ลบ</Button>
      </div>
    ) },
  ];

  return (
    <>
      {/* System defaults */}
      <Card>
        <CardHeader><CardTitle>ค่าเริ่มต้นทั้งระบบ</CardTitle></CardHeader>
        <CardContent>
          {d && (
            <form className="max-w-xl space-y-3" onSubmit={saveDefaults}>
              <div>
                <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Timezone เริ่มต้น (ใช้กับ org ใหม่)</label>
                <Input name="tz" defaultValue={d.default_timezone} placeholder="Asia/Bangkok" className="mt-1" />
              </div>
              <div>
                <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">ข้อความท้ายบิลเริ่มต้น (ใช้เมื่อ org ไม่ตั้งเอง)</label>
                <textarea name="footer" defaultValue={d.default_bill_footer ?? ""} rows={3}
                  className="mt-1 flex w-full rounded-md px-3 py-2 text-sm neu-inset focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="ปล่อยว่าง = ใช้ค่าจาก .env (BILL_FOOTER)" />
              </div>
              <div>
                <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">เก็บรูปสลิปกี่วันเริ่มต้น (ใช้เมื่อ org ไม่ตั้งเอง, 0 = ลบทันทีหลัง OCR)</label>
                <Input name="slip_retention_days" type="number" min={0} defaultValue={d.default_slip_retention_days ?? ""} placeholder="ปล่อยว่าง = ใช้ค่าจาก .env (SLIP_RETENTION_DAYS)" className="mt-1" />
              </div>
              <Button size="sm" type="submit" disabled={save.isPending}>บันทึกค่าเริ่มต้น</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Slip storage gateway */}
      <Card>
        <CardHeader><CardTitle>ที่เก็บไฟล์สลิป (Storage)</CardTitle></CardHeader>
        <CardContent>
          {d && (
            <form className="max-w-xl space-y-3" onSubmit={saveStorage}>
              <Field label="ที่เก็บไฟล์ (Driver)">
                <Select name="driver" defaultValue={d.storage_driver}>
                  <option value="local">Local disk (เซิร์ฟเวอร์)</option>
                  <option value="gdrive">Google Drive</option>
                  <option value="s3">Amazon S3 / S3-compatible</option>
                </Select>
              </Field>
              <Field label="Google Drive — Root Folder ID">
                <Input name="root" defaultValue={d.gdrive_root_folder_id ?? ""} placeholder="ID โฟลเดอร์ปลายทางใน Drive" />
              </Field>
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  Service Account JSON
                  {d.gdrive_configured ? <Badge variant="success">ตั้งค่าแล้ว</Badge> : <Badge variant="secondary">ยังไม่ตั้ง</Badge>}
                </div>
                <textarea name="sa" rows={4}
                  className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/10"
                  placeholder='วาง service account JSON (เว้นว่าง = คงค่าเดิม) — เก็บฝั่ง server ไม่ถูกส่งกลับ' />
              </div>
              <Button type="submit" disabled={save.isPending}>บันทึก Storage</Button>
              <p className="text-xs text-muted-foreground">
                สถานะ config: <Badge variant={d.storage_configured ? "success" : "warning"}>{d.storage_configured ? "ครบ" : "ยังไม่ครบ"}</Badge>
                {!d.storage_configured && d.storage_missing?.length ? ` · ขาด: ${d.storage_missing.join(", ")}` : ""}
                <br />
                Google Drive ใช้โฟลเดอร์องค์กร / slip / lineUserId-ชื่อ · S3 ใช้ค่า env: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Organizations */}
      <Card>
        <CardHeader><CardTitle>องค์กรทั้งหมด</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable data={orgs.data ?? []} columns={orgCols} rowKey={(o) => o.id} initialSort={{ key: "name", dir: "asc" }} empty="ยังไม่มีองค์กร" />
        </CardContent>
      </Card>

      <Dialog open={!!storageOrg} onClose={() => setStorageOrg(null)} title={storageOrg ? `ที่เก็บไฟล์สลิป (Storage) — ${storageOrg.name}` : "ที่เก็บไฟล์สลิป (Storage)"} className="max-w-xl">
        {storageOrg && (
          <form
            key={storageOrg.id}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const folderId = String(new FormData(e.currentTarget).get("gdrive_folder_id") ?? "").trim();
              editOrg.mutate({ id: storageOrg.id, data: { gdrive_folder_id: folderId } }, { onSuccess: () => setStorageOrg(null) });
            }}
          >
            <div className="rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              ตั้งค่าได้โดย Super Admin เท่านั้น และใช้เฉพาะองค์กร <span className="font-semibold text-foreground">{storageOrg.name}</span>
            </div>
            <Field label="Google Drive — Folder ID ขององค์กร">
              <Input name="gdrive_folder_id" defaultValue={storageOrg.gdrive_folder_id ?? ""} placeholder="ปล่อยว่าง = สร้างโฟลเดอร์ชื่อองค์กรใต้ Root อัตโนมัติ" />
            </Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              เส้นทางจัดเก็บ: <span className="fig">{storageOrg.gdrive_folder_id ? "โฟลเดอร์ที่กำหนด" : "Root / ชื่อองค์กร"} / slip / lineUserId-ชื่อ / ไฟล์</span>
              <br />เช่น <span className="fig">บ้านขุมทรัพย์ / slip / Uxxxxxxxx-คุณสมชาย / slip.jpg</span>
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {storageOrg.gdrive_folder_id && (
                <a href={`https://drive.google.com/drive/folders/${encodeURIComponent(storageOrg.gdrive_folder_id)}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">เปิดโฟลเดอร์ใน Drive</a>
              )}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStorageOrg(null)}>ยกเลิก</Button>
                <Button type="submit" disabled={editOrg.isPending}>{editOrg.isPending ? "กำลังบันทึก…" : "บันทึก Storage"}</Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>

      <MenuManager />

      {/* System status + OCR */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>สถานะระบบ</CardTitle></CardHeader>
          <CardContent>
            {i && (
              <>
                <Row k="เวอร์ชัน" v={i.version} />
                <Row k="Runtime" v={i.runtime} />
                <Row k="โหมด" v={i.node_env} />
                <Row k="Timezone" v={i.timezone} />
                <Row k="ฐานข้อมูล" v={<Badge variant={i.db_ok ? "success" : "destructive"}>{i.db_ok ? "เชื่อมต่อ" : "ขัดข้อง"}</Badge>} />
                <Row k="Uptime" v={`${Math.floor(i.uptime_sec / 60)} นาที`} />
                <Row k="องค์กร / ผู้ใช้" v={`${i.orgs} / ${i.users}`} />
                <Row k="Storage" v={<Badge variant={i.storage_configured ? "success" : "warning"}>{i.storage_driver}{i.storage_configured ? " · config ครบ" : " · config ไม่ครบ"}</Badge>} />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>การอ่านสลิป (OCR)</CardTitle></CardHeader>
          <CardContent>
            {i && (
              <>
                <Row k="Provider" v={<Badge variant={i.ocr.provider === "mock" ? "warning" : "success"}>{i.ocr.provider}</Badge>} />
                <Row k="Model" v={i.ocr.model} />
                <Row k="API key" v={<Badge variant={i.ocr.configured ? "success" : "secondary"}>{i.ocr.configured ? "ตั้งค่าแล้ว" : "ยังไม่ตั้ง"}</Badge>} />
                <Row k="Rate limit" v={`${i.ocr.rate_max} / ${Math.round(i.ocr.rate_window_sec / 60)} นาที`} />
                <Row k="อนุมัติอัตโนมัติ" v={<Badge variant={i.auto_approve ? "success" : "secondary"}>{i.auto_approve ? "เปิด" : "ปิด"}</Badge>} />
                <Row k="Storage" v={i.storage_driver} />
                <Row k="เก็บสลิป (.env default)" v={`${i.slip_retention_days_env_default} วัน`} />
              </>
            )}
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              ค่าเหล่านี้ตั้งจาก .env (เป็น secret) แก้ที่เซิร์ฟเวอร์แล้วรีสตาร์ท
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
