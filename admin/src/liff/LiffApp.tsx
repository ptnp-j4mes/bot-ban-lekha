import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { liffGet, liffPost, getLiffToken, setLiffToken } from "./api";

declare global {
  interface Window {
    liff?: any;
  }
}

type Balance = { outstanding: number; count: number; next_due_date: string | null };
type Installment = {
  id: string;
  installment_no: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  bill_plan: { bill_no: number };
};
type PaymentHistory = {
  id: string;
  amount: number;
  paid_at: string | null;
  payment_method: string;
  approved_at: string;
  bill_installment: { installment_no: number; bill_plan: { bill_no: number } };
};

const fmtAmount = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "-";

const STATUS_LABEL: Record<string, string> = {
  pending: "รอชำระ",
  partial_paid: "ชำระบางส่วน",
  overdue: "เกินกำหนด",
  paid: "ชำระแล้ว",
};

function getOaId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("oa");
}

type Stage = "loading" | "not_in_line" | "not_configured" | "not_linked" | "error" | "ready";

export function LiffApp() {
  const [stage, setStage] = useState<Stage>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<PaymentHistory[]>([]);

  useEffect(() => {
    (async () => {
      const oaId = getOaId();
      const liffId = import.meta.env.VITE_LIFF_ID as string | undefined;
      if (!liffId || !oaId) {
        setStage("not_configured");
        return;
      }
      if (!window.liff) {
        setStage("not_in_line");
        return;
      }

      try {
        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) {
          window.liff.login();
          return; // page redirects into LINE login; this render is done
        }
        const idToken = window.liff.getIDToken();
        if (!idToken) throw new Error("no id token");

        let token = getLiffToken();
        if (!token) {
          const session = await liffPost<{ token: string; customer: { customer_code: string; display_name: string | null } }>(
            "/api/liff/session",
            { id_token: idToken, oa_id: oaId }
          );
          token = session.token;
          setLiffToken(token);
          setDisplayName(session.customer.display_name ?? session.customer.customer_code);
        }

        const [b, i, p] = await Promise.all([
          liffGet<Balance>("/api/liff/me/balance"),
          liffGet<Installment[]>("/api/liff/me/installments"),
          liffGet<PaymentHistory[]>("/api/liff/me/payments"),
        ]);
        setBalance(b);
        setInstallments(i);
        setPayments(p);
        setStage("ready");
      } catch (e: any) {
        if (e?.code === "NOT_FOUND") {
          setStage("not_linked");
        } else {
          setErrorMsg(e?.message || "เกิดข้อผิดพลาด");
          setStage("error");
        }
      }
    })();
  }, []);

  if (stage === "loading") {
    return (
      <Center>
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล…</p>
      </Center>
    );
  }

  if (stage === "not_in_line" || stage === "not_configured") {
    return (
      <Center>
        <p className="text-sm text-muted-foreground">กรุณาเปิดหน้านี้ผ่านแอป LINE ค่ะ</p>
      </Center>
    );
  }

  if (stage === "not_linked") {
    return (
      <Center>
        <p className="text-base font-semibold text-foreground">ยังไม่พบข้อมูลลูกค้าของคุณ</p>
        <p className="mt-2 text-sm text-muted-foreground">บัญชี LINE นี้ยังไม่ได้ผูกกับข้อมูลลูกค้า กรุณาติดต่อแอดมินของคุณค่ะ 🙏</p>
      </Center>
    );
  }

  if (stage === "error") {
    return (
      <Center>
        <p className="text-sm text-destructive">{errorMsg}</p>
      </Center>
    );
  }

  const nextUnpaid = installments.find((i) => i.status !== "paid");

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4 pb-10">
      <header className="pt-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">สวัสดีค่ะ</div>
        <h1 className="font-head text-xl font-bold tracking-tight">{displayName ?? "ลูกค้า"}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ยอดคงเหลือ</CardTitle>
        </CardHeader>
        <CardContent>
          {balance && balance.count === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มียอดค้างชำระ ✅ ขอบคุณค่ะ 🙏</p>
          ) : (
            <>
              <div className="fig text-3xl font-bold text-foreground">{fmtAmount(balance?.outstanding ?? 0)} บาท</div>
              <div className="mt-1 text-sm text-muted-foreground">ค้างชำระทั้งหมด {balance?.count ?? 0} งวด</div>
            </>
          )}
        </CardContent>
      </Card>

      {nextUnpaid && (
        <Card>
          <CardHeader>
            <CardTitle>งวดถัดไป</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">บิล {nextUnpaid.bill_plan.bill_no} · งวดที่ {nextUnpaid.installment_no}</div>
              <div className="fig text-lg font-semibold">{fmtAmount(nextUnpaid.amount_due - nextUnpaid.amount_paid)} บาท</div>
            </div>
            <div className="text-right text-sm font-medium text-foreground">{fmtDate(nextUnpaid.due_date)}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>รายการงวดทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-0">
          {installments.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
          {installments.map((i) => (
            <div key={i.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-b-0">
              <div>
                <div className="text-sm font-medium">บิล {i.bill_plan.bill_no} · งวดที่ {i.installment_no}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(i.due_date)}</div>
              </div>
              <div className="text-right">
                <div className="fig text-sm font-semibold">{fmtAmount(i.amount_due)} บาท</div>
                <div className={i.status === "paid" ? "text-xs text-[#059669]" : "text-xs text-muted-foreground"}>
                  {STATUS_LABEL[i.status] ?? i.status}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติการชำระ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-0">
          {payments.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">ยังไม่มีประวัติการชำระ</p>}
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-b-0">
              <div>
                <div className="text-sm font-medium">บิล {p.bill_installment.bill_plan.bill_no} · งวดที่ {p.bill_installment.installment_no}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(p.approved_at)}</div>
              </div>
              <div className="fig text-sm font-semibold text-[#059669]">{fmtAmount(p.amount)} บาท</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="px-1 text-center text-xs leading-relaxed text-muted-foreground">
        หากต้องการแจ้งชำระเงิน กรุณาส่ง "รูปสลิป" โอนเงินกลับเข้ามาในแชท LINE นี้ได้เลยค่ะ 🙏
      </p>
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">{children}</div>;
}
