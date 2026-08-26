// GET /api/notifications
// Computes the logged-in user's notification list from every role-relevant
// source (tickets, patient uploads, patient/peer appreciation, trainings, and
// intern-supervision submissions), then flags each as read/unread against the
// per-account read cursor (NotificationSeen.seenKeys). Read-only compute — the
// only write is the sibling POST /api/notifications/seen.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const HR_API_BASE = process.env.HR_API_BASE ?? 'https://hr.sapphireclinicseast.org/api'
const HR_API_KEY = process.env.HR_API_KEY ?? ''

interface NotifItem {
  key: string
  type: 'ticket' | 'upload' | 'love' | 'training' | 'supervision'
  title: string
  body?: string
  createdAt: string // ISO
  href: string
}

function normDept(s: string): string {
  const u = (s || '').trim().toUpperCase()
  if (u === 'PSYCH' || u === 'PSYCHOLOGY') return 'PSYCHOLOGY'
  if (u === 'MD' || u === 'DOCTOR') return 'MD'
  return u
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const u = session.user as unknown as {
    id: string
    role?: string
    staffId?: string
    department?: string
    email?: string
    isInternshipSupervisor?: boolean
    branches?: { staffId: string; branch: string; department: string }[]
  }
  const accountId = u.id
  const isAdmin = u.role === 'ADMIN'
  const isSupervisor = !!u.isInternshipSupervisor
  const branches = u.branches ?? []
  const myStaffIds = Array.from(new Set([...branches.map((b) => b.staffId), u.staffId].filter(Boolean))) as string[]
  const myDepts = Array.from(
    new Set([...branches.map((b) => b.department), u.department].filter(Boolean).map((d) => normDept(d as string))),
  )

  const items: NotifItem[] = []

  const tasks: Promise<void>[] = [
    // ── All users: replies to a ticket I raised ──
    (async () => {
      const t = await prisma.ticket.findMany({
        where: { raisedByAccountId: accountId, resolvedAt: { not: null } },
        orderBy: { resolvedAt: 'desc' },
        take: 20,
      })
      for (const x of t) {
        items.push({
          key: `ticket-resolved:${x.id}`,
          type: 'ticket',
          title: 'Your concern was answered',
          body: x.subject,
          createdAt: (x.resolvedAt as Date).toISOString(),
          // Admins manage tickets at /tickets; everyone else views the reply in
          // the floating Concerns widget ("My tickets" tab).
          href: isAdmin ? '/tickets' : 'concerns:mine',
        })
      }
    })(),

    // ── All users: meeting invitations (supervision / mentorship) ──
    (async () => {
      if (myStaffIds.length === 0) return
      const ms = await prisma.supervisionMeeting.findMany({
        where: { inviteeStaffIds: { hasSome: myStaffIds } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      for (const m of ms) {
        const label = m.context === 'MENTORSHIP' ? 'Mentorship' : 'Intern Supervision'
        const when = new Date(m.date)
        const dayStr = Number.isNaN(when.getTime()) ? '' : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        items.push({
          key: `meeting:${m.id}`,
          type: 'supervision',
          title: `You're invited to a meeting${m.title ? ': ' + m.title : ''}`,
          body: `${label} · ${dayStr} at ${m.timeLabel}`,
          createdAt: m.createdAt.toISOString(),
          href: m.context === 'MENTORSHIP' ? '/mentorship' : '/intern-supervision?tab=meeting',
        })
      }
    })(),

    // ── Clinician: patient uploads (home progress) for ACTIVE assignments ──
    (async () => {
      const assigns = await prisma.patientAssignment.findMany({
        where: { therapistAccountId: accountId, status: 'ACTIVE' },
        select: { patientId: true },
      })
      const patientIds = assigns.map((a) => a.patientId)
      if (patientIds.length === 0) return
      const files = await prisma.homeProgressFile.findMany({
        where: { entry: { patientId: { in: patientIds } } },
        select: {
          id: true, kind: true, createdAt: true,
          entry: { select: { patientId: true, patient: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
      for (const f of files) {
        const name = `${f.entry.patient.firstName} ${f.entry.patient.lastName}`
        const kindLabel = f.kind === 'VIDEO' ? 'a video' : f.kind === 'AUDIO' ? 'a voice note' : f.kind === 'PHOTO' ? 'a photo' : 'a file'
        items.push({
          key: `hp:${f.id}`,
          type: 'upload',
          title: `${name} uploaded ${kindLabel}`,
          body: 'Home Progress',
          createdAt: f.createdAt.toISOString(),
          href: `/patients/${f.entry.patientId}?tab=uploads`,
        })
      }
      // Referral / PWD ID — no per-field timestamp, so best-effort on updatedAt.
      const pts = await prisma.patient.findMany({
        where: { id: { in: patientIds }, OR: [{ referralUrl: { not: null } }, { pwdIdUrl: { not: null } }] },
        select: { id: true, firstName: true, lastName: true, referralUrl: true, pwdIdUrl: true, updatedAt: true },
      })
      for (const p of pts) {
        const name = `${p.firstName} ${p.lastName}`
        if (p.referralUrl) items.push({ key: `referral:${p.id}`, type: 'upload', title: `Doctor's referral on file — ${name}`, body: 'Patient Uploads', createdAt: p.updatedAt.toISOString(), href: `/patients/${p.id}?tab=uploads` })
        if (p.pwdIdUrl) items.push({ key: `pwd:${p.id}`, type: 'upload', title: `PWD ID on file — ${name}`, body: 'Patient Uploads', createdAt: p.updatedAt.toISOString(), href: `/patients/${p.id}?tab=uploads` })
      }
    })(),

    // ── Clinician: "What Patients Love About You" ──
    (async () => {
      if (myStaffIds.length === 0) return
      const rs = await prisma.surveyResponse.findMany({
        where: { staffId: { in: myStaffIds } },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      })
      for (const r of rs) {
        items.push({ key: `survey:${r.id}`, type: 'love', title: 'A patient shared appreciation for you 💚', body: 'What Patients Love About You', createdAt: r.submittedAt.toISOString(), href: '/patients-love' })
      }
    })(),

    // ── Clinician: "What Your Peers Love About You" ──
    (async () => {
      if (myStaffIds.length === 0) return
      const rs = await prisma.peerEvalResponse.findMany({
        where: { assesseeId: { in: myStaffIds }, strengths: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      })
      for (const r of rs) {
        items.push({ key: `peer:${r.id}`, type: 'love', title: 'A peer shared appreciation for you 🤝', body: 'What Your Peers Love About You', createdAt: r.submittedAt.toISOString(), href: '/peers-love' })
      }
    })(),

    // ── Clinician: new trainings appropriate to their department ──
    (async () => {
      if (!HR_API_KEY) return
      const res = await fetch(`${HR_API_BASE}/internal/seminars`, { headers: { Authorization: `Bearer ${HR_API_KEY}` }, cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { ok?: boolean; seminars?: Array<{ id: string; title: string; date?: string; status?: string; disciplineFocus?: string[] }> }
      for (const s of data.seminars ?? []) {
        if ((s.status ?? 'upcoming') !== 'upcoming') continue
        const focus = (s.disciplineFocus ?? []).map(normDept).filter(Boolean)
        const matches = isAdmin || focus.length === 0 || myDepts.length === 0 || focus.some((f) => myDepts.includes(f))
        if (!matches) continue
        const when = s.date ? new Date(s.date) : new Date()
        items.push({
          key: `seminar:${s.id}`,
          type: 'training',
          title: `New training: ${s.title}`,
          body: s.date ? `Scheduled ${s.date}` : 'Upcoming training',
          createdAt: Number.isNaN(when.getTime()) ? new Date(0).toISOString() : when.toISOString(),
          href: '/seminars',
        })
      }
    })(),

    // ── Admin: new ticket submissions ──
    (async () => {
      if (!isAdmin) return
      const t = await prisma.ticket.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 30 })
      for (const x of t) {
        items.push({ key: `ticket-open:${x.id}`, type: 'ticket', title: `New concern: ${x.subject}`, body: `From ${x.raisedByName}`, createdAt: x.createdAt.toISOString(), href: '/tickets' })
      }
    })(),

    // ── Clinical supervisors: Learning Profiles / Balik-Tanaw / Documents ──
    (async () => {
      const canSeeAll = isAdmin || isSupervisor
      let deckedInternIds: string[] = []
      if (!canSeeAll) {
        if (myStaffIds.length === 0) return
        const decked = await prisma.schedule.findMany({
          where: { internStaffId: { not: null }, staffId: { in: myStaffIds } },
          select: { internStaffId: true },
          distinct: ['internStaffId'],
        })
        deckedInternIds = decked.map((d) => d.internStaffId).filter((x): x is string => !!x)
        if (deckedInternIds.length === 0) return // not a supervisor of anyone
      }
      const internScope = canSeeAll ? {} : { internStaffId: { in: deckedInternIds } }

      const [lps, bts, docs] = await Promise.all([
        prisma.learningProfile.findMany({ where: internScope, orderBy: { updatedAt: 'desc' }, take: 20 }),
        prisma.balikTanaw.findMany({ where: { ...internScope, supervisorSignedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }),
        prisma.internshipDocument.findMany({ where: canSeeAll ? {} : { department: { in: myDepts.length ? myDepts : ['__none__'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ])

      const internIds = Array.from(new Set(lps.map((l) => l.internStaffId)))
      const staffMap = new Map<string, string>()
      if (internIds.length) {
        const staff = await prisma.staff.findMany({ where: { id: { in: internIds } }, select: { id: true, firstName: true, lastName: true } })
        staff.forEach((s) => staffMap.set(s.id, `${s.firstName} ${s.lastName}`))
      }
      for (const l of lps) {
        const nm = staffMap.get(l.internStaffId) ?? 'An intern'
        items.push({ key: `learning:${l.internStaffId}:${l.updatedAt.getTime()}`, type: 'supervision', title: `${nm} submitted a Learning Profile`, body: 'Intern Supervision · Learning Profiles', createdAt: l.updatedAt.toISOString(), href: '/intern-supervision?tab=learning' })
      }
      for (const b of bts) {
        items.push({ key: `balik:${b.id}`, type: 'supervision', title: `${b.internSignedName || 'An intern'} submitted a Balik-Tanaw`, body: 'Intern Supervision · Balik-Tanaw — awaiting your signature', createdAt: (b.internSignedAt ?? b.createdAt).toISOString(), href: '/intern-supervision?tab=balik-tanaw' })
      }
      for (const d of docs) {
        items.push({ key: `interndoc:${d.id}`, type: 'supervision', title: `New internship document: ${d.title}`, body: 'Intern Supervision · Documents', createdAt: d.createdAt.toISOString(), href: '/intern-supervision?tab=documents' })
      }
    })(),
  ]

  // Never let one source break the bell.
  await Promise.all(tasks.map((t) => t.catch(() => {})))

  const seen = await prisma.notificationSeen.findUnique({ where: { accountId } }).catch(() => null)
  const seenSet = new Set(seen?.seenKeys ?? [])

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const capped = items.slice(0, 60)
  const withRead = capped.map((i) => ({ ...i, unread: !seenSet.has(i.key) }))
  const unreadCount = withRead.filter((i) => i.unread).length

  return NextResponse.json({ items: withRead, unreadCount })
}
