import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
  const prisma = new PrismaClient({ adapter })

  // Find first therapy staff using raw query to avoid schema mismatch
  const staffRows = await prisma.$queryRaw<{ id: string; firstName: string; lastName: string }[]>`
    SELECT id, "firstName", "lastName" FROM "Staff"
    WHERE department IN ('OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY')
    ORDER BY "createdAt" ASC
    LIMIT 1
  `

  if (staffRows.length === 0) {
    console.log('No therapy staff found in database. Cannot create admin account.')
    console.log('Please add staff members via the Marketing Hub first.')
    await prisma.$disconnect()
    return
  }

  const firstStaff = staffRows[0]

  const existing = await prisma.therapistAccount.findUnique({
    where: { email: 'admin@sapphireclinicseast.org' },
  })

  if (existing) {
    console.log('Admin account already exists:', existing.email)
    await prisma.$disconnect()
    return
  }

  const passwordHash = await bcrypt.hash('teletherapy2026', 12)

  const admin = await prisma.therapistAccount.create({
    data: {
      staffId: firstStaff.id,
      email: 'admin@sapphireclinicseast.org',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log('Created admin account:', admin.email)
  console.log('Linked to staff:', firstStaff.firstName, firstStaff.lastName)
  console.log('Default password: teletherapy2026')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
