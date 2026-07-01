import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

export const matchBadge = (s: string) => (
  <Badge variant={s === "auto_matched" || s === "admin_matched" ? "success" : s === "rejected" ? "destructive" : "warning"}>
    {s}
  </Badge>
);
export const reviewBadge = (s: string) => (
  <Badge variant={s === "approved" ? "success" : s === "rejected" ? "destructive" : "secondary"}>{s}</Badge>
);
export const statusBadge = (s: string) => (
  <Badge variant={s === "completed" || s === "paid" ? "success" : s === "cancelled" ? "secondary" : "outline"}>{s}</Badge>
);

export const FOLLOW_UP_STATUSES = ["new", "contacted", "promised_to_pay", "dispute", "unreachable", "resolved"] as const;
export const followUpBadge = (s: string) => (
  <Badge variant={s === "resolved" ? "success" : s === "dispute" || s === "unreachable" ? "destructive" : s === "promised_to_pay" ? "warning" : "secondary"}>
    {s}
  </Badge>
);
