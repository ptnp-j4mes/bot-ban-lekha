import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, Eye, Search, SlidersHorizontal, X } from "lucide-react";
import { apiGet, apiSend, apiRaw } from "@/lib/api";
import { useMut, matchBadge, reviewBadge, statusTh } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm, usePrompt } from "@/components/ui/confirm";
import { submissionImageSource } from "@/lib/submission-image";

const MATCH = ["unmatched", "auto_matched", "needs_admin_match", "admin_matched", "rejected"];
const REVIEW = ["pending_review", "approved", "rejected"];
const OCR = ["processing", "success", "failed"];

// Local/S3 references need auth; public storage URLs can render directly.
function SlipImage({ id, imageUrl }: { id: string; imageUrl: string }) {
  const source = submissionImageSource(id, imageUrl);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    setSrc(null);
    setFailed(false);
    if (!source || source.kind === "remote") return;
    let cancelled = false;
    apiRaw(source.src).then(async (r) => {
      if (!r.ok) throw new Error("slip image unavailable");
      url = URL.createObjectURL(await r.blob());
      if (cancelled) URL.revokeObjectURL(url);
      else setSrc(url);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [source?.kind, source?.src]);
  if (!source) return null;
  if (source.kind === "remote") return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">สลิปต้นฉบับ</p>
      <a href={source.src} target="_blank" rel="noreferrer">
        <img src={source.src} alt="สลิปต้นฉบับ" className="max-h-80 max-w-full rounded-lg border border-border object-contain" />
      </a>
      <a href={source.src} target="_blank" rel="noreferrer" className="text-[hsl(var(--sage))] underline underline-offset-2">เปิดรูปสลิปเต็ม</a>
    </div>
  );
  if (failed) return <p className="text-xs text-muted-foreground">ไม่สามารถโหลดรูปสลิปต้นฉบับจาก storage ได้</p>;
  if (!src) return <p className="text-xs text-muted-foreground">กำลังโหลดรูปสลิปต้นฉบับ…</p>;
  return <div className="space-y-2"><p className="text-xs text-muted-foreground">สลิปต้นฉบับ</p><a href={src} target="_blank" rel="noreferrer"><img src={src} alt="สลิปต้นฉบับ" className="max-h-80 max-w-full rounded-lg border border-border object-contain" /></a></div>;
}

