import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { publicOa } from "../services/oa";

export const lineOaRoutes = new Elysia({ prefix: "/api/line-oa-accounts" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) =>
    ok((await prisma.lineOaAccount.findMany({ where: { orgId: ctx.orgId }, orderBy: { createdAt: "asc" } })).map(publicOa))
  )

  .post("/", async ({ body, ctx }: any) => {
    const { name, channel_id, channel_secret, channel_access_token } = body ?? {};
    if (!name) throw new ApiError("VALIDATION_ERROR", "name is required");
    if (!channel_id) throw new ApiError("VALIDATION_ERROR", "channel_id is required");
    if (!channel_secret) throw new ApiError("VALIDATION_ERROR", "channel_secret is required");
    if (!channel_access_token) throw new ApiError("VALIDATION_ERROR", "channel_access_token is required");
    const oa = await prisma.lineOaAccount.create({
      data: { orgId: ctx.orgId, name, channelId: channel_id, channelSecret: channel_secret, channelAccessToken: channel_access_token },
    });
    await audit(prisma, { action: "create_line_oa", entityType: "line_oa_account", entityId: oa.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: { name, channelId: channel_id } });
    return ok(publicOa(oa));
  })

  .patch("/:id", async ({ params, body, ctx }: any) => {
    const old = await prisma.lineOaAccount.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!old) throw new ApiError("NOT_FOUND", "LINE OA not found");
    const data: any = {};
    if (body?.name !== undefined) data.name = body.name;
    if (body?.channel_id !== undefined) data.channelId = body.channel_id;
    if (body?.is_active !== undefined) data.isActive = !!body.is_active;
    if (body?.channel_secret) data.channelSecret = body.channel_secret;
    if (body?.channel_access_token) data.channelAccessToken = body.channel_access_token;
    const oa = await prisma.lineOaAccount.update({ where: { id: params.id }, data });
    await audit(prisma, {
      action: "update_line_oa",
      entityType: "line_oa_account",
      entityId: oa.id,
      orgId: ctx.orgId,
      actorId: ctx.userId,
      newValue: { name: oa.name, isActive: oa.isActive, rotatedSecret: !!body?.channel_secret, rotatedToken: !!body?.channel_access_token },
    });
    return ok(publicOa(oa));
  });
