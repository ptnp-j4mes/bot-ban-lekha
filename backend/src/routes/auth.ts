import { Elysia, t } from "elysia";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { ok, ApiError } from "../lib/response";
import { signJwt } from "../lib/jwt";
import { authContext } from "../lib/auth";
import { verifyLineIdToken } from "../lib/line";
import { sha256 } from "../lib/hash";

const AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN = "https://api.line.me/oauth2/v2.1/token";
const PROFILE = "https://api.line.me/v2/profile";
const LOGIN_COMPLETION_TTL_MS = 5 * 60 * 1000;
const secureCookie = env.frontendUrl.startsWith("https://");

type LineAdminProfile = { sub: string; name?: string; pictureUrl?: string };

// Keep the native LINE Login path aligned with the existing web callback. The
// mobile app only sends an ID token; channel secrets remain server-side.
async function upsertLineAdmin(profile: LineAdminProfile) {
  const total = await prisma.adminUser.count();
  const existing = await prisma.adminUser.findUnique({ where: { lineUserId: profile.sub } });
  if (existing && !existing.isActive) throw new ApiError("FORBIDDEN", "บัญชีถูกปิดใช้งาน");

  return existing
    ? prisma.adminUser.update({
        where: { id: existing.id },
        data: {
          ...(profile.name ? { displayName: profile.name } : {}),
          ...(profile.pictureUrl ? { pictureUrl: profile.pictureUrl } : {}),
          lastLoginAt: new Date(),
        },
      })
    : prisma.adminUser.create({
        data: {
          lineUserId: profile.sub,
          displayName: profile.name,
          pictureUrl: profile.pictureUrl,
          isPlatformAdmin: total === 0,
          isActive: true,
          lastLoginAt: new Date(),
        },
      });
}

