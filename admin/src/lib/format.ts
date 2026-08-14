// Shared display formatting — Thai dates + baht amounts, used across all tables.
export const baht = (n: any) =>
  n == null || n === "" ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2026-06-26" / ISO → "26 มิ.ย. 69" (Buddhist-era short, via th-TH locale).
export const thDate = (s: any) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
