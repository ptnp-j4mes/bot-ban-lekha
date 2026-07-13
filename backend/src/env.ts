export const env = {
  port: Number(process.env.APP_PORT ?? 3000),
  tz: process.env.APP_TIMEZONE ?? "Asia/Bangkok",
  adminApiKey: process.env.ADMIN_API_KEY ?? "change-me",
  jobApiKey: process.env.INTERNAL_JOB_API_KEY ?? "change-me",
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-jwt-secret-change-me",
  superAdminUsername: process.env.SUPER_ADMIN_USERNAME ?? "superadmin",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "superadmin",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  lineLoginChannelId: process.env.LINE_LOGIN_CHANNEL_ID ?? "",
  lineLoginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET ?? "",
  lineLoginRedirectUri: process.env.LINE_LOGIN_REDIRECT_URI ?? "http://localhost:8787/api/auth/line/callback",
  localStoragePath: process.env.LOCAL_STORAGE_PATH ?? "./storage",
  ocrProvider: process.env.OCR_PROVIDER ?? "mock",
  ocrApiKey: process.env.OCR_API_KEY ?? "",
  ocrModel: process.env.OCR_MODEL ?? "gemini-2.5-flash",
  maxSlipMb: Number(process.env.MAX_SLIP_FILE_SIZE_MB ?? 10),
  ocrRateMax: Number(process.env.OCR_RATE_MAX ?? 10),
  ocrRateWindowSec: Number(process.env.OCR_RATE_WINDOW_SEC ?? 3600),
  // Bill footer / late-payment notice. Configurable per group; default kept polite (compliance).
  billFooter:
    process.env.BILL_FOOTER ||
    "‼️ กรุณาชำระภายในเวลา 17.00 น. หากเกินกำหนด อาจมีค่าปรับหรือเงื่อนไขเพิ่มเติมตามข้อตกลงค่ะ 📌",
};

// Refuse to boot in production with known insecure defaults (secret-leak guard).
const INSECURE_DEFAULTS: Record<string, string> = {
  JWT_SECRET: "dev-insecure-jwt-secret-change-me",
  ADMIN_API_KEY: "change-me",
  INTERNAL_JOB_API_KEY: "change-me",
  SUPER_ADMIN_PASSWORD: "superadmin",
};

if (process.env.NODE_ENV === "production") {
  const bad = Object.entries(INSECURE_DEFAULTS)
    .filter(([k, def]) => (process.env[k] ?? def) === def)
    .map(([k]) => k);
  if (bad.length) {
    throw new Error(
      `Refusing to start in production with default secrets: ${bad.join(", ")}. Set strong values (e.g. \`openssl rand -hex 32\`).`
    );
  }
}
