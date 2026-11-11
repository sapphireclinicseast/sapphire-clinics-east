'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users, Mail, BookOpen, ChevronRight, Link2, X, BarChart2,
  UserCog, ListOrdered, CalendarDays, ClipboardCheck, Layers, HeartHandshake,
  UsersRound, FileText, Activity, FileCheck, Building2,
  MessageSquare, Inbox, Trophy} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Role helpers ────────────────────────────────────────────────────────────
const FRONT_DESK_ROLES = ['AHEA_FRONT_DESK', 'AHGH_FRONT_DESK']

// ─── Nav item definitions ────────────────────────────────────────────────────

const CLINIC_TOOLS_ALL = [
      { href: '/inquiries', icon: Inbox, label: 'Enquiries' },
  { href: '/staff', icon: UserCog, label: 'Staff Module' },
  { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
  { href: '/clinic-schedule', icon: CalendarDays, label: 'Clinic Schedule' },
  { href: '/scheduling-dashboard', icon: Activity, label: 'Clinic Utilization' },
  { href: '/customer-survey', icon: ClipboardCheck, label: 'Customer Survey' },
  { href: '/registration-forms', icon: FileText, label: 'Registration Forms' },
  { href: '/decking', icon: Layers, label: 'Decking Module' },
  { href: '/loa-submissions', icon: FileCheck, label: 'LOA Submission' },
  { href: '/patient-relationship', icon: HeartHandshake, label: 'Patient Relationship' },
  { href: '/peer-eval', icon: UsersRound, label: 'Peer Evaluation' },
  { href: '/partner-institutions', icon: Building2, label: 'Partner Institutions' },
]

// Marketing Admin: no Clinic Schedule, no Decking, no Patient Relationship
const CLINIC_TOOLS_NO_SCHEDULE = [
  { href: '/staff', icon: UserCog, label: 'Staff Module' },
  { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
  { href: '/customer-survey', icon: ClipboardCheck, label: 'Customer Survey' },
  { href: '/registration-forms', icon: FileText, label: 'Registration Forms' },
  { href: '/peer-eval', icon: UsersRound, label: 'Peer Evaluation' },
  { href: '/partner-institutions', icon: Building2, label: 'Partner Institutions' },
]

// Full access nav — built dynamically per role
function getFullNav(isAdmin: boolean, isMarketingAdmin: boolean) {
  return [
    {
      label: 'Overview',
      items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
    },
    {
      label: 'Patients & Email',
      items: [
        { href: '/patients', icon: Users, label: 'Patient CRM' },
        { href: '/patients/profile', icon: Users, label: 'Patient Profile' },
        { href: '/patients/dashboard', icon: BarChart2, label: 'Patient Dashboard' },
        { href: '/email', icon: Mail, label: 'Email Campaigns' },
        { href: '/sms', icon: MessageSquare, label: 'SMS Campaigns' },
      ],
    },
    {
      label: 'Clinic Tools',
      // Marketing Admin cannot access Clinic Schedule
      items: isMarketingAdmin ? CLINIC_TOOLS_NO_SCHEDULE : CLINIC_TOOLS_ALL,
    },
    {
      label: 'Settings',
      items: [
        { href: '/settings/accounts', icon: Link2, label: 'Connected Accounts' },
        // Team management, handbook and the awards are ADMIN only.
        //
        // The awards page ranks named colleagues and lists everyone who did
        // not qualify — a management view, and one that reads very differently
        // to the person ranked eleventh. Hiding the link is only the cosmetic
        // half: the route gate in (dashboard)/layout.tsx and the 403 on
        // /api/awards are what actually hold it shut.
        ...(isAdmin ? [
          { href: '/settings/users', icon: Users, label: 'Team' },
          { href: '/awards', icon: Trophy, label: 'Annual Awards' },
          { href: '/handbook', icon: BookOpen, label: 'User Handbook' },
        ] : []),
      ],
    },
  ]
}

// Front desk nav — home + 5 clinic modules
const FRONT_DESK_NAV = [
  {
    label: 'Home',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    ],
  },
  {
    label: 'Clinic Tools',
    items: [
      { href: '/patients', icon: Users, label: 'Patient CRM' },
      { href: '/patients/profile', icon: Users, label: 'Patient Profile' },
      { href: '/inquiries', icon: Inbox, label: 'Enquiries' },
      { href: '/staff', icon: UserCog, label: 'Staff Module' },
      { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
      { href: '/clinic-schedule', icon: CalendarDays, label: 'Clinic Schedule' },
      { href: '/customer-survey', icon: ClipboardCheck, label: 'Customer Survey' },
      { href: '/registration-forms', icon: FileText, label: 'Registration Forms' },
      { href: '/decking', icon: Layers, label: 'Decking Module' },
      { href: '/loa-submissions', icon: FileCheck, label: 'LOA Submission' },
      { href: '/patient-relationship', icon: HeartHandshake, label: 'Patient Relationship' },
      { href: '/peer-eval', icon: UsersRound, label: 'Peer Evaluation' },
      { href: '/partner-institutions', icon: Building2, label: 'Partner Institutions' },
    ],
  },
]

// Scoped-role navs — exactly the pages each account is gated to.
// These lists are COSMETIC: adding an entry here does not grant access, the
// prefixes in lib/scoped-roles do. They are kept beside each other so the two
// are obviously meant to agree.
const INVESTOR_NAV = [
  {
    label: 'Investor View',
    items: [
      { href: '/patients/dashboard', icon: BarChart2, label: 'Patient Dashboard' },
      { href: '/customer-satisfaction', icon: ClipboardCheck, label: 'Customer Satisfaction Survey' },
    ],
  },
]

const MEDREP_NAV = [
  {
    label: 'Medical Representative',
    items: [
      { href: '/registration-forms', icon: FileText, label: 'Registration Forms' },
      { href: '/patient-relationship', icon: HeartHandshake, label: 'Patient Relationship' },
      { href: '/partner-institutions', icon: Building2, label: 'Partner Institutions' },
      { href: '/handbook', icon: BookOpen, label: 'User Handbook' },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function Sidebar({ onClose, role = 'MARKETING_ADMIN' }: { onClose?: () => void; role?: string }) {
  const pathname = usePathname()

  const isInvestor = role === 'INVESTOR'
  const isMedRep   = role === 'MEDREP'
  const isFrontDesk = FRONT_DESK_ROLES.includes(role)
  const isAdmin = role === 'ADMIN'
  const isMarketingAdmin = role === 'MARKETING_ADMIN'
  const nav = isInvestor ? INVESTOR_NAV
            : isMedRep ? MEDREP_NAV
            : isFrontDesk ? FRONT_DESK_NAV
            : getFullNav(isAdmin, isMarketingAdmin)

  // Pick the longest nav href that prefixes the current pathname (with a /
  // boundary). Prevents /patients/profile from also lighting up /patients.
  const activeHref = (() => {
    const all: string[] = []
    for (const g of nav) for (const it of g.items) all.push(it.href)
    let best = ''
    for (const h of all) {
      if (pathname === h || pathname.startsWith(h + '/')) {
        if (h.length > best.length) best = h
      }
    }
    return best
  })()

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-full"
      // Shared SCEI sidebar: the Class Portal's dark teal (#17323A) with mint
      // accents — identical on Ops, Accounting, HR, Staff and Class.
      style={{ background: '#17323A', borderRight: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/scei-mark.png" alt="SCEI" className="w-7 h-7 object-contain" />
        </span>
        <div className="flex-1">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', color: '#fff', letterSpacing: '0.05em' }}>
            SCEI
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem', color: '#CBDAB5', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Operations Portal
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 rounded-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = href === activeHref
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors', active ? 'text-white' : 'text-white/75 hover:text-white hover:bg-white/[0.06]')}
                      style={active ? { background: 'rgba(125,162,146,0.22)' } : undefined}
                    >
                      <Icon size={16} className="flex-shrink-0" style={active ? { color: '#CBDAB5' } : undefined} />
                      <span style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
                      {active && <ChevronRight size={12} className="ml-auto" style={{ color: '#CBDAB5' }} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-3 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}>
        <span style={{ color: '#CBDAB5', fontWeight: 600 }}>SCEI</span>
        {' · '}Operations Portal
        <br />
        Internal Use Only
      </div>
    </aside>
  )
}
