import { env } from "../env";

export type DocType = "slip" | "cash" | "unknown";

export type OcrResult = {
  rawText: string;
  docType?: DocType; // bank transfer slip vs cash receipt/bill
  amount?: number;
  transferDate?: string; // YYYY-MM-DD
  transferTime?: string; // HH:mm
  bankName?: string;
  accountNo?: string;
  referenceNo?: string;
  confidence?: number; // 0..100
};

const asDocType = (v: any): DocType | undefined =>
  v === "slip" || v === "cash" || v === "unknown" ? v : undefined;

export interface OcrService {
  parseSlip(buffer: Buffer): Promise<OcrResult>;
}

// Mock provider: if the slip bytes are JSON (dev/test inject real fields), use them.
// Otherwise we can't read the image -> empty result, confidence 0 (=> needs_admin_match).
class MockOcrProvider implements OcrService {
  async parseSlip(buffer: Buffer): Promise<OcrResult> {
    const text = buffer.toString("utf8");
    try {
      const j = JSON.parse(text);
      return {
        rawText: text,
        docType: asDocType(j.docType) ?? "slip",
        amount: j.amount,
        transferDate: j.transferDate,
        transferTime: j.transferTime,
        bankName: j.bankName,
        accountNo: j.accountNo,
        referenceNo: j.referenceNo,
        confidence: j.confidence ?? 95,
      };
    } catch {
      // A real image is not OCR text. Keeping its decoded bytes can inject NULs into PostgreSQL.
      return { rawText: "", confidence: 0 };
    }
  }
}

const withoutNul = (value: string) => value.replace(/\u0000/g, "");

// Detect supported image mime from magic bytes. null = unsupported/not an image.
export function detectImageMime(buf?: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export const mimeExt = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

const sniffMime = (buf?: Buffer) => detectImageMime(buf) ?? "image/jpeg";

const SLIP_PROMPT =
  "Classify the image and extract payment fields. " +
  "docType: 'slip' for a bank/mobile-banking transfer slip, 'cash' for a cash receipt or cash bill (เงินสด, no bank transfer), 'unknown' if neither. " +
  "Return amount as a number (THB). " +
  "Return transferDate in Gregorian YYYY-MM-DD; if it shows a Thai Buddhist year (พ.ศ., e.g. 2569) subtract 543. " +
  "transferTime as HH:mm (24h). bankName, accountNo (destination account), referenceNo as strings (null for a cash bill). " +
  "confidence 0-100 for how sure you are. Use null for any field you cannot read.";

const SLIP_SCHEMA = {
  type: "OBJECT",
  properties: {
    docType: { type: "STRING", nullable: true },
    amount: { type: "NUMBER", nullable: true },
    transferDate: { type: "STRING", nullable: true },
    transferTime: { type: "STRING", nullable: true },
    bankName: { type: "STRING", nullable: true },
    accountNo: { type: "STRING", nullable: true },
    referenceNo: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER", nullable: true },
  },
} as const;

// Map Gemini's structured JSON into an OcrResult (defensive: tolerate missing/odd fields).
export function mapGeminiResult(j: any, rawText: string): OcrResult {
  const num = (v: any) => (v == null || v === "" || isNaN(Number(v)) ? undefined : Number(v));
  const str = (v: any) => (v == null || v === "" ? undefined : withoutNul(String(v)));
  return {
    rawText: withoutNul(rawText),
    docType: asDocType(j?.docType),
    amount: num(j?.amount),
    transferDate: str(j?.transferDate),
    transferTime: str(j?.transferTime),
    bankName: str(j?.bankName),
    accountNo: str(j?.accountNo),
    referenceNo: str(j?.referenceNo),
    confidence: num(j?.confidence) ?? 0,
  };
}

class GeminiOcrProvider implements OcrService {
  async parseSlip(buffer: Buffer): Promise<OcrResult> {
    if (!env.ocrApiKey) throw new Error("OCR_API_KEY not set for gemini provider");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.ocrModel}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.ocrApiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SLIP_PROMPT },
              { inline_data: { mime_type: sniffMime(buffer), data: buffer.toString("base64") } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: SLIP_SCHEMA },
      }),
    });
    if (!res.ok) throw new Error(`Gemini OCR ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Gemini returned non-JSON OCR result");
    }
    return mapGeminiResult(parsed, text);
  }
}

let instance: OcrService | null = null;
export function getOcrService(): OcrService {
  if (!instance) {
    instance = env.ocrProvider === "gemini" ? new GeminiOcrProvider() : new MockOcrProvider();
  }
  return instance;
}
