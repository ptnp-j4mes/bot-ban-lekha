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

  // Keep the local admin screen useful after a fresh seed. Production seeds
  // remain clean; these rows are only demo data for the default development org.
  if (process.env.NODE_ENV !== "production") {
    const masterRows = await prisma.bankMaster.findMany({ where: { code: { in: bankMasters.map((b) => b.code) } } });
    const byCode = new Map(masterRows.map((bank) => [bank.code, bank]));
    const hasAccounts = await prisma.bankAccount.findFirst({ where: { orgId: org.id } });
    const demoAccounts = [
      { accountName: "บริษัท บ้านขุมทรัพย์ จำกัด", accountNo: "123-4-56789-0", code: "SCB", branchName: "สำนักงานใหญ่", isDefault: true, isActive: true, note: "บัญชีหลักสำหรับรับชำระบิล" },
      { accountName: "บ้านขุมทรัพย์ สาขา 2", accountNo: "987-6-54321-0", code: "KTB", branchName: "สาขาตลาดไท", isDefault: false, isActive: true, note: "บัญชีสำรอง" },
      { accountName: "บ้านขุมทรัพย์ บัญชีเก่า", accountNo: "111-2-33333-4", code: "KBANK", branchName: "สำนักงานใหญ่", isDefault: false, isActive: false, note: "ปิดใช้งานแล้ว" },
    ];
    for (const demo of demoAccounts) {
      const master = byCode.get(demo.code);
      if (!master) continue;
      const exists = await prisma.bankAccount.findFirst({ where: { orgId: org.id, accountNo: demo.accountNo } });
      if (!exists) {
        await prisma.bankAccount.create({
          data: {
            orgId: org.id,
            accountName: demo.accountName,
            accountNo: demo.accountNo,
            bankMasterId: master.id,
            bankName: master.name,
            bankCode: master.code,
            branchName: demo.branchName,
            isDefault: demo.isDefault && !hasAccounts,
            isActive: demo.isActive,
            note: demo.note,
          },
        });
      } else if (demo.isDefault && hasAccounts && exists.isDefault) {
        // Repair a duplicate created by an older version of this seed while
        // leaving the pre-existing organization default untouched.
        await prisma.bankAccount.update({ where: { id: exists.id }, data: { isDefault: false } });
      }
    }
  }

  await prisma.membership.upsert({
    where: { orgId_adminUserId: { orgId: org.id, adminUserId: admin.id } },
    update: { role: "user" },
    create: { orgId: org.id, adminUserId: admin.id, role: "user" },
  });

  console.log("seed done (bank masters, admin1 and บ้านขุมทรัพย์)");
}

main().finally(() => prisma.$disconnect());
