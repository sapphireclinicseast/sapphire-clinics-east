import { defineConfig } from 'prisma/config'

// Prisma 7 keeps the datasource URL out of schema.prisma; the CLI (generate /
// db push) reads it from here. The app runtime uses the PrismaPg adapter with
// DATABASE_URL directly (src/lib/prisma.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
})
