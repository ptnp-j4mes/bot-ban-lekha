import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, CircleAlert, Crown, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { clearLiffToken, liffGet, liffPost, setLiffToken } from "./api";
import { TABS, unpaidInstallments, type Balance, type CustomerData, type Installment, type PaymentHistory, type Tab } from "./model";
import { LiffSessionError, loadCustomerData, type CustomerApi, type LiffSdk, type Session, type SessionProblem } from "./session";
import { BalanceHero, EmptyState, InstallmentCard, LoadingState, NextDueCard, PaymentHistoryItem } from "./components";
import "./styles/liff.css";

declare global { interface Window { liff?: LiffSdk; } }

const api: CustomerApi = {
  clearToken: clearLiffToken, setToken: setLiffToken,
  createSession: (idToken, oaId, signal) => liffPost<Session>("/api/liff/session", { id_token: idToken, oa_id: oaId }, signal),
  getBalance: (signal) => liffGet<Balance>("/api/liff/me/balance", signal),
  getInstallments: (signal) => liffGet<Installment[]>("/api/liff/me/installments", signal),
  getPayments: (signal) => liffGet<PaymentHistory[]>("/api/liff/me/payments", signal),
};
type Problem = SessionProblem | "error";
type State = { stage: "loading" } | { stage: "ready"; data: CustomerData } | { stage: Problem };
const problems: Record<Problem, { title: string; description: string }> = {
  not_configured: { title: "ลิงก์นี้ยังไม่พร้อมใช้งาน", description: "กรุณาเปิดจากเมนูใน LINE อีกครั้ง หากยังเปิดไม่ได้ กรุณาติดต่อแอดมินเพื่อตรวจสอบการตั้งค่า LIFF ค่ะ" },
  sdk_unavailable: { title: "เชื่อมต่อ LINE ไม่สำเร็จ", description: "กรุณาตรวจสอบอินเทอร์เน็ต แล้วปิดหน้านี้และเปิดใหม่จากเมนูใน LINE ค่ะ" },
  not_linked: { title: "ยังไม่พบข้อมูลลูกค้าของคุณ", description: "บัญชี LINE นี้ยังไม่ได้ผูกกับข้อมูลลูกค้า หรือบัญชียังไม่พร้อมใช้งาน กรุณาติดต่อแอดมินค่ะ" },
  unauthorized: { title: "กรุณายืนยันตัวตนอีกครั้ง", description: "การเชื่อมต่อหมดอายุหรือยังไม่ได้รับสิทธิ์ กรุณาลองใหม่ หรือเปิดหน้านี้จากเมนูใน LINE อีกครั้งค่ะ" },
  error: { title: "โหลดข้อมูลไม่สำเร็จ", description: "กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง ระบบยังไม่ได้เปลี่ยนแปลงข้อมูลการชำระเงินของคุณค่ะ" },
};
const PAGE_SIZE = 10;

