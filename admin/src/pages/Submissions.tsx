import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, matchBadge, reviewBadge } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const MATCH = ["unmatched", "auto_matched", "needs_admin_match", "admin_matched", "rejected"];
const REVIEW = ["pending_review", "approved", "rejected"];

export function Submissions() {
  const { canWrite } = useAuth();
  const [match, setMatch] = useState("");
  const [review, setReview] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [instId, setInstId] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const qs = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
  if (match) qs.set("match_status", match);
  if (review) qs.set("review_status", review);

  const list = useQuery({
    queryKey: ["subs", match, review, page],
    queryFn: () => apiGet(`/api/admin/payment-submissions?${qs}`),
  });
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

  return (
    <>
      <Card>
        <CardHeader><CardTitle>ตัวกรอง</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={match} onChange={(e) => { setMatch(e.target.value); setPage(1); }} className="w-52">
            <option value="">match: ทั้งหมด</option>
            {MATCH.map((m) => <option key={m}>{m}</option>)}
          </Select>
          <Select value={review} onChange={(e) => { setReview(e.target.value); setPage(1); }} className="w-52">
            <option value="">review: ทั้งหมด</option>
            {REVIEW.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>สลิป ({list.data?.total ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>ลูกค้า</TH><TH>ยอด</TH><TH>วันโอน</TH><TH>match</TH><TH>review</TH><TH></TH></TR></THead>
            <TBody>
              {(list.data?.items ?? []).map((it: any) => (
                <TR key={it.id}>
                  <TD>
                    {it.customer?.display_name || it.customer?.customer_code || (it.line_group_id ? "" : it.line_user_id) || "—"}
                    {it.line_group_id && <Badge variant="secondary" className="ml-1">กลุ่ม</Badge>}
                    {it.line_group_id && it.sender_name && <span className="ml-1 text-xs text-muted-foreground">ส่งโดย {it.sender_name}</span>}
                  </TD>
                  <TD>{it.parsed_amount ?? "—"}</TD>
                  <TD>{it.parsed_transfer_date ?? "—"}</TD>
                  <TD>{matchBadge(it.match_status)}</TD>
                  <TD>{reviewBadge(it.review_status)}</TD>
                  <TD><Button size="sm" variant="outline" onClick={() => { setSelId(it.id); setInstId(""); }}>ตรวจ</Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
              <span>{page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {s && (
        <Card>
          <CardHeader><CardTitle>รายละเอียดสลิป</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-1 max-w-xl">
              {s.line_group_id && <><span className="text-muted-foreground">ส่งโดย (กลุ่ม)</span><span>{s.sender_name || s.line_user_id || "—"}</span></>}
              <span className="text-muted-foreground">ยอด (OCR)</span><span>{s.parsed_amount ?? "—"}</span>
              <span className="text-muted-foreground">วันโอน</span><span>{s.parsed_transfer_date ?? "—"}</span>
              <span className="text-muted-foreground">ref</span><span>{s.parsed_reference_no ?? "—"}</span>
              <span className="text-muted-foreground">ธนาคาร</span><span>{s.parsed_bank_name ?? "—"}</span>
              <span className="text-muted-foreground">match</span><span>{matchBadge(s.match_status)} {s.match_reason}</span>
              <span className="text-muted-foreground">review</span><span>{reviewBadge(s.review_status)}</span>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={instId} onChange={(e) => setInstId(e.target.value)} className="w-full sm:w-96" disabled={!cands.length}>
                  <option value="">{cands.length ? "— เลือกงวด —" : "ไม่มีงวด candidate"}</option>
                  {cands.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.bill_plan?.customer ? `${c.bill_plan.customer.display_name || c.bill_plan.customer.customer_code} · ` : ""}บิล {c.bill_plan?.bill_no} งวด {c.installment_no} • {c.due_date} • {c.amount_due} ({c.status})
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
            {s.matched_installment_id && <p className="text-green-700">ผูกกับงวด: {s.matched_installment_id}</p>}
          </CardContent>
        </Card>
      )}
    </>
  );
}
