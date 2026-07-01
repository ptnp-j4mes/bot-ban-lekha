import { createHmac, timingSafeEqual } from "node:crypto";

// Verify a LINE webhook signature against the given channel secret (HMAC-SHA256, base64).
export function verifySignature(rawBody: string, signature: string | undefined, channelSecret: string): boolean {
  if (!channelSecret || !signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type PushResult = { status: "sent" | "failed"; response?: unknown; error?: string };

// Push a text message using a specific OA's access token.
export async function pushMessage(to: string, text: string, accessToken: string): Promise<PushResult> {
  if (!accessToken) {
    // ponytail: no token (dev / unconfigured OA) -> pretend sent so the flow runs offline.
    return { status: "sent", response: { mock: true } };
  }
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) return { status: "failed", error: `LINE ${res.status}: ${await res.text()}` };
    return { status: "sent", response: await res.json().catch(() => ({})) };
  } catch (e) {
    return { status: "failed", error: String(e) };
  }
}

// Verify a LIFF ID token via LINE's own verify endpoint (no local JWKS handling needed).
// Returns the LINE user id (sub) once LINE confirms the token's signature + audience.
export async function verifyLineIdToken(idToken: string, channelId: string): Promise<{ sub: string; name?: string } | null> {
  if (!idToken || !channelId) return null;
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data.sub || data.aud !== channelId) return null;
    return { sub: data.sub, name: data.name };
  } catch {
    return null;
  }
}

// Fetch a group/room member's LINE display name (for tracking who sent a slip).
export async function getGroupMemberName(
  source: { groupId?: string; roomId?: string; userId?: string },
  accessToken: string
): Promise<string | null> {
  if (!accessToken || !source.userId) return null;
  const base = source.groupId
    ? `group/${source.groupId}`
    : source.roomId
      ? `room/${source.roomId}`
      : null;
  if (!base) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/${base}/member/${source.userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as any)?.displayName ?? null;
  } catch {
    return null;
  }
}

// Fetch a LINE group's name (for reports).
export async function getGroupName(groupId: string, accessToken: string): Promise<string | null> {
  if (!accessToken || !groupId) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as any)?.groupName ?? null;
  } catch {
    return null;
  }
}

// Download image content for a LINE message id using a specific OA's access token.
export async function getMessageContent(messageId: string, accessToken: string): Promise<Buffer> {
  if (!accessToken) return Buffer.from(`mock-slip-${messageId}`); // ponytail: dev stub
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`LINE content ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