export function LiffApp() {
  const [state, setState] = useState<State>({ stage: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("unpaid");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showGuide, setShowGuide] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ stage: "loading" });
    loadCustomerData({ sdk: window.liff, liffId: import.meta.env.VITE_LIFF_ID, getSearch: () => window.location.search, api, signal: controller.signal })
      .then((data) => { if (data && !controller.signal.aborted) setState({ stage: "ready", data }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Cancel sibling requests and discard private data, rather than presenting zero balances.
        controller.abort();
        clearLiffToken();
        const failure = error as { status?: number; code?: string };
        const stage = error instanceof LiffSessionError ? error.kind
          : failure?.status === 401 || failure?.code === "UNAUTHORIZED" ? "unauthorized" : "error";
        setState({ stage });
      });
    return () => controller.abort();
  }, [attempt]);

  const selectTab = (next: Tab) => { setTab(next); setLimit(PAGE_SIZE); };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
      : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
    if (next === -1) return;
    event.preventDefault(); selectTab(TABS[next].id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#liff-tab-${TABS[next].id}`)?.focus();
  };
  const returnToLine = () => {
    if (window.liff?.isInClient()) {
      try { window.liff.closeWindow(); return; } catch { /* Show manual instructions below. */ }
    }
    setShowGuide(true);
  };
  const viewInstallments = () => {
    selectTab("unpaid");
    tabsRef.current?.scrollIntoView({ block: "start" });
    tabsRef.current?.querySelector<HTMLButtonElement>("#liff-tab-unpaid")?.focus({ preventScroll: true });
  };
  const data = state.stage === "ready" ? state.data : null;
  const unpaid = data ? unpaidInstallments(data.installments) : [];
  const rows = tab === "unpaid" ? unpaid : data?.installments ?? [];
  const count = tab === "history" ? data?.payments.length ?? 0 : rows.length;
  const name = data?.customer.display_name?.trim() || data?.customer.customer_code || "ลูกค้า";
  const problem = state.stage !== "ready" && state.stage !== "loading" ? problems[state.stage] : null;

  return (
    <div className="liff-app">
      <main className="liff-shell">
        <header className="liff-header">
          <div className="liff-brand"><span className="liff-brand-mark"><Crown size={21} aria-hidden="true" /></span><span>บ้านเลขา<small>ดูแลทุกบิลของคุณ</small></span></div>
          <button type="button" className="liff-icon-button" aria-label="รีเฟรชข้อมูล" disabled={state.stage === "loading"} onClick={() => { setLimit(PAGE_SIZE); setAttempt((value) => value + 1); }}><RefreshCw size={19} aria-hidden="true" /></button>
        </header>
        {state.stage === "loading" && <LoadingState />}
        {problem && <section className="liff-problem" role="alert"><span className="liff-empty-icon"><CircleAlert size={28} aria-hidden="true" /></span><h1>{problem.title}</h1><p>{problem.description}</p><button type="button" className="liff-button liff-button--outline" onClick={() => state.stage === "sdk_unavailable" ? window.location.reload() : setAttempt((value) => value + 1)}>ลองอีกครั้ง</button></section>}
        {data && <>
          <div className="liff-greeting"><div><p>สวัสดีค่ะ</p><h1>{name}</h1><span>รหัสลูกค้า {data.customer.customer_code}</span></div><span className="liff-avatar" aria-hidden="true">{name.slice(0, 1)}</span></div>
          <BalanceHero balance={data.balance} />
          <NextDueCard date={data.balance.next_due_date} onView={viewInstallments} />
          <section className="liff-records" aria-label="รายการบิลและประวัติ">
            <div className="liff-tabs" ref={tabsRef} role="tablist" aria-label="เลือกรายการ">
              {TABS.map((entry) => <button key={entry.id} type="button" id={`liff-tab-${entry.id}`} role="tab" aria-controls="liff-panel" aria-selected={tab === entry.id} tabIndex={tab === entry.id ? 0 : -1} onClick={() => selectTab(entry.id)} onKeyDown={onTabKeyDown}>{entry.label}</button>)}
            </div>
            <div id="liff-panel" role="tabpanel" aria-labelledby={`liff-tab-${tab}`} tabIndex={0}>
              <div className="liff-list-heading"><h2>{tab === "history" ? "ประวัติการชำระ" : tab === "all" ? "รายการงวดทั้งหมด" : "รายการที่ยังไม่ชำระ"}</h2><span>{count} รายการ</span></div>
              {tab === "unpaid" && count > 0 && <p className="liff-list-note">เรียงตามวันครบกำหนด · รวมงวดที่ยังไม่ถึงกำหนด</p>}
              {tab === "history" && <p className="liff-list-note">แสดงเฉพาะรายการที่ได้รับการอนุมัติแล้ว</p>}
              {count === 0 ? <EmptyState title={tab === "history" ? "ยังไม่มีประวัติการชำระ" : tab === "unpaid" ? "ไม่มีรายการที่ยังไม่ชำระ" : "ยังไม่มีรายการงวด"} description={tab === "history" ? "รายการจะแสดงที่นี่หลังตรวจสอบและอนุมัติสลิปแล้วค่ะ" : "หากมีข้อสงสัย สามารถสอบถามแอดมินในแชท LINE ได้เลยค่ะ"} /> : <div className="liff-list">
                {tab === "history" ? data.payments.slice(0, limit).map((item) => <PaymentHistoryItem key={item.id} item={item} />) : rows.slice(0, limit).map((item) => <InstallmentCard key={item.id} item={item} />)}
              </div>}
              {count > limit && <button className="liff-button liff-button--outline liff-load-more" type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)}>แสดงเพิ่มอีก {Math.min(PAGE_SIZE, count - limit)} รายการ</button>}
            </div>
          </section>
          <p className="liff-privacy"><ShieldCheck size={15} aria-hidden="true" />แสดงเฉพาะข้อมูลที่ผูกกับบัญชี LINE ของคุณ</p>
        </>}
      </main>
      <footer className="liff-dock"><div className="liff-dock-inner">
        <p>ชำระแล้ว? ส่งรูปสลิปในแชทได้เลยค่ะ</p>
        <button type="button" className="liff-button" onClick={returnToLine}><MessageCircle size={20} aria-hidden="true" />กลับไปส่งสลิปใน LINE<ArrowLeft size={18} aria-hidden="true" /></button>
        {showGuide && <p className="liff-guide" role="status">เปิดแอป LINE กลับไปที่แชทของร้าน แล้วส่งรูปสลิปโอนเงินให้แอดมินได้เลยค่ะ หน้านี้ยังไม่รองรับการอัปโหลดสลิปโดยตรง</p>}
      </div></footer>
    </div>
  );
}
