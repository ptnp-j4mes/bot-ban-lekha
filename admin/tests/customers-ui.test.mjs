import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customers = await readFile(new URL("../src/pages/Customers.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../src/pages/CustomerDetail.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const table = await readFile(new URL("../src/components/ui/table.tsx", import.meta.url), "utf8");

test("customer list exposes a readable summary and LINE connection status", () => {
  assert.match(customers, /aria-label="สรุปลูกค้า"/);
  assert.match(customers, /ยังไม่เชื่อมต่อ/);
});

test("customer list and detail expose contact classification", () => {
  assert.match(customers, /customer_type/);
  assert.match(customers, /รอจัดประเภท/);
  assert.match(detail, /customer_type/);
  assert.match(detail, /คนทั่วไป/);
});

test("customer list separates existing customers from unclassified new contacts", () => {
  assert.match(customers, /const CUSTOMER_TYPE_TABS = \[\s+\{ value: "customer", label: "ลูกค้า" \},/);
  assert.match(customers, /value: "unclassified", label: "ลูกค้าใหม่รอจัดประเภท"/);
  assert.match(customers, /setCustomerTypeFilter\(item\.value\)/);
});

test("admin notification bell watches unclassified LINE contacts", () => {
  assert.match(app, /customer_type=unclassified/);
  assert.match(app, /refetchInterval: 30000/);
  assert.match(app, /ผู้ติดต่อใหม่/);
});

test("customer detail exposes navigation for its long sections", () => {
  assert.match(detail, /aria-label="ส่วนข้อมูลลูกค้า"/);
  assert.match(detail, /href="#customer-documents"/);
});

test("customer detail shows consent only for customer contacts", () => {
  assert.match(detail, /customer_type === "customer"/);
  assert.match(detail, /consent_at/);
  assert.match(detail, /ยินยอมแล้ว/);
  assert.match(detail, /ยังไม่ได้ยินยอม/);
});

test("customer detail uses a full-viewport dialog", () => {
  assert.match(detail, /createPortal\(/);
  assert.match(detail, /document\.body/);
  assert.match(detail, /fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black\/40 p-0/);
  assert.match(detail, /min-h-full w-full max-w-none space-y-4 bg-background p-3 sm:p-4/);
  assert.doesNotMatch(detail, /fixed inset-0 z-50 flex items-center/);
  assert.doesNotMatch(detail, /sm:max-h-\[calc\(100dvh-4rem\)\]/);
});

test("table headers stay below the customer dialog header", () => {
  assert.match(table, /sticky top-0 z-0 border-b border-foreground\/15 bg-card/);
  assert.doesNotMatch(detail, /my-3/);
  assert.doesNotMatch(detail, /sm:my-8/);
});
