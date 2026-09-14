import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileImage, FolderInput, RefreshCw, Search, Trash2 } from "lucide-react";
import { apiGet, apiRaw, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useConfirm, usePrompt } from "@/components/ui/confirm";

const LIMIT = 20;
const fileName = (file: any) => file.original_file_name || `submission-${file.id}`;
const fileDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function FilePreview({ file, onClose }: { file: any; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setSrc(null);
    setError(false);
    apiRaw(`/api/platform/files/${encodeURIComponent(file.id)}/content`).then(async (response) => {
      if (!response.ok) throw new Error("file unavailable");
      url = URL.createObjectURL(await response.blob());
      if (cancelled) URL.revokeObjectURL(url);
      else setSrc(url);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file.id]);

  return (
    <Dialog open onClose={onClose} title={fileName(file)} className="max-w-3xl">
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">ไม่สามารถโหลดไฟล์จาก Storage ได้</p>
        ) : src ? (
          <img src={src} alt={fileName(file)} onError={() => setError(true)} className="mx-auto max-h-[65vh] max-w-full rounded-lg border border-border object-contain" />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">กำลังโหลดไฟล์…</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="fig break-all">Chat ID: {file.chat_id ?? "—"}</span>
          {src && <a href={src} download={fileName(file)} className="inline-flex h-8 items-center gap-2 rounded-lg border border-primary px-3.5 text-[13px] font-semibold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> ดาวน์โหลด</a>}
        </div>
      </div>
    </Dialog>
  );
}

export function FileManager() {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [searchDraft, setSearchDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [search, setSearch] = useState("");
  const [chatId, setChatId] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<any | null>(null);

  const qs = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (search) qs.set("search", search);
  if (chatId) qs.set("chat_id", chatId);
  const files = useQuery({
    queryKey: ["platform-files", search, chatId, page],
    queryFn: () => apiGet(`/api/platform/files?${qs}`),
  });
  const items: any[] = files.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((files.data?.total ?? 0) / LIMIT));

  const move = useMut<{ id: string; target: string }>(
    ({ id, target }) => apiSend(`/api/platform/files/${id}/move`, "POST", { target_chat_id: target }),
    { success: "ย้ายไฟล์แล้ว", invalidate: ["platform-files", "r2-usage"] }
  );
  const remove = useMut((id: string) => apiSend(`/api/platform/files/${id}`, "DELETE"), {
    success: "ลบไฟล์แล้ว", invalidate: ["platform-files", "r2-usage"],
  });

  const applyFilters = () => {
    setSearch(searchDraft.trim());
    setChatId(chatDraft.trim());
    setPage(1);
  };
  const moveFile = async (file: any) => {
    const target = await prompt({
      title: "ย้ายไฟล์ตาม Chat ID",
      message: `ไฟล์: ${fileName(file)}\nระบุ Chat ID ปลายทาง`,
      placeholder: "เช่น Uxxxxxxxx หรือ Cxxxxxxxx",
      confirmLabel: "ย้ายไฟล์",
    });
    if (target?.trim()) move.mutate({ id: file.id, target: target.trim() });
  };
  const deleteFile = async (file: any) => {
    if (await confirm({ title: "ลบไฟล์", message: `ยืนยันลบ ${fileName(file)}? การลบไฟล์จาก Storage ย้อนกลับไม่ได้`, confirmLabel: "ลบไฟล์", destructive: true })) {
      remove.mutate(file.id);
    }
  };

  const columns: Column<any>[] = [
    {
      key: "file",
      header: "ไฟล์",
      sortValue: (file) => fileName(file),
      cell: (file) => <span className="inline-flex max-w-[260px] items-center gap-2"><FileImage className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate font-medium" title={fileName(file)}>{fileName(file)}</span></span>,
    },
    {
      key: "organization",
      header: "องค์กร",
      sortValue: (file) => file.organization?.name ?? file.org_id ?? "",
      cell: (file) => <span>{file.organization?.name ?? file.org_id ?? "—"}</span>,
    },
    {
      key: "chat",
      header: "โฟลเดอร์ Chat ID",
      sortValue: (file) => file.chat_id ?? "",
      cell: (file) => <span className="fig break-all text-xs">{file.chat_id ?? "—"}{file.source_chat_id && file.source_chat_id !== file.chat_id && <span className="mt-1 block font-sans text-[11px] text-muted-foreground">เดิม: {file.source_chat_id}</span>}</span>,
    },
    { key: "created", header: "วันที่สร้าง", sortValue: (file) => file.created_at ?? "", cell: (file) => <span className="fig text-xs">{fileDate(file.created_at)}</span> },
    {
      key: "actions",
      header: "",
      stop: true,
      cell: (file) => (
        <div className="flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPreview(file)} aria-label="ดูไฟล์" title="ดูไฟล์"><Eye className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => void moveFile(file)} disabled={move.isPending} aria-label="ย้ายไฟล์" title="ย้ายไฟล์"><FolderInput className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-danger-text hover:text-danger-text" onClick={() => void deleteFile(file)} disabled={remove.isPending} aria-label="ลบไฟล์" title="ลบไฟล์"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="items-start justify-between">
        <div>
          <CardTitle>จัดการไฟล์ตามแชท</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">ดูตัวอย่าง ดาวน์โหลด ย้ายโฟลเดอร์ และลบไฟล์ที่ผูกกับรายการชำระเงิน</p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={() => void files.refetch()} disabled={files.isFetching} aria-label="รีเฟรชรายการ" title="รีเฟรชรายการ"><RefreshCw className={files.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="ค้นหา" className="min-w-[220px] flex-1">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} placeholder="ชื่อไฟล์, Chat ID, Message ID" className="pl-9" /></div>
          </Field>
          <Field label="Chat ID" className="min-w-[220px] flex-1"><Input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} placeholder="กรองตามโฟลเดอร์แชท" /></Field>
          <Button type="button" size="sm" onClick={applyFilters}>ค้นหา</Button>
        </div>
        {files.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-text">โหลดรายการไฟล์ไม่สำเร็จ: {(files.error as Error).message}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>พบ <span className="fig font-semibold text-foreground">{files.data?.total ?? 0}</span> ไฟล์</span><span className="fig">หน้า {page} / {pages}</span></div>
        <DataTable data={items} columns={columns} rowKey={(file) => file.id} initialSort={{ key: "created", dir: "desc" }} empty="ยังไม่มีไฟล์ที่ผูกกับรายการชำระเงิน" loading={files.isLoading} />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || files.isFetching}>ก่อนหน้า</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || files.isFetching}>ถัดไป</Button>
        </div>
      </CardContent>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </Card>
  );
}
