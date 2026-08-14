import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileImage, FileText, Folder } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="fig max-w-full break-words text-left text-sm sm:text-right">{v}</span>
    </div>
  );
}

export function GoogleDriveManager() {
  const [driveFolderId, setDriveFolderId] = useState<string | undefined>();
  const driveStatus = useQuery({ queryKey: ["gdrive-status"], queryFn: () => apiGet("/api/platform/google-drive/status") });
  const driveFiles = useQuery({
    queryKey: ["gdrive-files", driveFolderId ?? "root"],
    queryFn: () => apiGet(`/api/platform/google-drive/files${driveFolderId ? `?folder_id=${encodeURIComponent(driveFolderId)}` : ""}`),
    enabled: driveStatus.data?.connected === true,
  });
  const testDrive = useMut(() => apiSend("/api/platform/google-drive/test", "POST"), { success: "เชื่อมต่อ Google Drive สำเร็จ", invalidate: ["gdrive-status", "gdrive-files", "system-info"] });

  const driveCols: Column<any>[] = [
    { key: "name", header: "ชื่อ", sortValue: (f) => f.name, cell: (f) => {
      const isFolder = f.mime_type === "application/vnd.google-apps.folder";
      const Icon = isFolder ? Folder : f.mime_type?.startsWith("image/") ? FileImage : FileText;
      return isFolder ? (
        <button type="button" className="inline-flex items-center gap-2 font-medium text-primary hover:underline" onClick={() => setDriveFolderId(f.id)}>
          <Icon className="h-4 w-4" /> {f.name}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-muted-foreground" /> {f.name}</span>
      );
    } },
    { key: "type", header: "ประเภท", sortValue: (f) => f.mime_type, cell: (f) => <span className="text-muted-foreground">{f.mime_type === "application/vnd.google-apps.folder" ? "โฟลเดอร์" : "ไฟล์"}</span> },
    { key: "size", header: "ขนาด", align: "right", sortValue: (f) => Number(f.size ?? 0), cell: (f) => <span className="fig text-xs">{f.size ? `${(Number(f.size) / 1024).toFixed(1)} KB` : "—"}</span> },
    { key: "modified", header: "แก้ไขล่าสุด", sortValue: (f) => f.modified_time ?? "", cell: (f) => <span className="fig text-xs">{f.modified_time?.replace("T", " ").slice(0, 16) ?? "—"}</span> },
    { key: "open", header: "", stop: true, cell: (f) => f.web_view_link ? <a href={f.web_view_link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline-offset-2 hover:underline">เปิด</a> : null },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle>จัดการ Google Drive</CardTitle>
        {driveStatus.data?.connected ? <Badge variant="success">เชื่อมต่อแล้ว</Badge> : <Badge variant={driveStatus.data?.configured ? "warning" : "secondary"}>{driveStatus.data?.configured ? "เชื่อมต่อไม่ได้" : "ยังไม่ตั้งค่า"}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {driveStatus.data && (
          <>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row k="Service Account" v={driveStatus.data.service_account_email ?? "—"} />
              <Row k="Root Folder" v={driveStatus.data.root?.name ?? driveStatus.data.root_folder_id ?? "—"} />
              <Row k="Driver ที่ใช้งาน" v={driveStatus.data.storage_driver} />
              <Row k="รายการในโฟลเดอร์" v={driveStatus.data.connected ? `${driveFiles.data?.files?.length ?? 0} รายการ` : "—"} />
            </div>
            {driveStatus.data.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">{driveStatus.data.error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => testDrive.mutate(undefined)} disabled={testDrive.isPending}>{testDrive.isPending ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}</Button>
              {driveStatus.data.root?.web_view_link && <a href={driveStatus.data.root.web_view_link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-primary px-3.5 text-[13px] font-semibold text-primary hover:bg-primary/10">เปิด Root Folder</a>}
            </div>
            {driveStatus.data.connected && (
              <>
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  {(driveFiles.data?.breadcrumbs ?? []).map((crumb: any, index: number) => (
                    <span key={crumb.id} className="inline-flex items-center gap-1">
                      {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <button type="button" className={index === (driveFiles.data?.breadcrumbs?.length ?? 1) - 1 ? "font-semibold text-foreground" : "text-primary hover:underline"} onClick={() => setDriveFolderId(crumb.id === driveStatus.data.root_folder_id ? undefined : crumb.id)}>{crumb.name}</button>
                    </span>
                  ))}
                </div>
                <DataTable data={driveFiles.data?.files ?? []} columns={driveCols} rowKey={(f) => f.id} initialSort={{ key: "name", dir: "asc" }} empty="ยังไม่มีไฟล์หรือโฟลเดอร์ในโฟลเดอร์นี้" loading={driveFiles.isLoading} />
              </>
            )}
            <p className="text-xs text-muted-foreground">เมื่อแนบรูป ระบบจะสร้างโครงสร้าง <span className="fig">Root / ชื่อองค์กร / slip /</span> อัตโนมัติ โดยกดชื่อโฟลเดอร์เพื่อเข้าไปดูได้</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
