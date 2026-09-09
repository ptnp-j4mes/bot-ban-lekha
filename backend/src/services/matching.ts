import { sameDay } from "../lib/date";

export type ParsedSlip = {
  amount?: number | null;
  transferDate?: Date | null;
  accountNo?: string | null;
};

export type Candidate = {
  id: string;
  amountDue: number;
  dueDate: Date;
  bankAccountNo?: string | null;
};

export type MatchCandidateInfo = {
  id: string;
  score: number;
  reason: string;
};

export type MatchDecision = {
  status: "auto_matched" | "needs_admin_match";
  installmentId: string | null;
  score: number;
  reason: string;
  // Ranked candidates (best first, top 3) so admin can see alternatives + why. May be empty.
  topCandidates: MatchCandidateInfo[];
};

const AMOUNT_EXACT_POINTS = 50;
const AMOUNT_TOLERANCE_POINTS = 35;
// Small tolerance for bank fees / rounding on the slip amount: max(20 baht, 1% of the amount due).
const amountTolerance = (amountDue: number) => Math.max(20, amountDue * 0.01);

// Date score decays with distance from due date; beyond 3 days it earns nothing.
const DATE_POINTS_BY_DIFF: Record<number, number> = { 0: 40, 1: 35, 2: 25, 3: 15 };
const DATE_TOLERANCE_DAYS = 3;

const ACCOUNT_MATCH_BONUS = 8;
const ACCOUNT_MISMATCH_PENALTY = 15;
const DUE_TODAY_BONUS = 5;

export const AUTO_MATCH_THRESHOLD = 85;
// If the 2nd-best candidate scores within this margin of the best, it's too ambiguous to auto-match.
const CLOSE_SCORE_MARGIN = 10;
// Bound combinatorics when looking for a multi-installment sum match.
const COMBO_CANDIDATE_LIMIT = 12;

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 86400000);
}

