import { prisma } from '@/lib/prisma'
import { getFacebookInsights } from '@/lib/meta'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  Users,
  Eye,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
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

async function getDashboardData() {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Only the page insights remain: the scheduled-post counts and lists went with
  // the social posting feature, which had never been used.
  const insights = await getFacebookInsights(thirtyDaysAgo, now).catch(() => ({
    reach: 0, impressions: 0, engagement: 0, followers: 0,
  }))

  return { insights }
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

  const data = await getDashboardData()

  const statCards = [
    {
      label: 'Followers (FB)',
      value: data.insights.followers.toLocaleString(),
      icon: Users,
      color: 'var(--teal)',
    },
    {
      label: 'Reach (30 days)',
      value: data.insights.reach.toLocaleString(),
      icon: Eye,
      color: 'var(--bright-teal)',
    },
    {
      label: 'Engagement (30d)',
      value: data.insights.engagement.toLocaleString(),
      icon: TrendingUp,
      color: 'var(--gold)',
    },
    {
      label: 'Impressions (30d)',
      value: data.insights.impressions.toLocaleString(),
      icon: Activity,
      color: 'var(--deep-teal)',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'var(--teal)' }}
        >
          Overview
        </p>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
        >
          Good {getGreeting()}, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          {formatDate(new Date())} · Sapphire Clinics East Operations Hub
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl p-5"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
                {label}
              </p>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18` }}
              >
                <Icon size={16} style={{ color }} />
              </div>
            </div>
            <p
              className="text-2xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* The post-status summary and the scheduled/published lists that used
          to sit here went with the social posting feature. Nothing had ever
          been scheduled through it, so the boxes stood empty and linked to
          pages that no longer exist. The page insights above still come
          straight from Meta and are unaffected. */}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
