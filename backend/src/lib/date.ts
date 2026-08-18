// Date helpers. @db.Date columns round-trip as UTC-midnight Date objects,
// so we read them with UTC getters. "Today" is computed in Asia/Bangkok.

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const BANGKOK_TIME_ZONE = "Asia/Bangkok";

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
  const s = new Date().toLocaleDateString("en-CA", { timeZone: BANGKOK_TIME_ZONE }); // YYYY-MM-DD
  return dateOnly(s);
}

// Convert a calendar date from a date input into the UTC instant that starts
// that day in Bangkok. Timestamp columns remain UTC in the database.
export function bangkokDayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00+07:00`);
}

export function bangkokDayEndExclusive(iso: string): Date {
  return new Date(bangkokDayStart(iso).getTime() + 86400000);
}

export const dayOfMonth = (d: Date) => d.getUTCDate();
export const thaiMonth = (d: Date) => THAI_MONTHS[d.getUTCMonth()];
// Buddhist-era 2-digit year, e.g. 2026 -> 2569 -> "69".
export const beYear2 = (d: Date) => String((d.getUTCFullYear() + 543) % 100).padStart(2, "0");
export const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
export const toISODate = (d: Date) => d.toISOString().slice(0, 10);
