import { CalendarDays, CheckCheck, ChevronRight, Crown, ReceiptText, ShieldCheck } from "lucide-react";
import { formatAmount, formatDate, installmentStatus, remainingAmount, type Balance, type Installment, type PaymentHistory } from "./model";

export function BalanceHero({ balance }: { balance: Balance }) {
  const settled = balance.count === 0 && balance.outstanding === 0;
  return (
    <section className="liff-hero" aria-labelledby="balance-title">
      <Crown className="liff-hero-crown" aria-hidden="true" strokeWidth={1} />
      <div className="liff-hero-eyebrow"><span className="liff-dot" /> บัญชีของฉัน</div>
      <h2 id="balance-title">ยอดคงเหลือทั้งหมด</h2>
      <div className="liff-hero-amount"><span className="liff-currency">฿</span>{formatAmount(balance.outstanding)}</div>
      <div className="liff-hero-bottom">
        <span>{settled ? "ไม่มียอดค้างชำระแล้วค่ะ" : `ยังไม่ชำระ ${balance.count} งวด`}</span>
        {settled ? <CheckCheck aria-hidden="true" size={20} /> : <span className="liff-hero-note">รวมงวดที่ยังไม่ถึงกำหนด</span>}
      </div>
    </section>
  );
}

export function NextDueCard({ date, onView }: { date: string | null; onView: () => void }) {
  if (!date) return null;
  // The balance endpoint excludes inactive plans. The installment endpoint does
  // not expose plan status, so do not invent a next-payment amount from that list.
  return (
    <button type="button" className="liff-next" onClick={onView}>
      <span className="liff-icon-tile"><CalendarDays aria-hidden="true" size={22} /></span>
      <span className="liff-next-copy"><span>กำหนดชำระใกล้ที่สุด</span><strong>{formatDate(date)}</strong></span>
      <ChevronRight aria-hidden="true" size={20} />
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const value = installmentStatus(status);
  return <span className={`liff-badge liff-badge--${value.tone}`}><span aria-hidden="true">{value.symbol}</span>{value.label}</span>;
}

export function InstallmentCard({ item }: { item: Installment }) {
  return (
    <article className="liff-installment" aria-label={`บิล ${item.bill_plan.bill_no} งวดที่ ${item.installment_no}`}>
      <div className="liff-card-top"><span className="liff-bill-number"><ReceiptText size={16} aria-hidden="true" />บิล #{item.bill_plan.bill_no}</span><StatusBadge status={item.status} /></div>
      <div className="liff-installment-main">
        <div><h3>งวดที่ {item.installment_no}</h3><p className="liff-due-date">ครบกำหนด {formatDate(item.due_date)}</p></div>
        <div className="liff-installment-amount"><span>{item.status === "cancelled" ? "ยอดงวดที่ยกเลิก" : "ยอดงวด"}</span><strong>฿{formatAmount(item.amount_due)}</strong></div>
      </div>
      {item.status !== "cancelled" && (
        <dl className="liff-breakdown">
          <div><dt>ชำระแล้ว</dt><dd>฿{formatAmount(item.amount_paid)}</dd></div>
          <div><dt>คงเหลือ</dt><dd className={remainingAmount(item) > 0 ? "liff-text-pink" : "liff-text-green"}>฿{formatAmount(remainingAmount(item))}</dd></div>
        </dl>
      )}
    </article>
  );
}

export function PaymentHistoryItem({ item }: { item: PaymentHistory }) {
  return (
    <article className="liff-payment">
      <span className="liff-payment-icon"><CheckCheck size={20} aria-hidden="true" /></span>
      <div className="liff-payment-copy"><h3>บิล #{item.bill_installment.bill_plan.bill_no} · งวดที่ {item.bill_installment.installment_no}</h3>
        <p>{item.paid_at ? "ชำระเมื่อ" : "อนุมัติเมื่อ"} {formatDate(item.paid_at ?? item.approved_at)}</p>
      </div>
      <div className="liff-payment-amount"><strong>฿{formatAmount(item.amount)}</strong><span>อนุมัติแล้ว</span></div>
    </article>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="liff-empty" role="status">
      <span className="liff-empty-icon"><ReceiptText size={28} aria-hidden="true" /></span>
      <h3>{title}</h3><p>{description}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="liff-loading" role="status" aria-live="polite" aria-busy="true">
      <p><ShieldCheck size={18} aria-hidden="true" />กำลังโหลดข้อมูลของคุณ…</p>
      <div className="liff-skeleton liff-skeleton--hero" aria-hidden="true" />
      <div className="liff-skeleton liff-skeleton--next" aria-hidden="true" />
      <div className="liff-skeleton liff-skeleton--card" aria-hidden="true" />
      <div className="liff-skeleton liff-skeleton--card" aria-hidden="true" />
    </div>
  );
}
