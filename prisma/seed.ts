import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database…')

  // Create admin user
  const passwordHash = await bcrypt.hash('SCEIAdmin2026!', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sapphireclinicseast.org' },
    update: {},
    create: {
      name: 'SCEI Admin',
      email: 'admin@sapphireclinicseast.org',
      passwordHash,
      role: 'ADMIN',
    },
  })

  console.log(`✓ Admin user: ${admin.email}`)

  // Seed brand guide reference
  await prisma.brandGuide.upsert({
    where: { id: 'scei-brand-2026' },
    update: {},
    create: {
      id: 'scei-brand-2026',
      fileName: 'scei-brand-guide.html',
      fileUrl: '/brand/scei-brand-guide.html',
      analyzedAt: new Date(),
      styleJson: {
        colors: ['#1A7B8A', '#0D5B68', '#2AAABB', '#C9A227', '#1C2B30'],
        fonts: ['Montserrat', 'Open Sans'],
        tone: 'Authoritative, Compassionate, Innovative, Inclusive, Aspirational, Trustworthy',
        styleNotes: 'Use teal as primary brand color. Montserrat for headings (weight 700-900). Open Sans for body. Gold accent for premium touches. Tagline: Rehab for Every Age, Every Stage.',
      },
    },
  })

  console.log('✓ Brand guide seeded')
  console.log('\n✅ Seed complete!')
  console.log('\nDefault login credentials:')
  console.log('  Email:    admin@sapphireclinicseast.org')
  console.log('  Password: SCEIAdmin2026!')
  console.log('\n⚠️  Change the password after first login!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
