import { test, expect } from "bun:test";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const row = (customerCode: string, displayName = "ชำระแล้ว", amount = -42) => ({
  paidAt: new Date("2026-09-10T01:02:03.000Z"),
  customer: { customerCode, displayName },
  amount,
  billInstallment: { dueDate: new Date("2026-09-11T00:00:00.000Z") },
  approvedAt: new Date("2026-09-10T01:02:03.000Z"),
});

test("payments CSV neutralizes formula prefixes in text cells", async () => {
  const rows = [
    row("=1+1"),
    row("+cmd"),
    row("-10"),
    row("@HYPERLINK(\"https://example.com\")"),
    row(" \t\u0000=9"),
    row("C001", "ชื่อ,ผู้จ่าย\n\"ทดสอบ\""),
  ];
  const findMany = prisma.payment.findMany;
  (prisma.payment as any).findMany = async () => rows;

  try {
    const response = await app.handle(new Request("http://localhost/api/reports/payments.csv", {
      headers: { "x-api-key": "change-me", "x-org-id": "org-test" },
    }));
    expect(response.status).toBe(200);
    const body = await response.text();

    for (const expected of [
      `"'=1+1"`,
      `"'+cmd"`,
      `"'-10"`,
      `"'@HYPERLINK(""https://example.com"")"`,
      `"' \t\u0000=9"`,
    ]) {
      expect(body).toContain(expected);
    }
    expect(body).toContain('"ชื่อ,ผู้จ่าย\n""ทดสอบ"""');
    expect(body).toContain('"ชำระแล้ว"');
    expect(body).toContain('"-42","2026-09-11"');
  } finally {
    (prisma.payment as any).findMany = findMany;
  }
});
