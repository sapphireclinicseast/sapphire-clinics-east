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
      branches?: string[]
    }
  }
  interface User {
    role?: string
    branch?: string | null
    branches?: string[]
  }
}

// Backward-compat: the SBEA/SBGH branch roles were renamed to AHEA/AHGH. Sessions
// (JWTs) minted before the rename still carry the old value, which no longer matches
// any role check → spurious "Insufficient permissions". Migrate them on the fly so
// lingering sessions keep working without a forced re-login.
const LEGACY_ROLE_ALIASES: Record<string, string> = {
  SBEA_ADMIN: 'AHEA_ADMIN',
  SBGH_ADMIN: 'AHGH_ADMIN',
  SBEA_FRONTDESK: 'AHEA_FRONTDESK',
  SBGH_FRONTDESK: 'AHGH_FRONTDESK',
  SBEA_FRONT_DESK: 'AHEA_FRONTDESK',
  SBGH_FRONT_DESK: 'AHGH_FRONTDESK',
}
const normalizeRole = (r?: string | null): string | null | undefined =>
  (r && LEGACY_ROLE_ALIASES[r]) || r

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
            branches: (user.branches as string[]) ?? [],
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
        token.branches = user.branches ?? []
      }
      // Migrate any legacy branch role stored in an existing token.
      if (token.role) token.role = normalizeRole(token.role as string)
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = normalizeRole(token.role as string) as string
        session.user.branch = (token.branch as string) ?? null
        session.user.branches = (token.branches as string[]) ?? []
      }
      return session
    },
  },
})
