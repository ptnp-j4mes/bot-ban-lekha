import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = fileURLToPath(new URL("../src/pages/BillPlans.tsx", import.meta.url));

test("Bill Plans keeps late delivery separate from payment and penalty", () => {
  const source = fs.readFileSync(pagePath, "utf8");

  assert.match(source, /is_late/);
  assert.match(source, /ส่งล่าช้า/);
  assert.match(source, /is_late:\s*r\.is_late/);
  assert.match(source, /is_late:\s*f\.is_late\.checked/);
});
