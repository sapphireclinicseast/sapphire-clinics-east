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
      role?: string
      branch?: string | null
    }
  }
  interface User {
    role?: string
    branch?: string | null
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
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log('[auth] Missing credentials')
            return null
          }

          console.log('[auth] Attempt:', credentials.email)

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          })

          console.log('[auth] User found:', !!user)
          if (!user) return null
          if (user.disabled) { console.log('[auth] User disabled — login blocked'); return null }

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          )

          console.log('[auth] Password valid:', valid)
          if (!valid) return null

          // Update last login (non-fatal — don't block login if this fails)
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }).catch((e: unknown) => console.error('[auth] lastLoginAt update failed:', e))

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as string,
            branch: user.branch as string | null,
          }
        } catch (e: unknown) {
          console.error('[auth] authorize threw:', e)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.branch = user.branch
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.branch = (token.branch as string) ?? null
      }
      return session
    },
  },
})
