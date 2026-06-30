import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

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

  const save = useMut((b: any) => apiSend("/api/platform/settings", "PATCH", b), { success: "บันทึกแล้ว", invalidate: ["platform-settings"] });
  const editOrg = useMut((b: { id: string; data: any }) => apiSend(`/api/platform/organizations/${b.id}`, "PATCH", b.data), { success: "อัปเดตองค์กรแล้ว", invalidate: ["orgs"] });

  const saveDefaults = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const retentionRaw = String(fd.get("slip_retention_days") ?? "").trim();
    save.mutate({
      default_bill_footer: fd.get("footer"), default_timezone: fd.get("tz"),
      default_slip_retention_days: retentionRaw === "" ? null : Number(retentionRaw),
    });
  };

  const d = s.data;
  const i = info.data;

  const orgCols: Column<any>[] = [
    { key: "name", header: "องค์กร", sortValue: (o) => o.name, cell: (o) => <span className="font-medium">{o.name}</span> },
    { key: "users", header: "ผู้ใช้", align: "right", sortValue: (o) => o._count?.memberships ?? 0, cell: (o) => <span className="text-muted-foreground">{o._count?.memberships ?? 0}</span> },
    { key: "custs", header: "ลูกค้า", align: "right", sortValue: (o) => o._count?.customers ?? 0, cell: (o) => <span className="text-muted-foreground">{o._count?.customers ?? 0}</span> },
    { key: "status", header: "สถานะ", sortValue: (o) => (o.isActive ? 1 : 0), cell: (o) => <Badge variant={o.isActive ? "success" : "secondary"}>{o.isActive ? "active" : "off"}</Badge> },
    { key: "act", header: "", stop: true, cell: (o) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="outline" onClick={() => { const n = prompt("ชื่อองค์กรใหม่:", o.name); if (n && n.trim()) editOrg.mutate({ id: o.id, data: { name: n.trim() } }); }}>เปลี่ยนชื่อ</Button>
        <Button size="sm" variant={o.isActive ? "destructive" : "success"} onClick={() => editOrg.mutate({ id: o.id, data: { is_active: !o.isActive } })}>{o.isActive ? "ปิด" : "เปิด"}</Button>
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
                <Input name="slip_retention_days" type="number" min={0} defaultValue={d.default_slip_retention_days ?? ""} className="mt-1" placeholder="ปล่อยว่าง = ใช้ค่าจาก .env (SLIP_RETENTION_DAYS)" />
              </div>
              <Button size="sm" type="submit" disabled={save.isPending}>บันทึกค่าเริ่มต้น</Button>
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
                <Row k="เก็บรูปสลิป (.env)" v={`${i.slip_retention_days_default} วัน`} />
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
