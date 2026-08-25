import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cloud } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="fig max-w-full break-words text-left text-sm sm:text-right">{v}</span>
    </div>
  );
}

const driverLabel: Record<string, string> = {
  local: "Local disk",
  gdrive: "Google Drive",
  s3: "S3-compatible / Cloudflare R2",
};

export function StorageManager() {
  const settings = useQuery({ queryKey: ["platform-settings"], queryFn: () => apiGet("/api/platform/settings") });
  const drive = useQuery({ queryKey: ["gdrive-status"], queryFn: () => apiGet("/api/platform/google-drive/status") });
  const s3 = useQuery({ queryKey: ["storage-status"], queryFn: () => apiGet("/api/platform/storage/status") });
  const [driver, setDriver] = useState("");

  useEffect(() => {
    if (settings.data?.storage_driver) setDriver(settings.data.storage_driver);
  }, [settings.data?.storage_driver]);

  const save = useMut((body: any) => apiSend("/api/platform/settings", "PATCH", body), {
    success: "เปลี่ยนที่เก็บไฟล์แล้ว",
    invalidate: ["platform-settings", "system-info", "gdrive-status", "storage-status"],
  });
  const testS3 = useMut(() => apiSend("/api/platform/storage/test", "POST"), {
    success: "ทดสอบ Object Storage แล้ว",
    invalidate: ["storage-status", "system-info"],
  });

  const saveStorage = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body: any = {
      storage_driver: fd.get("driver"),
      gdrive_root_folder_id: fd.get("root"),
    };
    const serviceAccount = (fd.get("sa") as string)?.trim();
    if (serviceAccount) body.gdrive_service_account = serviceAccount;
    save.mutate(body);
    const serviceAccountField = form.elements.namedItem("sa") as HTMLTextAreaElement | null;
    if (serviceAccountField) serviceAccountField.value = "";
  };

  const active = settings.data?.storage_driver ?? "local";
  const activeConfigured = settings.data?.storage_configured === true;
  const activeConnected = active === "local" ? true : active === "gdrive" ? drive.data?.connected === true : s3.data?.connected === true;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>จัดการ File Storage</CardTitle>
          <Badge variant={activeConnected ? "success" : activeConfigured ? "warning" : "secondary"}>
            {activeConnected ? "เชื่อมต่อแล้ว" : activeConfigured ? "เชื่อมต่อไม่ได้" : "ตั้งค่าไม่ครบ"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Row k="Driver ที่ใช้งาน" v={driverLabel[active] ?? active} />
            <Row k="สถานะ config" v={<Badge variant={activeConfigured || active === "local" ? "success" : "warning"}>{activeConfigured || active === "local" ? "ครบ" : "ยังไม่ครบ"}</Badge>} />
            {active === "s3" && <Row k="Bucket" v={s3.data?.bucket ?? "—"} />}
            {active === "s3" && <Row k="Endpoint" v={s3.data?.endpoint ?? "AWS default"} />}
            {active === "gdrive" && <Row k="Root Folder" v={drive.data?.root?.name ?? drive.data?.root_folder_id ?? "—"} />}
            {active === "gdrive" && <Row k="Service Account" v={drive.data?.service_account_email ?? "—"} />}
          </div>
          {settings.data?.storage_missing?.length > 0 && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-text">ขาดการตั้งค่า: {settings.data.storage_missing.join(", ")}</p>
          )}
          <form className="space-y-4" onSubmit={saveStorage}>
            <label className="block text-sm font-medium text-foreground">
              ที่เก็บไฟล์ (Driver)
              <Select className="mt-1" name="driver" value={driver || active} onChange={(e) => setDriver(e.target.value)}>
                <option value="local">Local disk (เซิร์ฟเวอร์)</option>
                <option value="gdrive">Google Drive</option>
                <option value="s3">S3-compatible / Cloudflare R2</option>
              </Select>
            </label>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Google Drive — Root Folder ID">
                <Input name="root" defaultValue={settings.data?.gdrive_root_folder_id ?? ""} placeholder="ID โฟลเดอร์ปลายทางใน Drive" />
              </Field>
              <div>
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                  Service Account JSON
                  {settings.data?.gdrive_configured ? <Badge variant="success">ตั้งค่าแล้ว</Badge> : <Badge variant="secondary">ยังไม่ตั้ง</Badge>}
                </div>
                <textarea name="sa" rows={4}
                  className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/10"
                  placeholder="วาง service account JSON (เว้นว่าง = คงค่าเดิม) — เก็บฝั่ง server ไม่ถูกส่งกลับ"
                />
              </div>
            </div>
            <Button size="sm" type="submit" disabled={save.isPending}>
              {save.isPending ? "กำลังบันทึก…" : "บันทึก Storage"}
            </Button>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Google Drive ใช้ Service Account และ Root Folder จากหน้านี้ ส่วน R2/S3 ใช้ค่าปลอดภัยจาก `.env` เช่น `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` และ `S3_SECRET_ACCESS_KEY`
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        <Card>
          <CardHeader className="flex-row items-center gap-2"><Cloud className="h-5 w-5 text-primary" /><CardTitle>Cloudflare R2 / S3</CardTitle><Badge variant={s3.data?.connected ? "success" : s3.data?.configured ? "warning" : "secondary"}>{s3.data?.connected ? "เชื่อมต่อแล้ว" : s3.data?.configured ? "เชื่อมต่อไม่ได้" : "ยังไม่ตั้งค่า"}</Badge></CardHeader>
          <CardContent className="space-y-3">
            <Row k="Bucket" v={s3.data?.bucket ?? "—"} />
            <Row k="Endpoint" v={s3.data?.endpoint ?? "AWS default"} />
            <Row k="Prefix" v={s3.data?.prefix ?? "—"} />
            {s3.data?.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{s3.data.error}</p>}
            <Button size="sm" variant="outline" onClick={() => testS3.mutate(undefined)} disabled={testS3.isPending}>{testS3.isPending ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
