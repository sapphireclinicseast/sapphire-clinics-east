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
    }
  }
  interface User {
    role?: string
  }
}

// Use distinct cookie names so the marketing hub session cannot bleed into (or
// be overwritten by) the teletherapy hub, which also runs on *.sapphireclinicseast.org
// and deliberately scopes its cookies to the parent domain for SSO purposes.
const SECURE = process.env.NODE_ENV === 'production'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  cookies: {
    sessionToken: {
      name: SECURE ? '__Secure-mktg.session-token' : 'mktg.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE },
    },
    callbackUrl: {
      name: SECURE ? '__Secure-mktg.callback-url' : 'mktg.callback-url',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE },
    },
    csrfToken: {
      name: SECURE ? '__Secure-mktg.csrf-token' : 'mktg.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE },
    },
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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!valid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as string,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
})
