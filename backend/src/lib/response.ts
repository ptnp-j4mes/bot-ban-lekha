// Unified API response + error handling.
import { captureError } from "./logger";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_SLIP"
  | "INSTALLMENT_ALREADY_PAID"
  | "BANK_ACCOUNT_NOT_FOUND"
  | "BANK_ACCOUNT_INACTIVE"
  | "DEFAULT_BANK_ACCOUNT_REQUIRED"
  | "LINE_PUSH_FAILED"
  | "OCR_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  DUPLICATE_SLIP: 409,
  INSTALLMENT_ALREADY_PAID: 409,
  BANK_ACCOUNT_NOT_FOUND: 404,
  BANK_ACCOUNT_INACTIVE: 409,
  DEFAULT_BANK_ACCOUNT_REQUIRED: 409,
  LINE_PUSH_FAILED: 502,
  OCR_FAILED: 502,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
  }
}

const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

// Serialize Prisma objects to the snake_case JSON contract the frontend/spec expects.
// Decimal -> number, Date -> ISO (date-only if UTC midnight).
export function toSnake(v: any): any {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(toSnake);
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof v === "object") {
    if (typeof v.toNumber === "function") return v.toNumber(); // Prisma Decimal
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[camelToSnake(k)] = toSnake(val);
    return out;
  }
  return v;
}

export const ok = (data: unknown, message = "success") => ({
  success: true,
  data: toSnake(data),
  message,
});

// Elysia onError handler: maps ApiError/Prisma/validation into the standard envelope.
export function handleError({ error, set, code }: any) {
  if (error instanceof ApiError) {
    set.status = error.status;
    return { success: false, error: { code: error.code, message: error.message } };
  }
  if (code === "VALIDATION") {
    set.status = 400;
    return { success: false, error: { code: "VALIDATION_ERROR", message: String(error?.message ?? error) } };
  }
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { success: false, error: { code: "NOT_FOUND", message: "Not found" } };
  }
  if (error?.code === "P2002") {
    set.status = 409;
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Duplicate value" } };
  }
  captureError(error, { code });
  set.status = 500;
  return { success: false, error: { code: "INTERNAL_ERROR", message: String(error?.message ?? error) } };
}