// Slips sometimes show masked account numbers (e.g. "xxx-x-x1234-5"); treat those as unknown
// rather than risk a false mismatch penalty. Otherwise strip non-digits for a loose compare.
function normalizeAccountNo(no?: string | null): string | null {
  if (!no) return null;
  if (/[x*]/i.test(no)) return null;
  const digits = no.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

// Only bypass review when the OCR facts are exact and the destination account is known.
export function isVerifiedExactMatch(slip: ParsedSlip, c: Candidate): boolean {
  const slipAccount = normalizeAccountNo(slip.accountNo);
  const candidateAccount = normalizeAccountNo(c.bankAccountNo);
  return slip.amount != null
    && slip.amount === c.amountDue
    && !!slip.transferDate
    && sameDay(slip.transferDate, c.dueDate)
    && !!slipAccount
    && slipAccount === candidateAccount;
}

// Pure scoring per spec 6.2 (v2): amount ± small tolerance, due date ± up to 3 days, and the
// destination account no as a bonus/penalty signal. same_customer is enforced by candidate
// selection upstream; reference/image uniqueness is a hard gate in decideMatch, not scored here.
export function scoreInstallment(slip: ParsedSlip, c: Candidate, ctx: { today: Date }): number {
  let score = 0;

  if (slip.amount != null) {
    const diff = Math.abs(slip.amount - c.amountDue);
    if (diff === 0) score += AMOUNT_EXACT_POINTS;
    else if (diff <= amountTolerance(c.amountDue)) score += AMOUNT_TOLERANCE_POINTS;
  }

  if (slip.transferDate) {
    const diff = daysBetween(slip.transferDate, c.dueDate);
    if (diff <= DATE_TOLERANCE_DAYS) score += DATE_POINTS_BY_DIFF[diff] ?? 0;
  }

  const slipAcct = normalizeAccountNo(slip.accountNo);
  const candAcct = normalizeAccountNo(c.bankAccountNo);
  if (slipAcct && candAcct) score += slipAcct === candAcct ? ACCOUNT_MATCH_BONUS : -ACCOUNT_MISMATCH_PENALTY;

  if (sameDay(c.dueDate, ctx.today)) score += DUE_TODAY_BONUS;

  return score;
}

// Thai-language explanation of why a candidate scored the way it did, for admin review.
export function describeCandidate(slip: ParsedSlip, c: Candidate, ctx: { today: Date }): string {
  const parts: string[] = [];

  if (slip.amount == null) parts.push("ไม่พบยอดเงินจากสลิป");
  else {
    const diff = Math.abs(slip.amount - c.amountDue);
    if (diff === 0) parts.push(`ยอดตรงกับงวด (${c.amountDue} บาท)`);
    else if (diff <= amountTolerance(c.amountDue))
      parts.push(`ยอดใกล้เคียงงวด (สลิป ${slip.amount} บาท ต่างจากยอดครบกำหนด ${c.amountDue} บาท อยู่ ${diff} บาท)`);
    else parts.push(`ยอดไม่ตรงกับงวด (สลิป ${slip.amount} บาท, ยอดครบกำหนด ${c.amountDue} บาท)`);
  }

  if (!slip.transferDate) parts.push("ไม่พบวันโอนจากสลิป");
  else {
    const diff = daysBetween(slip.transferDate, c.dueDate);
    if (diff === 0) parts.push("วันโอนตรงกับวันครบกำหนด");
    else if (diff <= DATE_TOLERANCE_DAYS) parts.push(`วันโอนต่างจากวันครบกำหนด ${diff} วัน`);
    else parts.push(`วันโอนต่างจากวันครบกำหนดมากเกินไป (${diff} วัน)`);
  }

  const slipAcct = normalizeAccountNo(slip.accountNo);
  const candAcct = normalizeAccountNo(c.bankAccountNo);
  if (slipAcct && candAcct) parts.push(slipAcct === candAcct ? "เลขบัญชีปลายทางตรงกัน" : "เลขบัญชีปลายทางไม่ตรงกับงวดนี้");

  return parts.join(" · ");
}

// Look for a subset (2-3) of candidates whose amountDue sums to the slip amount, within the
// same tolerance as a single-installment match. Signals "customer likely paid multiple
// installments in one transfer" so admin gets a clear reason instead of a flat score-too-low.
function findCombinationReason(slip: ParsedSlip, candidates: Candidate[]): string | null {
  if (slip.amount == null || candidates.length < 2) return null;
  const pending = candidates.slice(0, COMBO_CANDIDATE_LIMIT);
  const tol = amountTolerance(slip.amount);
  for (let i = 0; i < pending.length; i++) {
    for (let j = i + 1; j < pending.length; j++) {
      const sum2 = pending[i].amountDue + pending[j].amountDue;
      if (Math.abs(sum2 - slip.amount) <= tol)
        return `ยอดสลิปตรงกับผลรวม 2 งวด (รวม ${sum2} บาท) อาจเป็นการจ่ายหลายงวดพร้อมกัน กรุณาเลือกงวดที่ถูกต้อง`;
      for (let k = j + 1; k < pending.length; k++) {
        const sum3 = sum2 + pending[k].amountDue;
        if (Math.abs(sum3 - slip.amount) <= tol)
          return `ยอดสลิปตรงกับผลรวม 3 งวด (รวม ${sum3} บาท) อาจเป็นการจ่ายหลายงวดพร้อมกัน กรุณาเลือกงวดที่ถูกต้อง`;
      }
    }
  }
  return null;
}

// Pick the best-scoring candidate. Auto-matches only when the best score clears the threshold
// AND is clearly ahead of the runner-up; otherwise admin reviews, with a Thai reason + ranked
// candidates so they don't have to re-derive the comparison themselves.
export function decideMatch(
  slip: ParsedSlip,
  candidates: Candidate[],
  ctx: { today: Date; referenceUnique: boolean; customerKnown: boolean }
): MatchDecision {
  if (!ctx.customerKnown)
    return { status: "needs_admin_match", installmentId: null, score: 0, reason: "ไม่พบลูกค้าจาก line_user_id", topCandidates: [] };
  if (!ctx.referenceUnique)
    return { status: "needs_admin_match", installmentId: null, score: 0, reason: "reference_no หรือสลิปซ้ำ", topCandidates: [] };
  if (candidates.length === 0)
    return { status: "needs_admin_match", installmentId: null, score: 0, reason: "ไม่พบงวดที่ค้างชำระ", topCandidates: [] };

  const scored = candidates
    .map((c) => ({ id: c.id, score: scoreInstallment(slip, c, ctx), reason: describeCandidate(slip, c, ctx) }))
    .sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, 3);

  const best = scored[0]!;
  const second = scored[1];
  const isClose = !!second && best.score - second.score < CLOSE_SCORE_MARGIN;

  if (best.score >= AUTO_MATCH_THRESHOLD && !isClose)
    return { status: "auto_matched", installmentId: best.id, score: best.score, reason: best.reason, topCandidates };

  if (isClose)
    return {
      status: "needs_admin_match",
      installmentId: null,
      score: best.score,
      reason: `มีหลายงวดคะแนนใกล้เคียงกัน (${best.score} vs ${second!.score}) โปรดเลือกงวดที่ถูกต้อง`,
      topCandidates,
    };

  const combo = findCombinationReason(slip, candidates);
  return {
    status: "needs_admin_match",
    installmentId: null,
    score: Math.max(best.score, 0),
    reason: combo ?? `คะแนนจับคู่ไม่ถึงเกณฑ์อัตโนมัติ: ${best.reason}`,
    topCandidates,
  };
}
