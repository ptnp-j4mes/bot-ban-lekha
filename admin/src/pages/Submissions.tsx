import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend, apiRaw } from "@/lib/api";
import { useMut, matchBadge, reviewBadge, statusTh } from "@/lib/ui";
import { baht, thDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";

const MATCH = ["unmatched", "auto_matched", "needs_admin_match", "admin_matched", "rejected"];
const REVIEW = ["pending_review", "approved", "rejected"];
const OCR = ["processing", "success", "failed"];

// Slip stored on server disk — fetch with auth headers, show as blob (plain <img src> can't send the token).
function SlipImage({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    apiRaw(`/api/admin/payment-submissions/${id}/image`).then(async (r) => {
      if (!r.ok) return;
      url = URL.createObjectURL(await r.blob());
      setSrc(url);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (!src) return null;
  return <img src={src} alt="สลิป" className="max-h-80 rounded-lg border border-border" />;
}

export function Submissions() {
  const { canWrite } = useAuth();
  const [match, setMatch] = useState("");
  // Reviewing pending slips is the page's job — land there by default.
  const [review, setReview] = useState("pending_review");
  const [docType, setDocType] = useState("");
  const [ocr, setOcr] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [instId, setInstId] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const LIMIT = 20;

  const qs = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (match) qs.set("match_status", match);
  if (review) qs.set("review_status", review);
  if (docType) qs.set("doc_type", docType);
  if (ocr) qs.set("ocr_status", ocr);
  if (from) qs.set("date_from", from);
  if (to) qs.set("date_to", to);

  const list = useQuery({
    queryKey: ["subs", match, review, docType, ocr, from, to, page],
    queryFn: () => apiGet(`/api/admin/payment-submissions?${qs}`),
  });
  const items: any[] = list.data?.items ?? [];

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

  const s = detail.data?.submission;
  const cands: any[] = detail.data?.candidate_installments ?? [];

  const custLabel = (it: any) => it.customer?.display_name || it.customer?.customer_code || (it.line_group_id ? "" : it.line_user_id) || "—";
  const allSel = items.length > 0 && items.every((it) => sel.has(it.id));
  const columns: Column<any>[] = [
    { key: "sel", header: <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(items.map((it) => it.id)))} aria-label="เลือกทั้งหมด" />, stop: true,
      cell: (it) => <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggleSel(it.id)} aria-label="เลือก" /> },
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
          {canApprove && <Button size="sm" variant="success" disabled={approve.isPending} onClick={() => { if (confirm("อนุมัติสลิปนี้? จะสร้าง payment + ส่ง LINE")) approve.mutate(it.id); }}>อนุมัติ</Button>}
          <Button size="sm" variant="outline" onClick={() => { setSelId(it.id); setInstId(""); }}>ตรวจ</Button>
        </div>
      );
    } },
  ];

  return (
    <>
      <Card>
        <CardHeader><CardTitle>ตัวกรอง</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="สถานะจับคู่">
            <Select value={match} onChange={(e) => { setMatch(e.target.value); setPage(1); }}>
              <option value="">ทั้งหมด</option>
              {MATCH.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}
            </Select>
          </Field>
          <Field label="สถานะตรวจสอบ">
            <Select value={review} onChange={(e) => { setReview(e.target.value); setPage(1); }}>
              <option value="">ทั้งหมด</option>
              {REVIEW.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}
            </Select>
          </Field>
          <Field label="ประเภท">
            <Select value={docType} onChange={(e) => { setDocType(e.target.value); setPage(1); }}>
              <option value="">ทั้งหมด</option>
              <option value="slip">สลิป</option>
              <option value="cash">บิลเงินสด</option>
            </Select>
          </Field>
          <Field label="สถานะ OCR">
            <Select value={ocr} onChange={(e) => { setOcr(e.target.value); setPage(1); }}>
              <option value="">ทั้งหมด</option>
              {OCR.map((m) => <option key={m} value={m}>{statusTh(m)}</option>)}
            </Select>
          </Field>
          <Field label="ตั้งแต่วันที่"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
          <Field label="ถึงวันที่"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>สลิป ({list.data?.total ?? 0})</CardTitle>
          {canWrite && sel.size > 0 && (
            <Button size="sm" variant="success" className="ml-auto" disabled={bulkApprove.isPending}
              onClick={() => { if (confirm(`อนุมัติ ${sel.size} สลิปที่เลือก?`)) bulkApprove.mutate(undefined as any, { onSuccess: () => setSel(new Set()) }); }}>
              อนุมัติที่เลือก ({sel.size})
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <DataTable data={items} columns={columns} rowKey={(it) => it.id} initialSort={{ key: "date", dir: "desc" }} empty="ไม่มีสลิปตามตัวกรองนี้" loading={list.isLoading} />
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
              <span>{page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selId} onClose={() => setSelId(null)} title="รายละเอียดสลิป" className="max-w-2xl">
        {!s ? (
          <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-1 max-w-xl">
              {s.line_group_id && <><span className="text-muted-foreground">ส่งโดย (กลุ่ม)</span><span>{s.sender_name || s.line_user_id || "—"}</span></>}
              <span className="text-muted-foreground">ประเภท</span><span>{s.doc_type === "cash" ? <Badge variant="warning">บิลเงินสด</Badge> : s.doc_type === "slip" ? <Badge variant="secondary">สลิป</Badge> : "—"}</span>
              <span className="text-muted-foreground">ยอด (OCR)</span><span className="fig">{baht(s.parsed_amount)}</span>
              <span className="text-muted-foreground">วันโอน</span><span className="fig">{thDate(s.parsed_transfer_date)}</span>
              <span className="text-muted-foreground">เลขอ้างอิง</span><span>{s.parsed_reference_no ?? "—"}</span>
              <span className="text-muted-foreground">ธนาคาร</span><span>{s.parsed_bank_name ?? "—"}</span>
              <span className="text-muted-foreground">การจับคู่</span><span>{matchBadge(s.match_status)} {s.match_reason}</span>
              <span className="text-muted-foreground">การตรวจสอบ</span><span>{reviewBadge(s.review_status)}</span>
              {s.image_url?.startsWith("http") && <><span className="text-muted-foreground">รูปสลิป</span><a href={s.image_url} target="_blank" rel="noreferrer" className="text-[hsl(var(--sage))] underline underline-offset-2">เปิดรูปสลิป</a></>}
            </div>
            {s.image_url && !s.image_url.startsWith("http") && <SlipImage id={s.id} />}
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
                <Button size="sm" variant="success" onClick={() => { if (confirm("ยืนยันอนุมัติ? จะสร้าง payment + ส่ง LINE")) approve.mutate(s.id); }}>อนุมัติ ✅</Button>
                <Button size="sm" variant="destructive" onClick={() => { const r = prompt("เหตุผลที่ปฏิเสธ:"); if (r) reject.mutate({ id: s.id, reason: r }); }}>ปฏิเสธ</Button>
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
