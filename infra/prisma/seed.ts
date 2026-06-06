/**
 * VendorBridge seed — first-run demo data (Spec §11 Phase 0).
 * Creates 1 organization, one user per role, vendor categories, and sample vendors.
 * Idempotent: safe to re-run (upserts by unique keys).
 *
 * Run: pnpm db:seed
 */
import { PrismaClient, Role, VendorStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

async function main() {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // 1) Organization
  const org = await prisma.organization.upsert({
    where: { id: 'org_demo' },
    update: {},
    create: {
      id: 'org_demo',
      name: 'Acme Manufacturing Pvt Ltd',
      gstin: '27AAACA1234A1Z5',
    },
  });

  // 2) One user per role
  const users: Array<{ email: string; name: string; role: Role }> = [
    { email: 'admin@vendorbridge.dev', name: 'Aisha Admin', role: Role.ADMIN },
    { email: 'officer@vendorbridge.dev', name: 'Omar Officer', role: Role.PROCUREMENT_OFFICER },
    { email: 'approver@vendorbridge.dev', name: 'Priya Approver', role: Role.APPROVER },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, organizationId: org.id },
      create: { ...u, organizationId: org.id, passwordHash },
    });
  }

  // 3) Vendor categories
  const categoryNames = ['Raw Materials', 'Electronics', 'Packaging', 'Logistics Services'];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const cat = await prisma.vendorCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
    categories[name] = cat.id;
  }

  // 4) Sample vendors + a vendor-portal login
  const vendorUser = await prisma.user.upsert({
    where: { email: 'vendor@steelco.dev' },
    update: { organizationId: org.id, role: Role.VENDOR },
    create: {
      email: 'vendor@steelco.dev',
      name: 'Vikram Vendor',
      role: Role.VENDOR,
      organizationId: org.id,
      passwordHash,
    },
  });

  const vendors = [
    {
      name: 'SteelCo Industries',
      email: 'sales@steelco.dev',
      phone: '+91-9876543210',
      gstin: '27AAACS1111A1Z5',
      category: 'Raw Materials',
      rating: 4.6,
      status: VendorStatus.ACTIVE,
      userId: vendorUser.id,
    },
    {
      name: 'BrightCircuit Electronics',
      email: 'contact@brightcircuit.dev',
      phone: '+91-9811122233',
      gstin: '29AAACB2222B1Z4',
      category: 'Electronics',
      rating: 4.2,
      status: VendorStatus.ACTIVE,
    },
    {
      name: 'PackWell Solutions',
      email: 'hello@packwell.dev',
      phone: '+91-9700011122',
      gstin: '24AAACP3333C1Z3',
      category: 'Packaging',
      rating: 3.9,
      status: VendorStatus.ACTIVE,
    },
    {
      name: 'OldGuard Traders',
      email: 'info@oldguard.dev',
      phone: '+91-9000022211',
      gstin: '07AAACO4444D1Z2',
      category: 'Raw Materials',
      rating: 2.8,
      status: VendorStatus.INACTIVE,
    },
  ];

  for (const v of vendors) {
    const { category, ...rest } = v;
    await prisma.vendor.upsert({
      where: { organizationId_email: { organizationId: org.id, email: v.email } },
      update: {},
      create: {
        ...rest,
        organizationId: org.id,
        categoryId: categories[category],
      },
    });
  }

  console.log('\n✅ Seed complete.');
  console.log('   Organization:', org.name);
  console.log('   Login with password:', DEMO_PASSWORD);
  console.table([
    { role: 'ADMIN', email: 'admin@vendorbridge.dev' },
    { role: 'PROCUREMENT_OFFICER', email: 'officer@vendorbridge.dev' },
    { role: 'APPROVER', email: 'approver@vendorbridge.dev' },
    { role: 'VENDOR', email: 'vendor@steelco.dev' },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
