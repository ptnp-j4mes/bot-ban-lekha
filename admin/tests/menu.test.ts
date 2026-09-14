import { expect, test } from "bun:test";
import { platformMenuIdFromPath, platformMenuPath } from "../src/lib/menu";

test("จัดการไฟล์ตามแชทมี platform menu route แยกจาก File Storage", () => {
  expect(platformMenuPath("files")).toBe("/platform/files");
  expect(platformMenuIdFromPath("/platform/files")).toBe("files");
});
