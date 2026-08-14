import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";

async function main() {
  // Super admin (platform admin) with username/password login. Idempotent — safe on every boot.
  const existing = await prisma.adminUser.findUnique({ where: { username: env.superAdminUsername } });
  if (!existing) {
    await prisma.adminUser.create({
      data: {
        username: env.superAdminUsername,
        passwordHash: await Bun.password.hash(env.superAdminPassword),
        displayName: "Super Admin",
        isPlatformAdmin: true,
        isActive: true,
      },
    });
    console.log(`super admin created: ${env.superAdminUsername}`);
  }

  // Everything below is dev-only mock data. Never in production — orgs/OAs/banks
  // are created through the app by the super admin.
  if (process.env.NODE_ENV === "production") {
    console.log("seed done (production: super admin only)");
    return;
  }

  // A default organization (tenant) + its default OA and bank account, so dev works out of the box.
  let org = await prisma.organization.findFirst();
  if (!org) org = await prisma.organization.create({ data: { name: "Default Org" } });

  if ((await prisma.lineOaAccount.count({ where: { orgId: org.id } })) === 0) {
    await prisma.lineOaAccount.create({
      data: {
        orgId: org.id,
        name: "Default OA",
        channelId: env.lineLoginChannelId || "dev",
        channelSecret: "",
        channelAccessToken: "",
      },
    });
  }
  if ((await prisma.bankAccount.count({ where: { orgId: org.id } })) === 0) {
    await prisma.bankAccount.create({
      data: {
        orgId: org.id,
        accountName: "ชลดา พรมเมศ",
        accountNo: "2509480357",
        bankName: "ธนาคารกรุงศรีอยุธยา",
        bankCode: "BAY",
        isDefault: true,
        isActive: true,
      },
    });
  }
  // A regular org user for dev login.
  const mockUser = await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: await Bun.password.hash("admin1234"),
      displayName: "สมชาย ใจดี",
      isPlatformAdmin: false,
      isActive: true,
    },
  });
  await prisma.membership.upsert({
    where: { orgId_adminUserId: { orgId: org.id, adminUserId: mockUser.id } },
    update: {},
    create: { orgId: org.id, adminUserId: mockUser.id },
  });
  console.log("mock user: admin / admin1234 (org:", org.id, ")");

  console.log("seed done. default org:", org.id);
}

main().finally(() => prisma.$disconnect());
