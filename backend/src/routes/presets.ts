import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authContext, authorizePlatform } from "../lib/auth";

// Billing-cycle presets are global helper values (3/5/7 days). Any authenticated user can read;
// only platform admins manage them.
export const presetRoutes = new Elysia({ prefix: "/api/billing-cycle-presets" })
  .get("/", async ({ headers }: any) => {
    await authContext(headers);
    return ok(await prisma.billingCyclePreset.findMany({ orderBy: { cycleDays: "asc" } }));
  })

  .post("/", async ({ body, headers }: any) => {
    await authorizePlatform(headers);
    const { name, cycle_days } = body ?? {};
    if (!name) throw new ApiError("VALIDATION_ERROR", "name is required");
    if (!(cycle_days > 0)) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");
    return ok(await prisma.billingCyclePreset.create({ data: { name, cycleDays: cycle_days } }));
  })

  .patch("/:id", async ({ params, body, headers }: any) => {
    await authorizePlatform(headers);
    const data: any = {};
    if (body?.name !== undefined) data.name = body.name;
    if (body?.cycle_days !== undefined) {
      if (!(body.cycle_days > 0)) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");
      data.cycleDays = body.cycle_days;
    }
    if (body?.is_active !== undefined) data.isActive = body.is_active;
    const exists = await prisma.billingCyclePreset.findUnique({ where: { id: params.id } });
    if (!exists) throw new ApiError("NOT_FOUND", "Preset not found");
    return ok(await prisma.billingCyclePreset.update({ where: { id: params.id }, data }));
  });
