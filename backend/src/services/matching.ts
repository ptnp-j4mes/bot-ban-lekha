import { sameDay } from "../lib/date";

export type ParsedSlip = {
  amount?: number | null;
  transferDate?: Date | null;
};

export type Candidate = {
  id: string;
  amountDue: number;
  dueDate: Date;
};

// Pure scoring per spec 6.2. same_customer is enforced by candidate selection upstream.
export function scoreInstallment(
  slip: ParsedSlip,
  c: Candidate,
  ctx: { today: Date; referenceUnique: boolean }
): number {
  let score = 0;
  if (slip.amount != null && slip.amount === c.amountDue) score += 50;
  if (slip.transferDate && sameDay(slip.transferDate, c.dueDate)) score += 40;
  if (sameDay(c.dueDate, ctx.today)) score += 10;
  if (ctx.referenceUnique) score += 10;
  return score;
}

export type MatchDecision = {
  status: "auto_matched" | "needs_admin_match";
  installmentId: string | null;
  score: number;
  reason: string;
};

// Pick the best-scoring candidate. >=90 auto, otherwise needs admin.
export function decideMatch(
  slip: ParsedSlip,
  candidates: Candidate[],
  ctx: { today: Date; referenceUnique: boolean; customerKnown: boolean }
): MatchDecision {
  if (!ctx.customerKnown)
    return { status: "needs_admin_match", installmentId: null, score: 0, reason: "ไม่พบลูกค้าจาก line_user_id" };
  if (!ctx.referenceUnique)
    return { status: "needs_admin_match", installmentId: null, score: 0, reason: "reference_no หรือสลิปซ้ำ" };

  let best: Candidate | null = null;
  let bestScore = -1;
  let tie = false;
  for (const c of candidates) {
    const s = scoreInstallment(slip, c, ctx);
    if (s > bestScore) {
      bestScore = s;
      best = c;
      tie = false;
    } else if (s === bestScore) {
      tie = true;
    }
  }

  if (!best || bestScore < 90 || tie) {
    return {
      status: "needs_admin_match",
      installmentId: best && bestScore >= 90 && !tie ? best.id : null,
      score: Math.max(bestScore, 0),
      reason: tie ? "หลายงวดยอดเท่ากัน ไม่มั่นใจ" : "คะแนนจับคู่ไม่ถึงเกณฑ์อัตโนมัติ",
    };
  }
  return { status: "auto_matched", installmentId: best.id, score: bestScore, reason: "ยอดและวันที่ตรงกับงวด" };
}
