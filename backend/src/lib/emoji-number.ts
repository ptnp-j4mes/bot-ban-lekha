// Convert digits in a number/string to LINE keycap emoji (1 -> 1️⃣).
const KEYCAP = "️⃣"; // variation selector + combining keycap

export function toEmojiNumber(value: number | string): string {
  return String(value)
    .split("")
    .map((ch) => (ch >= "0" && ch <= "9" ? ch + KEYCAP : ch))
    .join("");
}
