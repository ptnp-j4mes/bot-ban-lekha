// Date helpers. @db.Date columns round-trip as UTC-midnight Date objects,
// so we read them with UTC getters. "Today" is computed in Asia/Bangkok.

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Build a Date at UTC midnight from a YYYY-MM-DD string (for @db.Date storage).
export function dateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86400000);
}

// Today's calendar date in Asia/Bangkok, as a UTC-midnight Date (matches @db.Date).
export function bangkokToday(): Date {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  return dateOnly(s);
}

export const dayOfMonth = (d: Date) => d.getUTCDate();
export const thaiMonth = (d: Date) => THAI_MONTHS[d.getUTCMonth()];
// Buddhist-era 2-digit year, e.g. 2026 -> 2569 -> "69".
export const beYear2 = (d: Date) => String((d.getUTCFullYear() + 543) % 100).padStart(2, "0");
export const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
export const toISODate = (d: Date) => d.toISOString().slice(0, 10);

// Inclusive Bangkok-local [from, to] range for a DateTime column, as a Prisma where-clause
// fragment. Bounds are omitted (open-ended) when the matching query param is absent.
export function bangkokDateRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00+07:00`);
  if (to) range.lt = addDays(new Date(`${to}T00:00:00+07:00`), 1);
  return range;
}
