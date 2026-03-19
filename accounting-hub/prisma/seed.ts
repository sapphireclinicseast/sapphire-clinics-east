import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  const passwordHash = await bcrypt.hash('SCEIAccounting2026!', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sapphireclinicseast.org' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@sapphireclinicseast.org',
      passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('Seeded admin user:', admin.email)
  console.log('Default password: SCEIAccounting2026!')
  console.log('⚠️  Change this password after first login!')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
