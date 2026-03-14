'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Send, Calendar, Cake, Sparkles,
  Users, Mail, BookOpen, Clock, ChevronRight, Link2, ChevronDown, X, BarChart2,
  UserCog, ListOrdered, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBrand } from '@/contexts/BrandContext'

// ─── Role helpers ────────────────────────────────────────────────────────────
const FRONT_DESK_ROLES = ['SBEA_FRONT_DESK', 'SBGH_FRONT_DESK']

// ─── Nav item definitions ────────────────────────────────────────────────────

const CLINIC_TOOLS_ALL = [
  { href: '/staff', icon: UserCog, label: 'Staff Module' },
  { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
  { href: '/clinic-schedule', icon: CalendarDays, label: 'Clinic Schedule' },
]

const CLINIC_TOOLS_NO_SCHEDULE = [
  { href: '/staff', icon: UserCog, label: 'Staff Module' },
  { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
]

// Full access nav — built dynamically per role
function getFullNav(isAdmin: boolean, isMarketingAdmin: boolean) {
  return [
    {
      label: 'Overview',
      items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }],
    },
    {
      label: 'Social Media',
      items: [
        { href: '/social/compose', icon: Send, label: 'New Post' },
        { href: '/social/scheduled', icon: Clock, label: 'Scheduled' },
        { href: '/social/published', icon: Calendar, label: 'Published' },
      ],
    },
    {
      label: 'Templates',
      items: [
        { href: '/templates/birthday', icon: Cake, label: 'Birthday Posts' },
        { href: '/templates/holiday', icon: Sparkles, label: 'Holiday Posts' },
      ],
    },
    {
      label: 'Patients & Email',
      items: [
        { href: '/patients', icon: Users, label: 'Patient CRM' },
        { href: '/patients/dashboard', icon: BarChart2, label: 'Patient Dashboard' },
        { href: '/email', icon: Mail, label: 'Email Campaigns' },
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
        // Team management is ADMIN only
        ...(isAdmin ? [{ href: '/settings/users', icon: Users, label: 'Team' }] : []),
        { href: '/brand', icon: BookOpen, label: 'Brand Guide' },
      ],
    },
  ]
}

// Front desk nav — only the 4 clinic modules
const FRONT_DESK_NAV = [
  {
    label: 'Clinic Tools',
    items: [
      { href: '/patients', icon: Users, label: 'Patient CRM' },
      { href: '/staff', icon: UserCog, label: 'Staff Module' },
      { href: '/queueing', icon: ListOrdered, label: 'Queueing' },
      { href: '/clinic-schedule', icon: CalendarDays, label: 'Clinic Schedule' },
    ],
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function Sidebar({ onClose, role = 'MARKETING_ADMIN' }: { onClose?: () => void; role?: string }) {
  const pathname = usePathname()
  const { brand, setBrand, brands } = useBrand()
  const [brandOpen, setBrandOpen] = useState(false)

  const isFrontDesk = FRONT_DESK_ROLES.includes(role)
  const isAdmin = role === 'ADMIN'
  const isMarketingAdmin = role === 'MARKETING_ADMIN'
  const nav = isFrontDesk ? FRONT_DESK_NAV : getFullNav(isAdmin, isMarketingAdmin)

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-full"
      style={{ background: 'var(--near-black)', borderRight: '1px solid rgba(26,123,138,0.15)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(26,123,138,0.15)' }}>
        <Image src="/brand/mark-white-transparent.png" alt="SCEI" width={36} height={36} style={{ objectFit: 'contain' }} className="flex-shrink-0" />
        <div className="flex-1">
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.85rem', color: '#fff', letterSpacing: '0.05em' }}>
            SAPPHIRE
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.55rem', color: 'var(--teal)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Marketing Hub
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 rounded-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Brand Switcher — hidden for front desk */}
      {!isFrontDesk && (
        <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid rgba(26,123,138,0.1)' }}>
          <p className="px-2 mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Active Brand
          </p>
          <button
            onClick={() => setBrandOpen(!brandOpen)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: brand.color }} />
            <span className="flex-1 text-left truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
              {brand.name}
            </span>
            <ChevronDown size={12} className={cn('transition-transform flex-shrink-0', brandOpen && 'rotate-180')} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>

          {brandOpen && (
            <div className="mt-1 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {brands.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setBrand(b); setBrandOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all text-left"
                  style={{
                    background: b.id === brand.id ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                    color: b.id === brand.id ? '#fff' : 'rgba(255,255,255,0.55)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.id === brand.id && <ChevronRight size={11} style={{ color: b.color }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {nav.map((group) => (
          <div key={group.label}>
            <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all', active ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5')}
                      style={active ? { background: 'rgba(26,123,138,0.2)', color: 'var(--bright-teal)' } : undefined}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
                      {active && <ChevronRight size={12} className="ml-auto" style={{ color: 'var(--teal)' }} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-3 text-xs" style={{ borderTop: '1px solid rgba(26,123,138,0.15)', color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-body)' }}>
        <span style={{ color: brand.color, fontWeight: 600 }}>{brand.shortName}</span>
        {' · '}Marketing Hub
        <br />
        Internal Use Only
      </div>
    </aside>
  )
}
