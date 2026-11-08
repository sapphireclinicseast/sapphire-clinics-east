import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FrontDeskWelcome from './FrontDeskWelcome'
import { scopeFor } from '@/lib/scoped-roles'

type BirthdayPatient = { id: string; firstName: string; lastName: string; birthday: string; hasPhone: boolean }

const BRANCH_ENUM: Record<string, string> = {
  SBEA: 'SANDBOX_EAST',
  SBGH: 'SANDBOX_GREENHILLS',
}

async function getBirthdayPatients(branch: string): Promise<BirthdayPatient[]> {
  // TODAY only. This used to run Monday–Sunday and show the rest of the week,
  // which meant the card was mostly people whose birthday had not arrived —
  // greeting them early, or greeting them twice once the day came round.
  const now = new Date()
  const today = { month: now.getMonth() + 1, day: now.getDate(), iso: (() => {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString()
  })() }

  const branchEnum = BRANCH_ENUM[branch] ?? branch

  // Use raw SQL for enum array filter — PrismaPg driver adapter doesn't
  // support `has` on PostgreSQL enum arrays (text vs "Branch" type mismatch).
  const patients = await prisma.$queryRawUnsafe<
    { id: string; firstName: string; lastName: string; dob: Date | null; phone: string | null }[]
  >(
    `SELECT id, "firstName", "lastName", dob, phone FROM "Patient"
     WHERE dob IS NOT NULL
       AND (branch::text = $1 OR $1 = ANY("branches"::text[]))`,
    branchEnum,
  )

  return patients
    .flatMap(p => {
      const dob = new Date(p.dob!)
      if (dob.getUTCMonth() + 1 !== today.month || dob.getUTCDate() !== today.day) return []
      return [{ id: p.id, firstName: p.firstName, lastName: p.lastName, birthday: today.iso, hasPhone: !!p.phone }]
    })
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
}

export default async function DashboardPage() {
  const session = await auth()

  // Investors never see the front-desk dashboard — send them straight to
  // the Patient Dashboard. This is a direct redirect (not the layout's
  // pathname-header gate) so it doesn't depend on the x-pathname header
  // being fresh on the very first post-login navigation, which is
  // unreliable during a client-side redirect chain and was causing a
  // blank page that only resolved on manual refresh.
  const scoped = scopeFor((session?.user as { role?: string })?.role)
  if (scoped) {
    redirect(scoped.home)
  }

  // ── Everyone sees the front-desk-style welcome dashboard ──
  // Branch defaults from role: SBEA/SBGH-scoped admins see their branch;
  // ADMIN, MARKETING_ADMIN, VERDANA_ADMIN default to SBEA. Front desk roles
  // continue to see their assigned branch as before.
  const role = session?.user?.role
  const branch =
    role === 'AHGH_FRONT_DESK' || role === 'AHGH_ADMIN' ? 'SBGH' :
    'SBEA'
  const userName = session?.user?.name ?? undefined
  const birthdayPatients = await getBirthdayPatients(branch)
  // Main admins aren't tied to a clinic. `branch` above still drives the
  // branch-specific widgets (reminders, birthdays, no-shows), which genuinely
  // need one clinic; this flag only widens the plush-toy perk list, where a
  // main admin is meant to see VIP holders across both branches.
  const seesAllBranches = role === 'ADMIN' || role === 'MARKETING_ADMIN'
  return (
    <FrontDeskWelcome
      name={userName}
      branch={branch}
      seesAllBranches={seesAllBranches}
      birthdayPatients={birthdayPatients}
    />
  )
}

