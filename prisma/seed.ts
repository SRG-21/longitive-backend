import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Default Clinic',
      slug: 'default',
      plan: 'FREE',
      status: 'ACTIVE',
    },
  });

  console.log('Seeded tenant:', tenant.name);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@longevity.app' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@longevity.app',
      name: 'System Admin',
      role: 'ADMIN',
      passwordHash: '$2a$10$placeholder', // Replace with real hash
    },
  });

  console.log('Seeded admin user:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
