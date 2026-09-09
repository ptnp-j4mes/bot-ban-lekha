import { expect, test } from "bun:test";
import { submissionImageSource } from "../src/lib/submission-image";

test("submission image source keeps remote and authenticated slips viewable", () => {
  expect(submissionImageSource("sub-1", "https://storage.example/slip.jpg")).toEqual({
    kind: "remote",
    src: "https://storage.example/slip.jpg",
  });
  expect(submissionImageSource("sub/1", "/var/lib/slips/sub-1.jpg")).toEqual({
    kind: "authenticated",
    src: "/api/admin/payment-submissions/sub%2F1/image",
  });
  expect(submissionImageSource("sub-1", null)).toBeNull();
});
