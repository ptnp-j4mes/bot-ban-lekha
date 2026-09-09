export type SubmissionImageSource =
  | { kind: "remote"; src: string }
  | { kind: "authenticated"; src: string };

export function submissionImageSource(id: string, imageUrl: string | null | undefined): SubmissionImageSource | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return { kind: "remote", src: imageUrl };
  return { kind: "authenticated", src: `/api/admin/payment-submissions/${encodeURIComponent(id)}/image` };
}
