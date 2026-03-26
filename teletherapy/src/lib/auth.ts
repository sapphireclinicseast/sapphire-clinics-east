import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { rateLimit } from './rate-limit'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      staffId: string
      role: string
      department?: string
      branch?: string
    }
  }
  interface User {
    staffId: string
    role: string
    department?: string
    branch?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12 hours — sessions expire after 12h of inactivity
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email = (credentials.email as string).toLowerCase().trim()

        // Rate limit: 10 attempts per 15 minutes per email
        const { success } = rateLimit(`login:${email}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 })
        if (!success) return null

        const account = await prisma.therapistAccount.findUnique({
          where: { email },
          include: { staff: true },
        })

        if (!account || !account.isActive) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          account.passwordHash
        )

        if (!valid) return null

        await prisma.therapistAccount.update({
          where: { id: account.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: account.id,
          name: `${account.staff.firstName} ${account.staff.lastName}`,
          email: account.email,
          staffId: account.staffId,
          role: account.role,
          department: account.staff.department,
          branch: account.staff.branch,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.staffId = user.staffId
        token.role = user.role
        token.department = user.department
        token.branch = user.branch
      }

      // On every token refresh, check if account is still active
      if (token.id) {
        const account = await prisma.therapistAccount.findUnique({
          where: { id: token.id as string },
          select: { isActive: true },
        })
        if (!account?.isActive) {
          // Force sign out by returning empty token
          return { ...token, isActive: false }
        }
      }

      return token
    },
    async session({ session, token }) {
      // If account was disabled, invalidate the session
      if (token.isActive === false) {
        throw new Error('Account disabled')
      }

      if (token) {
        session.user.id = token.id as string
        session.user.staffId = token.staffId as string
        session.user.role = token.role as string
        session.user.department = token.department as string
        session.user.branch = token.branch as string
      }
      return session
    },
  },
})