export const authRoutes = new Elysia({ prefix: "/api/auth", cookie: { secrets: env.jwtSecret, sign: ["oauth_state"] } })
  // Username + password login (for super admin / non-LINE accounts). Argon2 via Bun.password.
  .post("/login", async ({ body }: any) => {
    const { username, password } = body ?? {};
    if (!username || !password) throw new ApiError("VALIDATION_ERROR", "username and password are required");
    const u = await prisma.adminUser.findUnique({ where: { username } });
    const okPw = u?.passwordHash ? await Bun.password.verify(password, u.passwordHash) : false;
    if (!u || !okPw) throw new ApiError("UNAUTHORIZED", "username หรือ password ไม่ถูกต้อง");
    if (!u.isActive) throw new ApiError("FORBIDDEN", "บัญชีถูกปิดใช้งาน");
    await prisma.adminUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return ok({ token: signJwt({ sub: u.id, name: u.displayName }, env.jwtSecret) });
  }, { body: t.Object({ username: t.String({ minLength: 1 }), password: t.String({ minLength: 1 }) }) })
  // Step 1: redirect the admin to LINE Login with a CSRF state cookie.
  .get("/line/login", ({ cookie, set, query }: any) => {
    if (!env.lineLoginChannelId) throw new ApiError("INTERNAL_ERROR", "LINE Login not configured");
    if (!/^[a-f0-9]{64}$/i.test(query.code_challenge ?? "")) throw new ApiError("VALIDATION_ERROR", "Missing login verifier");
    const state = randomBytes(16).toString("hex");
    cookie.oauth_state.set({ value: { state, challenge: query.code_challenge.toLowerCase() }, httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: secureCookie });
    const u = new URL(AUTHORIZE);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", env.lineLoginChannelId);
    u.searchParams.set("redirect_uri", env.lineLoginRedirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("scope", "profile openid");
    set.status = 302;
    set.headers["location"] = u.toString();
    return "";
  })

  // Step 2: LINE redirects back here with ?code&state. Verify, exchange, upsert, issue JWT.
  .get("/line/callback", async ({ query, cookie, set }: any) => {
    const fail = (msg: string) => {
      set.status = 302;
      set.headers["location"] = `${env.frontendUrl}/#error=${encodeURIComponent(msg)}`;
      return "";
    };
    if (!query.code || !query.state) return fail("missing code/state");
    const oauthState = cookie.oauth_state?.value as { state?: string; challenge?: string } | undefined;
    if (!oauthState?.state || oauthState.state !== query.state || !/^[a-f0-9]{64}$/.test(oauthState.challenge ?? "")) return fail("bad state");
    cookie.oauth_state.remove();

    const tokenRes = await fetch(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: query.code,
        redirect_uri: env.lineLoginRedirectUri,
        client_id: env.lineLoginChannelId,
        client_secret: env.lineLoginChannelSecret,
      }),
    });
    if (!tokenRes.ok) return fail("token exchange failed");
    const tok: any = await tokenRes.json();

    const profRes = await fetch(PROFILE, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!profRes.ok) return fail("profile fetch failed");
    const prof: any = await profRes.json();

    // First-ever admin to log in becomes the platform admin (you). Others just get an account;
    // org access is granted by being added to an org (member/platform admin).
    const user = await upsertLineAdmin({ sub: prof.userId, name: prof.displayName, pictureUrl: prof.pictureUrl });
    const code = randomBytes(32).toString("base64url");
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.adminLoginCompletion.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] } });
      await tx.adminLoginCompletion.create({
        data: {
          codeHash: sha256(code),
          challengeHash: sha256(oauthState.challenge!),
          adminUserId: user.id,
          expiresAt: new Date(now.getTime() + LOGIN_COMPLETION_TTL_MS),
        },
      });
    });
    set.status = 302;
    set.headers["location"] = `${env.frontendUrl}/#login_code=${encodeURIComponent(code)}`;
    return "";
  })

  // Redeem the one-time browser-bound code issued by the LINE callback.
  .post(
    "/line/complete",
    async ({ body }: any) => {
      const now = new Date();
      return ok(await prisma.$transaction(async (tx) => {
        await tx.adminLoginCompletion.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] } });
        const codeHash = sha256(body.code);
        const challengeHash = sha256(sha256(body.code_verifier));
        const completion = await tx.adminLoginCompletion.findUnique({ where: { codeHash } });
        if (!completion || completion.expiresAt <= now || completion.consumedAt || completion.challengeHash !== challengeHash)
          throw new ApiError("UNAUTHORIZED", "Invalid or expired login completion");
        const consumed = await tx.adminLoginCompletion.updateMany({
          where: { id: completion.id, consumedAt: null, expiresAt: { gt: now }, challengeHash },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new ApiError("UNAUTHORIZED", "Invalid or expired login completion");
        const user = await tx.adminUser.findUnique({ where: { id: completion.adminUserId } });
        if (!user || !user.isActive) throw new ApiError("FORBIDDEN", "บัญชีถูกปิดใช้งาน");
        await tx.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: now } });
        return { token: signJwt({ sub: user.id, name: user.displayName }, env.jwtSecret) };
      }));
    },
    { body: t.Object({ code: t.String({ minLength: 1 }), code_verifier: t.String({ minLength: 1 }) }) }
  )

  // Native LINE Login: the iOS SDK returns an ID token directly, so no browser
  // hash redirect or cookie is needed. The token is verified by LINE before the
  // same account/JWT flow used by the web callback is applied.
  .post(
    "/mobile/line",
    async ({ body }: any) => {
      if (!env.lineLoginChannelId) throw new ApiError("INTERNAL_ERROR", "LINE Login not configured");
      const profile = await verifyLineIdToken(body.id_token, env.lineLoginChannelId);
      if (!profile) throw new ApiError("UNAUTHORIZED", "Invalid LINE ID token");
      const user = await upsertLineAdmin(profile);
      return ok({ token: signJwt({ sub: user.id, name: user.displayName }, env.jwtSecret) });
    },
    { body: t.Object({ id_token: t.String({ minLength: 1 }) }) }
  )

  // Change own password (logged-in user). LINE-only accounts can set one (no current required).
  .post(
    "/change-password",
    async ({ headers, body }: any) => {
      const ctx = await authContext(headers);
      if (ctx.userId === "apikey") throw new ApiError("VALIDATION_ERROR", "api key has no password");
      const u = await prisma.adminUser.findUnique({ where: { id: ctx.userId } });
      if (!u) throw new ApiError("NOT_FOUND", "User not found");
      if (u.passwordHash) {
        const okPw = await Bun.password.verify(body.current_password ?? "", u.passwordHash);
        if (!okPw) throw new ApiError("UNAUTHORIZED", "current password ไม่ถูกต้อง");
      }
      await prisma.adminUser.update({ where: { id: u.id }, data: { passwordHash: await Bun.password.hash(body.new_password) } });
      return ok({ changed: true });
    },
    { body: t.Object({ current_password: t.Optional(t.String()), new_password: t.String({ minLength: 6 }) }) }
  )

  // Current user + their org.
  .get("/me", async ({ headers }: any) => {
    const ctx = await authContext(headers);
    // user = their single org; super admin = no default org (enters a user's org explicitly).
    let org: { id: string; name: string } | null = null;
    let menuPrefs: unknown = null;
    if (!ctx.isPlatformAdmin && ctx.userId !== "apikey") {
      const m = await prisma.membership.findFirst({ where: { adminUserId: ctx.userId, organization: { isActive: true } }, include: { organization: true } });
      if (m) org = { id: m.orgId, name: m.organization.name };
    }
    if (ctx.userId !== "apikey") {
      const u = await prisma.adminUser.findUnique({ where: { id: ctx.userId }, select: { menuPrefs: true } });
      menuPrefs = u?.menuPrefs ?? null;
    }
    return ok({ userId: ctx.userId, name: ctx.name, isPlatformAdmin: ctx.isPlatformAdmin, org, menu_prefs: menuPrefs });
  })

  // Save sidebar menu preferences for super admins only.
  .patch(
    "/menu-prefs",
    async ({ headers, body }: any) => {
      const ctx = await authContext(headers);
      if (ctx.userId === "apikey") throw new ApiError("VALIDATION_ERROR", "api key has no menu prefs");
      if (!ctx.isPlatformAdmin) throw new ApiError("FORBIDDEN", "ต้องเป็น super admin เพื่อจัดการเมนู");
      const u = await prisma.adminUser.update({ where: { id: ctx.userId }, data: { menuPrefs: body } });
      return ok({ menu_prefs: u.menuPrefs });
    },
    {
      body: t.Object({
        order: t.Optional(t.Array(t.String())),
        hidden: t.Optional(t.Array(t.String())),
        groups: t.Optional(t.Array(t.Object({ label: t.String(), items: t.Array(t.String()) }))),
      }),
    }
  );
