export function parseCustomerOaId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]oa=([^&#]+)/);
  return match ? decodeURIComponent(match[1]).trim() || null : null;
}
