import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Badge } from "@/components/ui/badge";

// Thin mutation wrapper: toast on success/error + invalidate the given query keys.
export function useMut<T = unknown>(
  fn: (vars: T) => Promise<unknown>,
  opts: { success?: string; invalidate?: string[] } = {}
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (opts.success) toast.success(opts.success);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// Thai labels for every backend status value shown in the UI.
export const STATUS_TH: Record<string, string> = {
  // match
  unmatched: "ยังไม่จับคู่",
  auto_matched: "จับคู่อัตโนมัติ",
  needs_admin_match: "รอแอดมินจับคู่",
  admin_matched: "แอดมินจับคู่แล้ว",
  // review
  pending_review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  // installment / bill plan
  pending: "รอชำระ",
  partial_paid: "จ่ายบางส่วน",
  overdue: "ค้างชำระ",
  paid: "จ่ายแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  active: "ใช้งาน",
  // customer
  blocked: "ระงับ",
  closed: "ปิดบัญชี",
  // ocr
  processing: "กำลังอ่านสลิป",
  success: "อ่านสำเร็จ",
  failed: "อ่านไม่สำเร็จ",
};
export const statusTh = (s: string) => STATUS_TH[s] ?? s;

export const matchBadge = (s: string) => (
  <Badge variant={s === "auto_matched" || s === "admin_matched" ? "success" : s === "rejected" ? "destructive" : "warning"}>
    {statusTh(s)}
  </Badge>
);
export const reviewBadge = (s: string) => (
  <Badge variant={s === "approved" ? "success" : s === "rejected" ? "destructive" : "secondary"}>{statusTh(s)}</Badge>
);
export const statusBadge = (s: string) => (
  <Badge variant={s === "completed" || s === "paid" ? "success" : s === "cancelled" ? "secondary" : s === "overdue" ? "destructive" : "outline"}>{statusTh(s)}</Badge>
);
