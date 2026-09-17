import { addDays, dateOnly, toISODate } from "../lib/date";

export type ParsedInstallment = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: "pending" | "paid";
  isLate: boolean;
  penaltyAmount: number;
};

export type ParsedBill = {
  billNo: number;
  principalAmount: number;
  cycleDays: number | null;
  installments: ParsedInstallment[];
};

type DateSpec = { day: number; month?: number; year?: number };

const amountPattern = "([0-9][0-9,]*(?:\\.[0-9]+)?)";
const datePattern = "([0-9]{1,2}(?:\\/[0-9]{1,2}(?:\\/[0-9]{2,4})?)?)";

const money = (value: string) => Number(value.replace(/,/g, ""));

function parseDateSpec(value: string): DateSpec {
  const [day, month, year] = value.split("/").map(Number);
  return {
    day,
    ...(month ? { month } : {}),
    ...(year ? { year: year >= 2400 ? year - 543 : year < 100 ? 2000 + year : year } : {}),
  };
}

function validDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function candidatesFor(spec: DateSpec, reference: Date): Date[] {
  const referenceYear = reference.getUTCFullYear();
  const referenceMonth = reference.getUTCMonth();
  const years = spec.year ? [spec.year] : [referenceYear - 1, referenceYear, referenceYear + 1];
  const dates: Date[] = [];
  for (const year of years) {
    if (spec.month) {
      const date = validDate(year, spec.month, spec.day);
      if (date) dates.push(date);
      continue;
    }
    for (let offset = -18; offset <= 18; offset++) {
      const monthDate = new Date(Date.UTC(year, referenceMonth + offset, 1));
      const date = validDate(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, spec.day);
      if (date) dates.push(date);
    }
  }
  return [...new Map(dates.map((date) => [toISODate(date), date])).values()];
}

function matchesSpec(date: Date, spec: DateSpec): boolean {
  return date.getUTCDate() === spec.day
    && (spec.month === undefined || date.getUTCMonth() + 1 === spec.month)
    && (spec.year === undefined || date.getUTCFullYear() === spec.year);
}

function sequenceScore(dates: Date[], reference: Date): number {
  const first = dates[0].getTime();
  const last = dates[dates.length - 1].getTime();
  const point = reference.getTime();
  const distance = point < first ? first - point : point > last ? point - last : 0;
  const midpoint = (first + last) / 2;
  return distance * 100 + Math.abs(midpoint - point);
}

function resolveDates(specs: DateSpec[], cycleDays: number | null, reference: Date): Date[] {
  if (!specs.length) return [];
  if (cycleDays && cycleDays > 0) {
    const sequences: Date[][] = [];
    for (const first of candidatesFor(specs[0], reference)) {
      const dates = [first];
      let valid = true;
      for (let index = 1; index < specs.length; index++) {
        const next = addDays(dates[index - 1], cycleDays);
        if (!matchesSpec(next, specs[index])) {
          valid = false;
          break;
        }
        dates.push(next);
      }
      if (valid) sequences.push(dates);
    }
    if (sequences.length) return sequences.sort((a, b) => sequenceScore(a, reference) - sequenceScore(b, reference))[0];
  }

  const dates: Date[] = [];
  for (const spec of specs) {
    const candidates = candidatesFor(spec, reference)
      .filter((date) => !dates.length || date.getTime() > dates[dates.length - 1].getTime())
      .sort((a, b) => Math.abs(a.getTime() - reference.getTime()) - Math.abs(b.getTime() - reference.getTime()));
    if (!candidates.length) return [];
    dates.push(candidates[0]);
  }
  return dates;
}

function parseHeader(text: string): { principalAmount: number; installmentAmount: number; cycleDays: number | null } | null {
  const match = text.match(new RegExp(`ต้น\\s*${amountPattern}[\\s\\S]{0,100}?(?:ส่ง\\s*คืน|ส่ง|คืน)\\s*${amountPattern}`, "u"));
  if (!match) return null;
  const cycleMatch = text.match(/ทุก\s*([0-9]+)\s*วัน/u);
  return {
    principalAmount: money(match[1]),
    installmentAmount: money(match[2]),
    cycleDays: cycleMatch ? Number(cycleMatch[1]) : null,
  };
}

function parseScheduleLine(line: string) {
  const match = line.match(new RegExp(`(?:^|\\s)${datePattern}\\s*(?:💸)?\\s*${amountPattern}`, "u"));
  if (!match) return null;
  const penaltyMatch = line.match(/ปรับ\s*([0-9][0-9,]*(?:\.[0-9]+)?)/u);
  return {
    date: parseDateSpec(match[1]),
    amountDue: money(match[2]),
    status: line.includes("✅") ? "paid" as const : "pending" as const,
    isLate: line.includes("🔴") && line.includes("ส่งล่าช้า"),
    penaltyAmount: penaltyMatch ? money(penaltyMatch[1]) : 0,
  };
}

export function parseChatBillMessage(messageText: string, referenceDate: string): ParsedBill[] {
  const lines = messageText.replace(/\r/g, "").split("\n");
  const starts = lines.flatMap((line, index) => /ต้น\s*[0-9]/u.test(line) ? [index] : []);
  const reference = dateOnly(referenceDate);

  return starts.flatMap((start, index) => {
    const nextStart = starts[index + 1] ?? lines.length;
    const endMarker = lines.slice(start + 1, nextStart).findIndex((line) => /^\s*จบ/u.test(line));
    const end = endMarker >= 0 ? start + 1 + endMarker : nextStart;
    const sectionLines = lines.slice(start, end);
    const header = parseHeader(sectionLines.join("\n"));
    if (!header) return [];

    const rows = sectionLines.slice(1).flatMap((line) => {
      const row = parseScheduleLine(line);
      return row ? [row] : [];
    });
    if (!rows.length) {
      const dateMatch = sectionLines.join(" ").match(new RegExp(`วันที่\\s*${datePattern}`, "u"));
      if (dateMatch) rows.push({
        date: parseDateSpec(dateMatch[1]),
        amountDue: header.installmentAmount,
        status: "pending" as const,
        isLate: false,
        penaltyAmount: 0,
      });
    }
    if (!rows.length) return [];

    const dates = resolveDates(rows.map((row) => row.date), header.cycleDays, reference);
    if (dates.length !== rows.length) return [];
    return [{
      billNo: index + 1,
      principalAmount: header.principalAmount,
      cycleDays: header.cycleDays,
      installments: rows.map((row, rowIndex) => ({
        installmentNo: rowIndex + 1,
        dueDate: toISODate(dates[rowIndex]),
        amountDue: row.amountDue,
        amountPaid: row.status === "paid" ? row.amountDue : 0,
        status: row.status,
        isLate: row.isLate,
        penaltyAmount: row.penaltyAmount,
      })),
    }];
  });
}
