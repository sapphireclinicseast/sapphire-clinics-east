import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
  const prisma = new PrismaClient({ adapter })

  // Find the first staff member to link the admin to (or create without link)
  const firstStaff = await prisma.staff.findFirst({
    where: {
      department: { in: ['OT', 'PT', 'SLP', 'SPED', 'PSYCHOLOGY'] },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (!firstStaff) {
    console.log('No therapy staff found in database. Cannot create admin account.')
    console.log('Please add staff members via the Marketing Hub first.')
    return
  }

  const existing = await prisma.therapistAccount.findUnique({
    where: { email: 'admin@sapphireclinicseast.org' },
  })

  if (existing) {
    console.log('Admin account already exists:', existing.email)
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
  console.log('Please change the password after first login.')

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
