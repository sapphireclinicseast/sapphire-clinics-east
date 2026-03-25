import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

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
  session: { strategy: 'jwt' },
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

        const account = await prisma.therapistAccount.findUnique({
          where: { email: credentials.email as string },
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
      return token
    },
    async session({ session, token }) {
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
