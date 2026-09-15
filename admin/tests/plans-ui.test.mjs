import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plans = await readFile(new URL("../src/pages/BillPlans.tsx", import.meta.url), "utf8");
const dialog = await readFile(new URL("../src/components/ui/dialog.tsx", import.meta.url), "utf8");

test("plans page makes bill states and filters clear", () => {
  assert.match(plans, /รายการบิล/);
  assert.match(plans, /กำลังใช้งาน/);
  assert.match(plans, /เสร็จสิ้น/);
  assert.match(plans, /aria-selected=\{billStatus === item\.id\}/);
  assert.match(plans, /aria-expanded=\{filtersOpen\}/);
  assert.match(plans, /id="plans-filters"/);
});

test("plans forms use friendly Thai labels and actions", () => {
  assert.match(plans, /สร้างบิลใหม่/);
  assert.match(plans, /เลขที่บิล/);
  assert.match(plans, /ดูตัวอย่างบิล/);
  assert.match(plans, /ค่าปรับต่องวด \(ค่าเริ่มต้น\)/);
  assert.match(plans, /aria-label=\{`ลบงวดที่/);
});

test("shared dialogs are centered and have an accessible close control", () => {
  assert.match(dialog, /fixed inset-0 z-50 flex items-center justify-center/);
  assert.match(dialog, /aria-labelledby=\{title \? titleId : undefined\}/);
  assert.match(dialog, /h-\[42px\] w-\[42px\]/);
  assert.doesNotMatch(dialog, /my-3/);
  assert.doesNotMatch(dialog, /sm:my-8/);
});
