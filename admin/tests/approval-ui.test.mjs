import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");
const auth = await read("../src/lib/auth.tsx");
const app = await read("../src/App.tsx");
const login = await read("../src/pages/Login.tsx");
const users = await read("../src/pages/Users.tsx");
const pending = await read("../src/pages/PendingApproval.tsx");

test("web auth exposes the LINE pending approval state", () => {
  assert.match(auth, /PENDING_APPROVAL|pendingApproval/);
  assert.match(app, /PendingApproval/);
  assert.match(pending, /รออนุมัติสิทธิ์เข้าใช้งาน/);
});

test("super admin users page can choose an org and menu permissions", () => {
  assert.match(users, /อนุมัติและบันทึก/);
  assert.match(users, /กำหนดสิทธิ์/);
  assert.match(users, /permissions/);
  assert.match(users, /org_id/);
});

test("password login routes pending approval errors to the same UI", () => {
  assert.match(login, /PENDING_APPROVAL|pendingApproval/);
});
