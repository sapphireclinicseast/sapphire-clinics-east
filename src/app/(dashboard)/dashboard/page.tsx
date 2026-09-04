import { prisma } from '@/lib/prisma'
import { getFacebookInsights } from '@/lib/meta'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  Users,
  Eye,
  TrendingUp,
  Send,
  Calendar,
  Cake,
  Activity,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import FrontDeskWelcome from './FrontDeskWelcome'

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

  const [scheduledCount, publishedCount, draftCount, upcomingPosts, recentPosts, insights] =
    await Promise.all([
      prisma.scheduledPost.count({ where: { status: 'SCHEDULED' } }),
      prisma.scheduledPost.count({ where: { status: 'PUBLISHED' } }),
      prisma.scheduledPost.count({ where: { status: 'DRAFT' } }),
      prisma.scheduledPost.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { gte: now } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.scheduledPost.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { createdBy: { select: { name: true } } },
      }),
      getFacebookInsights(thirtyDaysAgo, now).catch(() => ({
        reach: 0, impressions: 0, engagement: 0, followers: 0,
      })),
    ])

  return {
    scheduledCount,
    publishedCount,
    draftCount,
    upcomingPosts,
    recentPosts,
    insights,
  }
}

const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  TIKTOK: '#000000',
}

export default async function DashboardPage() {
  const session = await auth()

  // Investors never see the front-desk dashboard — send them straight to
  // the Patient Dashboard. This is a direct redirect (not the layout's
  // pathname-header gate) so it doesn't depend on the x-pathname header
  // being fresh on the very first post-login navigation, which is
  // unreliable during a client-side redirect chain and was causing a
  // blank page that only resolved on manual refresh.
  if ((session?.user as { role?: string })?.role === 'INVESTOR') {
    redirect('/patients/dashboard')
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

  // (Marketing-hub stats view below is kept as dead code in case we ever want
  // a separate route for it; remove if unused after a few weeks.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      {/* Post Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Scheduled', count: data.scheduledCount, icon: Calendar, color: 'var(--teal)' },
          { label: 'Published', count: data.publishedCount, icon: Send, color: 'var(--gold)' },
          { label: 'Drafts', count: data.draftCount, icon: Cake, color: 'var(--mid-gray)' },
        ].map(({ label, count, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}18` }}
            >
              <Icon size={20} style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {count}
              </p>
              <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Posts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div
          className="rounded-xl p-5"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-bold text-sm"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
            >
              Upcoming Scheduled Posts
            </h2>
            <a
              href="/social/scheduled"
              className="text-xs font-semibold"
              style={{ color: 'var(--teal)' }}
            >
              View all
            </a>
          </div>
          {data.upcomingPosts.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--mid-gray)' }}>
              No posts scheduled yet
            </p>
          ) : (
            <ul className="space-y-3">
              {data.upcomingPosts.map((post) => (
                <li
                  key={post.id}
                  className="flex items-start gap-3 pb-3"
                  style={{ borderBottom: '1px solid var(--light-gray)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: 'var(--teal)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>
                      {post.content.slice(0, 80)}…
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {formatDate(post.scheduledAt)}
                      </span>
                      {post.platforms.map((p) => (
                        <span
                          key={p}
                          className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: `${PLATFORM_COLORS[p]}18`,
                            color: PLATFORM_COLORS[p],
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recently Published */}
        <div
          className="rounded-xl p-5"
          style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-bold text-sm"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
            >
              Recently Published
            </h2>
            <a
              href="/social/published"
              className="text-xs font-semibold"
              style={{ color: 'var(--teal)' }}
            >
              View all
            </a>
          </div>
          {data.recentPosts.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--mid-gray)' }}>
              No posts published yet
            </p>
          ) : (
            <ul className="space-y-3">
              {data.recentPosts.map((post) => (
                <li
                  key={post.id}
                  className="flex items-start gap-3 pb-3"
                  style={{ borderBottom: '1px solid var(--light-gray)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: 'var(--gold)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>
                      {post.content.slice(0, 80)}…
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
                      {post.createdBy.name} · {formatDate(post.updatedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
