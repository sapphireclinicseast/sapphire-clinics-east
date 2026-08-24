import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { rateLimit } from './rate-limit'

interface BranchInfo {
  staffId: string
  branch: string
  department: string
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      staffId: string
      role: string
      accountType?: string
      department?: string
      branch?: string
      branches?: BranchInfo[]
      employmentType?: string
      isInternshipSupervisor?: boolean
    }
  }
  interface User {
    staffId: string
    role: string
    accountType?: string
    department?: string
    branch?: string
    branches?: BranchInfo[]
    employmentType?: string
    isInternshipSupervisor?: boolean
  }
}

// Scope auth cookies to the parent domain so a session set when logging
// in via the marketing-site proxy (sapphireclinicseast.org/stafflogin)
// is also valid on teletherapy.sapphireclinicseast.org.
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production'
  ? '.sapphireclinicseast.org'
  : undefined
const SECURE_COOKIES = process.env.NODE_ENV === 'production'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12 hours — sessions expire after 12h of inactivity
  },
  pages: {
    signIn: '/login',
  },
  cookies: {
    sessionToken: {
      name: SECURE_COOKIES ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE_COOKIES, domain: COOKIE_DOMAIN },
    },
    callbackUrl: {
      name: SECURE_COOKIES ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE_COOKIES, domain: COOKIE_DOMAIN },
    },
    // CSRF token cannot use the __Host- prefix when we set Domain, so use __Secure- instead.
    csrfToken: {
      name: SECURE_COOKIES ? '__Secure-authjs.csrf-token' : 'authjs.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: SECURE_COOKIES, domain: COOKIE_DOMAIN },
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

        // Build the branch list that drives the top-bar switcher. Two
        // interbranch models coexist and BOTH must yield >1 entry:
        //   • NEW — one merged Staff row carrying extraBranches[] (all of the
        //     consultant's schedules sit under this single staffId; a
        //     session's branch is derived from its patient).
        //   • LEGACY — the same email maps to >1 Staff row, one per branch,
        //     each with its own staffId.
        // Earlier this only handled the LEGACY case (email → many rows), so a
        // merged consultant like an SBEA psychologist who also consults at
        // SBGH via extraBranches got a single entry and no toggle.
        const staffEmail = account.staff.email
        const rawBranches: BranchInfo[] = [
          { staffId: account.staff.id, branch: account.staff.branch, department: account.staff.department },
          ...(account.staff.extraBranches ?? []).map((b) => ({
            staffId: account.staff.id,
            branch: b,
            department: account.staff.department,
          })),
        ]

        if (staffEmail) {
          const allStaffWithEmail = await prisma.staff.findMany({
            where: { email: staffEmail },
            select: { id: true, branch: true, department: true, extraBranches: true },
          })
          for (const s of allStaffWithEmail) {
            rawBranches.push({ staffId: s.id, branch: s.branch, department: s.department })
            for (const extra of s.extraBranches ?? []) {
              rawBranches.push({ staffId: s.id, branch: extra, department: s.department })
            }
          }
        }

        // Dedupe by branch code (a consultant works each branch once). When a
        // branch appears more than once, prefer the entry tied to the signed-in
        // account's own Staff row so single-account filtering stays stable.
        const byBranch = new Map<string, BranchInfo>()
        for (const b of rawBranches) {
          const existing = byBranch.get(b.branch)
          if (!existing || b.staffId === account.staff.id) byBranch.set(b.branch, b)
        }
        const branches: BranchInfo[] = Array.from(byBranch.values())

        return {
          id: account.id,
          name: `${account.staff.firstName} ${account.staff.lastName}`,
          email: account.email,
          staffId: account.staffId,
          role: account.role,
          accountType: (account as { accountType?: string }).accountType ?? 'CLINICIAN',
          department: account.staff.department,
          branch: account.staff.branch,
          branches,
          employmentType: account.staff.employmentType ?? undefined,
          isInternshipSupervisor: account.staff.isInternshipSupervisor ?? false,
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
        token.accountType = user.accountType
        token.department = user.department
        token.branch = user.branch
        token.branches = user.branches
        token.employmentType = user.employmentType
        token.isInternshipSupervisor = user.isInternshipSupervisor
      }

      // On every token refresh, check if account is still active and keep the
      // employment type + supervisor tag fresh (drives the employees-only
      // Company Loan tab and the Intern Supervision "All Interns" view;
      // backfills sessions that logged in before either field existed) —
      // ticking the tag in HR Staff Profiles takes effect without re-login.
      if (token.id) {
        const account = await prisma.therapistAccount.findUnique({
          where: { id: token.id as string },
          select: { isActive: true, staff: { select: { employmentType: true, isInternshipSupervisor: true } } },
        })
        if (!account?.isActive) {
          // Force sign out by returning empty token
          return { ...token, isActive: false }
        }
        token.employmentType = account.staff?.employmentType ?? undefined
        token.isInternshipSupervisor = account.staff?.isInternshipSupervisor ?? false
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
        session.user.accountType = (token.accountType as string) ?? 'CLINICIAN'
        session.user.department = token.department as string
        session.user.branch = token.branch as string
        session.user.branches = (token.branches as BranchInfo[]) ?? []
        session.user.employmentType = (token.employmentType as string) ?? undefined
        session.user.isInternshipSupervisor = (token.isInternshipSupervisor as boolean) ?? false
      }
      return session
    },
  },
})
