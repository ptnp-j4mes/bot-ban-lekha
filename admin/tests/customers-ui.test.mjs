import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customers = await readFile(new URL("../src/pages/Customers.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/pages/CustomerDetail.tsx", import.meta.url), "utf8");

test("customer list exposes a readable summary and LINE connection status", () => {
  assert.match(customers, /aria-label="สรุปลูกค้า"/);
  assert.match(customers, /ยังไม่เชื่อมต่อ/);
});

test("customer detail exposes navigation for its long sections", () => {
  assert.match(detail, /aria-label="ส่วนข้อมูลลูกค้า"/);
  assert.match(detail, /href="#customer-documents"/);
});
