import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { auth } from '@/lib/auth'
import PendingQueueWidget from '@/components/dashboard/PendingQueueWidget'
import { ReminderCard } from '@/components/dashboard/RecurringReminders'
import ModuleDirectory from '@/components/dashboard/ModuleDirectory'
import { HR_PAGE_CLASS, HR_PAGE_STYLE } from '@/components/ui/hr-tokens'

const FRONT_DESK_ROLES = ['AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', ACCOUNTANT: 'Accountant', BOOKKEEPER: 'Bookkeeper', VIEWER: 'Viewer',
  AHEA_ADMIN: 'East admin', AHGH_ADMIN: 'Greenhills admin', VERDANA_ADMIN: 'Verdana admin',
  AHEA_FRONTDESK: 'East front desk', AHGH_FRONTDESK: 'Greenhills front desk', PAYROLL_OFFICER: 'Payroll officer',
}
const BRANCH_LABELS: Record<string, string> = {
  ALL: 'All branches',
  SANDBOX_EAST: 'Aura East', SBEA: 'Aura East', AHEA: 'Aura East',
  SANDBOX_GREENHILLS: 'Aura Greenhills', SBGH: 'Aura Greenhills', AHGH: 'Aura Greenhills',
  VERDANA_STORE: 'Verdana', VERDANA: 'Verdana', AURA_INSTITUTE: 'Aura Health Institute', AHI: 'Aura Health Institute',
}

const chip = 'inline-flex items-center gap-1.5 max-w-[260px] px-2.5 py-[3px] rounded-full border bg-white text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis'

export default async function DashboardPage() {
  const session = await auth()
  const role = session?.user?.role || ''
  const isFrontDesk = FRONT_DESK_ROLES.includes(role)
  const isHmoOfficer = role === 'HMO_OFFICER'

  // HMO Officer has no use for the module grid — send them directly to AR
  if (isHmoOfficer) redirect('/accounts-receivable')
  // Med rep only has Reports — send them straight there
  if (role === 'MEDREP') redirect('/reports')
  if (role === 'INVESTOR') redirect('/reports')

  // Greeting and date in Manila time.
  const now = new Date()
  const today = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(now))
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = session?.user?.name?.split(' ')[0] || ''
  const branchCode = session?.user?.branch || ''
  const branchLabel = BRANCH_LABELS[branchCode] || 'Sapphire Clinics East, Inc.'
  const roleLabel = ROLE_LABELS[role]

  return (
    <div className={HR_PAGE_CLASS} style={HR_PAGE_STYLE}>
      {/* Welcome (HR Hub dashboard header) */}
      <section aria-label="Welcome" className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 rounded-xl border px-4 sm:px-5 py-4"
        style={{ background: 'linear-gradient(100deg, #EDF3D9 0%, #ffffff 58%)', borderColor: 'var(--light-gray)' }}>
        {/* Aura Health Rehab arch logomark */}
        <svg width="72" height="38" viewBox="0 0 220 116" role="img" aria-label="Aura Health Rehab" className="hidden sm:block flex-none">
          <path d="M10,110 A100,100 0 0 1 210,110 L188,110 A78,78 0 0 0 32,110 Z" fill="#296354" />
          <path d="M38,110 A72,72 0 0 1 182,110 L160,110 A50,50 0 0 0 60,110 Z" fill="#8EAF74" />
          <path d="M66,110 A44,44 0 0 1 154,110 L132,110 A22,22 0 0 0 88,110 Z" fill="#6E8E8E" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>
            <span>{today}</span>
            <span aria-hidden="true" className="w-[3px] h-[3px] rounded-full" style={{ background: 'var(--hr-faint)' }} />
            <span>{branchLabel}</span>
          </div>
          <h1 className="mt-0.5 mb-1 text-[19px] sm:text-[22px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-[13px]" style={{ color: 'var(--mid-gray)' }}>SAPPHIRE Accounting Hub · open a module below or from the sidebar.</p>
        </div>
        <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-1.5 w-full sm:w-auto">
          {roleLabel && <span className={chip} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>{roleLabel}</span>}
          <Link href="/handbook" className={`${chip} transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]`} style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <BookOpen size={12} /> Handbook
          </Link>
        </div>
      </section>

      {/* Recurring expense reminders — shown to admins/accountants per branch scope */}
      <ReminderCard />

      {/* Pending Queue Widget — shown to front desk users */}
      {isFrontDesk && <PendingQueueWidget branch={session?.user?.branch} />}

      <ModuleDirectory role={role} />
    </div>
  )
}
