import { prisma } from "../src/lib/prisma";
import { env } from "../src/env";

async function main() {
  const bankMasters = [
    { code: "SCB", name: "ธนาคารไทยพาณิชย์", sortOrder: 10 },
    { code: "KTB", name: "ธนาคารกรุงไทย", sortOrder: 20 },
    { code: "BBL", name: "ธนาคารกรุงเทพ", sortOrder: 30 },
    { code: "KBANK", name: "ธนาคารกสิกรไทย", sortOrder: 40 },
    { code: "BAY", name: "ธนาคารกรุงศรีอยุธยา", sortOrder: 50 },
  ];
  for (const bank of bankMasters) {
    await prisma.bankMaster.upsert({
      where: { code: bank.code },
      update: { name: bank.name, isActive: true, sortOrder: bank.sortOrder },
      create: bank,
    });
  }

  // Single local/platform admin with username/password login. Idempotent — safe on every boot.
  const adminUsername = "admin1";
  let admin = await prisma.adminUser.findUnique({ where: { username: adminUsername } });
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: {
        username: adminUsername,
        passwordHash: await Bun.password.hash(env.superAdminPassword),
        displayName: "Admin 1",
        isPlatformAdmin: true,
        isActive: true,
      },
    });
    console.log(`admin created: ${adminUsername}`);
  }

  let org = await prisma.organization.findFirst({ where: { name: "บ้านขุมทรัพย์" } });
  if (!org) org = await prisma.organization.create({ data: { name: "บ้านขุมทรัพย์" } });

  await prisma.membership.upsert({
    where: { orgId_adminUserId: { orgId: org.id, adminUserId: admin.id } },
    update: { role: "user" },
    create: { orgId: org.id, adminUserId: admin.id, role: "user" },
  });

  console.log("seed done (bank masters, admin1 and บ้านขุมทรัพย์)");
}

main().finally(() => prisma.$disconnect());