export function Submissions() {
  const { canWrite } = useAuth();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [matchDraft, setMatchDraft] = useState("");
  // Reviewing pending slips is the page's job — land there by default.
  const [reviewDraft, setReviewDraft] = useState("pending_review");
  const [docTypeDraft, setDocTypeDraft] = useState("");
  const [ocrDraft, setOcrDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [toDraft, setToDraft] = useState("");
  const [match, setMatch] = useState("");
  const [review, setReview] = useState("pending_review");
  const [docType, setDocType] = useState("");
  const [ocr, setOcr] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [instId, setInstId] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const LIMIT = 20;

  const qs = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (match) qs.set("match_status", match);
  if (review) qs.set("review_status", review);
  if (docType) qs.set("doc_type", docType);
  if (ocr) qs.set("ocr_status", ocr);
  if (from) qs.set("date_from", from);
  if (to) qs.set("date_to", to);

  const applyFilters = () => {
    setMatch(matchDraft);
    setReview(reviewDraft);
    setDocType(docTypeDraft);
    setOcr(ocrDraft);
    setFrom(fromDraft);
    setTo(toDraft);
    setPage(1);
    setSel(new Set());
  };

  const list = useQuery({
    queryKey: ["subs", match, review, docType, ocr, from, to, page],
    queryFn: () => apiGet(`/api/admin/payment-submissions?${qs}`),
  });
  const items: any[] = list.data?.items ?? [];
  const custLabel = (it: any) => it.customer?.display_name || it.customer?.customer_code || (it.line_group_id ? "" : it.line_user_id) || "—";
  const submissionCounts = useQuery({
    queryKey: ["subs-counts", match, docType, ocr, from, to],
    queryFn: async () => {
      const statuses = ["", "pending_review", "approved", "rejected"];
      const result = await Promise.all(statuses.map((status) => {
        const countQs = new URLSearchParams({ limit: "1", page: "1" });
        if (match) countQs.set("match_status", match);
        if (docType) countQs.set("doc_type", docType);
        if (ocr) countQs.set("ocr_status", ocr);
        if (from) countQs.set("date_from", from);
        if (to) countQs.set("date_to", to);
        if (status) countQs.set("review_status", status);
        return apiGet(`/api/admin/payment-submissions?${countQs}`);
      }));
      return { all: result[0].total ?? 0, pending_review: result[1].total ?? 0, approved: result[2].total ?? 0, rejected: result[3].total ?? 0 };
    },
  });
  const displayItems = items.filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [custLabel(it), it.sender_name, it.line_user_id, it.parsed_reference_no, it.parsed_bank_name].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkApprove = useMut(
    async () => { await apiSend("/api/admin/payment-submissions/bulk-approve", "POST", { ids: [...sel] }); },
    { success: "อนุมัติที่เลือกแล้ว", invalidate: ["subs", "sub", "due-today", "overdue", "subs-pending"] }
  );
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT));
  const detail = useQuery({
    queryKey: ["sub", selId],
    queryFn: () => apiGet(`/api/admin/payment-submissions/${selId}`),
    enabled: !!selId,
  });

  const inv = ["subs", "sub", "due-today", "overdue", "subs-pending"];
  const doMatch = useMut((b: { id: string; inst: string }) =>
    apiSend(`/api/admin/payment-submissions/${b.id}/match-installment`, "PATCH", { bill_installment_id: b.inst }),
    { success: "ผูกงวดแล้ว", invalidate: inv }
  );
  const approve = useMut((id: string) => apiSend(`/api/admin/payment-submissions/${id}/approve`, "POST"), {
    success: "อนุมัติแล้ว ✅", invalidate: inv,
  });
  const reject = useMut((b: { id: string; reason: string }) =>
    apiSend(`/api/admin/payment-submissions/${b.id}/reject`, "POST", { reason: b.reason }), {
    success: "ปฏิเสธแล้ว", invalidate: inv,
  });

  const approveOne = async (id: string, message: string) => {
    if (await confirm({ title: "ยืนยันอนุมัติสลิป", message, confirmLabel: "อนุมัติ", destructive: false })) approve.mutate(id);
  };
  const approveBulk = async () => {
    if (await confirm({ title: "ยืนยันอนุมัติสลิปที่เลือก", message: `อนุมัติ ${sel.size} สลิปที่เลือก?`, confirmLabel: "อนุมัติ", destructive: false })) {
      bulkApprove.mutate(undefined as any, { onSuccess: () => setSel(new Set()) });
    }
  };
  const rejectOne = async (id: string) => {
    const reason = await prompt({ title: "เหตุผลที่ปฏิเสธ", message: "กรุณาระบุเหตุผลก่อนปฏิเสธสลิป", placeholder: "เหตุผลที่ปฏิเสธ", confirmLabel: "ปฏิเสธ" });
    if (reason?.trim()) reject.mutate({ id, reason: reason.trim() });
  };

  const s = detail.data?.submission;
  const cands: any[] = detail.data?.candidate_installments ?? [];

  const allSel = displayItems.length > 0 && displayItems.every((it) => sel.has(it.id));
  const exportCsv = () => {
    const header = ["ลูกค้า", "ประเภท", "ยอด", "วันโอน", "จับคู่", "ตรวจสอบ"];
    const body = displayItems.map((it) => [custLabel(it), it.doc_type === "cash" ? "บิลเงินสด" : "สลิป", it.parsed_amount, it.parsed_transfer_date, statusTh(it.match_status), statusTh(it.review_status)]);
    const csv = [header, ...body].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "payment-submissions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const reviewTabs = [
    { id: "", label: "ทั้งหมด", count: submissionCounts.data?.all ?? list.data?.total ?? 0 },
    { id: "pending_review", label: "รอตรวจสอบ", count: submissionCounts.data?.pending_review ?? 0 },
    { id: "approved", label: "อนุมัติแล้ว", count: submissionCounts.data?.approved ?? 0 },
    { id: "rejected", label: "ปฏิเสธ", count: submissionCounts.data?.rejected ?? 0 },
  ];
  const columns: Column<any>[] = [
    { key: "sel", header: <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(displayItems.map((it) => it.id)))} aria-label="เลือกทั้งหมด" />, stop: true, className: "w-10",
      cell: (it) => <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} aria-label={`เลือก ${custLabel(it)}`} /> },
    { key: "cust", header: "ลูกค้า", sortValue: custLabel, cell: (it) => (
      <span>
        {custLabel(it)}
        {it.line_group_id && <Badge variant="secondary" className="ml-1">กลุ่ม</Badge>}
        {it.line_group_id && it.sender_name && <span className="ml-1 text-xs text-muted-foreground">ส่งโดย {it.sender_name}</span>}
      </span>
    ) },
    { key: "type", header: "ประเภท", sortValue: (it) => it.doc_type ?? "", cell: (it) => it.doc_type === "cash" ? <Badge variant="warning">บิลเงินสด</Badge> : it.doc_type === "slip" ? <Badge variant="secondary">สลิป</Badge> : <span className="text-muted-foreground">—</span> },
    { key: "amt", header: "ยอด", align: "right", sortValue: (it) => Number(it.parsed_amount) || 0, cell: (it) => <span className="fig">{baht(it.parsed_amount)}</span> },
    { key: "date", header: "วันโอน", sortValue: (it) => it.parsed_transfer_date ?? "", cell: (it) => <span className="fig">{thDate(it.parsed_transfer_date)}</span> },
    { key: "match", header: "จับคู่", sortValue: (it) => it.match_status, cell: (it) => matchBadge(it.match_status) },
    { key: "review", header: "ตรวจสอบ", sortValue: (it) => it.review_status, cell: (it) => reviewBadge(it.review_status) },
    { key: "act", header: "", stop: true, cell: (it) => {
      // One-click approve when the slip is already matched and still pending.
      const canApprove = canWrite && it.review_status === "pending_review" && (it.match_status === "auto_matched" || it.match_status === "admin_matched");
      return (
        <div className="flex justify-end gap-1">
          {canApprove && <Button size="icon" variant="success" className="h-8 w-8" disabled={approve.isPending} onClick={() => void approveOne(it.id, "อนุมัติสลิปนี้? จะสร้าง payment + ส่ง LINE")} aria-label="อนุมัติ" title="อนุมัติ"><Check className="h-4 w-4" /></Button>}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSelId(it.id); setInstId(""); }} aria-label="ตรวจรายละเอียด" title="ตรวจรายละเอียด"><Eye className="h-4 w-4" /></Button>
        </div>
      );
    } },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อลูกค้า ผู้ส่ง หรือเลขอ้างอิง" className="h-11 pl-10 pr-10" aria-label="ค้นหารายการสลิป" />
              {search && <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="ล้างคำค้น"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className="h-4 w-4" /> ตัวกรอง{(match || docType || ocr || from || to) && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">{[match, docType, ocr, from, to].filter(Boolean).length}</span>}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={exportCsv} disabled={!displayItems.length}><Download className="h-4 w-4" /> Export</Button>
              {canWrite && sel.size > 0 && <Button type="button" variant="success" className="h-11" disabled={bulkApprove.isPending} onClick={() => void approveBulk()}><Check className="h-4 w-4" /> อนุมัติที่เลือก ({sel.size})</Button>}
            </div>
          </div>

          <div className="flex overflow-x-auto rounded-xl border border-border p-1">
            {reviewTabs.map((item) => <button key={item.id || "all"} type="button" onClick={() => { setReviewDraft(item.id); setReview(item.id); setPage(1); setSel(new Set()); }} className={`min-w-[135px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${review === item.id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{item.label} <span className="ml-1 text-xs opacity-70">({item.count})</span></button>)}
          </div>

          {filtersOpen && <div className="grid grid-cols-1 gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <Field label="สถานะจับคู่"><Select value={matchDraft} onChange={(e) => setMatchDraft(e.target.value)}><option value="">ทั้งหมด</option>{MATCH.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}</Select></Field>
            <Field label="สถานะตรวจสอบ"><Select value={reviewDraft} onChange={(e) => setReviewDraft(e.target.value)}><option value="">ทั้งหมด</option>{REVIEW.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}</Select></Field>
            <Field label="ประเภท"><Select value={docTypeDraft} onChange={(e) => setDocTypeDraft(e.target.value)}><option value="">ทั้งหมด</option><option value="slip">สลิป</option><option value="cash">บิลเงินสด</option></Select></Field>
            <Field label="สถานะ OCR"><Select value={ocrDraft} onChange={(e) => setOcrDraft(e.target.value)}><option value="">ทั้งหมด</option>{OCR.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}</Select></Field>
            <Field label="ตั้งแต่วันที่"><Input type="date" value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} /></Field>
            <Field label="ถึงวันที่"><Input type="date" value={toDraft} onChange={(e) => setToDraft(e.target.value)} /></Field>
            <Button type="button" className="h-[42px]" onClick={applyFilters} disabled={list.isFetching}><Search className="h-4 w-4" /> ค้นหา</Button>
            <Button type="button" variant="ghost" className="h-[42px]" onClick={() => { setMatchDraft(""); setDocTypeDraft(""); setOcrDraft(""); setFromDraft(""); setToDraft(""); setMatch(""); setDocType(""); setOcr(""); setFrom(""); setTo(""); setPage(1); }}>ล้างตัวกรอง</Button>
          </div>}

          <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>แสดง {displayItems.length} จาก {list.data?.total ?? 0} รายการ</span>{search && <span>ค้นหาเฉพาะรายการหน้านี้</span>}</div>
        </CardContent>
        <div className="border-t border-border">
          <DataTable data={displayItems} columns={columns} rowKey={(it) => it.id} initialSort={{ key: "date", dir: "desc" }} empty="ไม่มีสลิปตามตัวกรองนี้" loading={list.isLoading} maxHeight="60vh" />
          {pages > 1 && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button></div>}
        </div>
      </Card>

      <Dialog open={!!selId} onClose={() => setSelId(null)} title="รายละเอียดสลิป" className="max-w-2xl">
        {!s ? (
          <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-1 max-w-xl min-[420px]:grid-cols-2">
              <span className="text-muted-foreground">ผู้ส่ง</span><span>{s.sender_name || s.customer?.display_name || s.line_user_id || "—"}</span>
              <span className="text-muted-foreground">รหัสลูกค้า</span><span className="fig">{s.customer?.customer_code || "—"}</span>
              <span className="text-muted-foreground">LINE user ID</span><span className="fig break-all">{s.line_user_id || "—"}</span>
              {s.line_group_id && <><span className="text-muted-foreground">กลุ่ม LINE</span><span className="fig break-all">{s.line_group_id}</span></>}
              <span className="text-muted-foreground">ประเภท</span><span>{s.doc_type === "cash" ? <Badge variant="warning">บิลเงินสด</Badge> : s.doc_type === "slip" ? <Badge variant="secondary">สลิป</Badge> : "—"}</span>
              <span className="text-muted-foreground">ยอด (OCR)</span><span className="fig">{baht(s.parsed_amount)}</span>
              <span className="text-muted-foreground">วันโอน</span><span className="fig">{thDate(s.parsed_transfer_date)}</span>
              <span className="text-muted-foreground">เลขอ้างอิง</span><span>{s.parsed_reference_no ?? "—"}</span>
              <span className="text-muted-foreground">ธนาคาร</span><span>{s.parsed_bank_name ?? "—"}</span>
              <span className="text-muted-foreground">การจับคู่</span><span>{matchBadge(s.match_status)} {s.match_reason}</span>
              <span className="text-muted-foreground">การตรวจสอบ</span><span>{reviewBadge(s.review_status)}</span>
            </div>
            {s.image_url ? <SlipImage id={s.id} imageUrl={s.image_url} /> : <p className="text-xs text-muted-foreground">{s.image_purged_at ? "รูปสลิปถูกลบตามนโยบายการเก็บรักษาไฟล์" : "ไม่มีไฟล์สลิปต้นฉบับ"}</p>}
            {canWrite ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={instId} onChange={(e) => setInstId(e.target.value)} className="w-full sm:w-96" disabled={!cands.length}>
                  <option value="">{cands.length ? "— เลือกงวด —" : "ไม่มีงวด candidate"}</option>
                  {cands.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.bill_plan?.customer ? `${c.bill_plan.customer.display_name || c.bill_plan.customer.customer_code} · ` : ""}บิล {c.bill_plan?.bill_no} งวด {c.installment_no} • ครบ {thDate(c.due_date)} • {baht(c.amount_due)} บาท ({statusTh(c.status)})
                    </option>
                  ))}
                </Select>
                <Button size="sm" disabled={!instId} onClick={() => doMatch.mutate({ id: s.id, inst: instId })}>ผูกงวด</Button>
                <Button size="sm" variant="success" onClick={() => void approveOne(s.id, "ยืนยันอนุมัติ? จะสร้าง payment + ส่ง LINE")}>อนุมัติ ✅</Button>
                <Button size="sm" variant="destructive" onClick={() => void rejectOne(s.id)}>ปฏิเสธ</Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">สิทธิ์ viewer — ดูได้อย่างเดียว</p>
            )}
            {s.matched_installment_id && (
              <p className="text-primary">
                ผูกกับงวดแล้ว{s.matched_installment ? ` — บิล ${s.matched_installment.bill_plan?.bill_no ?? "—"} งวด ${s.matched_installment.installment_no}` : ""}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
