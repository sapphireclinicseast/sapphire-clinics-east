'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  FileText,
  Download,
  Eye,
  Lock,
  Building2,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BTN_SM, CARD_STYLE, EmptyState, ErrorCard, KpiCard, KpiSkeleton, PAGE, PageHeader, PRIMARY_STYLE, RowsSkeleton,
  SECONDARY_STYLE, StatusPill, Tag,
} from '@/components/hub/ui'
import { branchLabel, toPatientBranchCode } from '@/lib/branch-label'
import BranchSwitcher, { useBranchSwitcher } from '@/components/BranchSwitcher'

interface Payslip {
  kind: 'employee' | 'consultant'
  id: string
  cutoffPeriod: string // e.g. "2026-03-1"
  branch: string
  grossPay: number
  totalDeductions: number
  netPay: number
  hasPdf: boolean
  issuedAt: string
}

interface PayrollResponse {
  email: string
  matchedAs: { asEmployee: boolean; asConsultant: boolean }
  payslips: Payslip[]
}

const PHP = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Sandbox Clinic payroll defaults (from accounting hub's PayrollSettings):
//   1st cut-off: day 26 of PREVIOUS month → day 10 of current month
//   2nd cut-off: day 11 → day 25 of current month
// (Custom settings live in the accountant's browser localStorage and
// aren't queryable from teletherapy; if the accountant ever overrides
// these, mirror the change here.)
const CUTOFF = {
  c1StartDay: 26, c1StartPrevMonth: true, c1EndDay: 10,
  c2StartDay: 11, c2EndLastDay: false, c2EndDay: 25,
}

function fmtCutoff(period: string): string {
  // "2026-04-2" → "April 2026 (Second Cut-off): April 11-25, 2026"
  // "2026-04-1" → "April 2026 (First Cut-off): March 26-April 10, 2026"
  const m = period.match(/^(\d{4})-(\d{2})-([12])$/)
  if (!m) return period
  const year = Number(m[1])
  const month = Number(m[2])
  const half = Number(m[3]) as 1 | 2
  const monthLabel = MONTHS[month - 1]
  const halfLabel = half === 1 ? 'First Cut-off' : 'Second Cut-off'

  let startMonth: number, startYear: number, startDay: number, endDay: number
  if (half === 1) {
    startDay = CUTOFF.c1StartDay
    startMonth = CUTOFF.c1StartPrevMonth ? (month === 1 ? 12 : month - 1) : month
    startYear = CUTOFF.c1StartPrevMonth && month === 1 ? year - 1 : year
    endDay = CUTOFF.c1EndDay
  } else {
    startDay = CUTOFF.c2StartDay
    startMonth = month
    startYear = year
    endDay = CUTOFF.c2EndLastDay ? new Date(year, month, 0).getDate() : CUTOFF.c2EndDay
  }
  const startMonthLabel = MONTHS[startMonth - 1]

  const range = startMonth === month && startYear === year
    ? `${startMonthLabel} ${startDay}-${endDay}, ${year}`
    : startYear === year
      ? `${startMonthLabel} ${startDay}-${monthLabel} ${endDay}, ${year}`
      : `${startMonthLabel} ${startDay}, ${startYear}-${monthLabel} ${endDay}, ${year}`

  return `${monthLabel} ${year} (${halfLabel}): ${range}`
}

function fmtIssued(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PayrollPage() {
  const [data, setData] = useState<PayrollResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isMultiBranch, activeStaffId, activeBranch } = useBranchSwitcher()

  useEffect(() => { fetchPayslips() }, [])

  async function fetchPayslips() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/payroll', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Could not load payroll (${res.status})`)
      }
    } catch (err) {
      setError((err as Error).message || 'Could not load payroll')
    }
    setLoading(false)
  }

  // For interbranch clinicians, scope the visible payslips to the
  // currently selected branch. Accounting stores branch as 'SBEA'/'SBGH'
  // while session.user.branches uses the Patient enum 'SANDBOX_EAST' etc.
  // — normalize both sides via toPatientBranchCode().
  const visiblePayslips = useMemo(() => {
    if (!data) return []
    if (!isMultiBranch || !activeBranch) return data.payslips
    const wanted = toPatientBranchCode(activeBranch.branch)
    return data.payslips.filter((p) => toPatientBranchCode(p.branch) === wanted)
  }, [data, isMultiBranch, activeBranch])

  const total = useMemo(
    () => visiblePayslips.reduce((sum, p) => sum + p.netPay, 0),
    [visiblePayslips],
  )

  return (
    <div className={PAGE}>
      {/* Branch switcher for interbranch clinicians */}
      {isMultiBranch && <BranchSwitcher />}

      <PageHeader
        eyebrow="My account"
        title="Payroll"
        description="Locked payslips from the accounting hub. Drafts and unfinalized cutoffs aren’t shown here."
      />

      {/* Summary */}
      {data && visiblePayslips.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Payslips" value={visiblePayslips.length} sub="Locked by accounting" icon={<Lock size={16} />} />
          <KpiCard label="Total net pay" value={PHP.format(total)} sub="All payslips shown" icon={<Wallet size={16} />} />
        </div>
      )}

      {/* Body */}
      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3"><KpiSkeleton count={2} /></div>
          <div className="rounded-xl" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading payslips" /></div>
        </>
      ) : error ? (
        <ErrorCard title="Couldn't load your payslips" hint={error} onRetry={fetchPayslips} />
      ) : !data || visiblePayslips.length === 0 ? (
        <section className="rounded-xl" style={CARD_STYLE}>
          <EmptyState
            icon="file"
            title="No locked payslips yet"
            hint={<>Payslips appear here once accounting locks them in. Cutoffs still in <strong>Draft</strong> or <strong>Final</strong> review remain hidden.</>}
          />
        </section>
      ) : (
        <ul className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-label="Payslips">
          {visiblePayslips.map((p, i) => (
            <PayslipRow key={`${p.kind}-${p.id}`} payslip={p} index={i} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PayslipRow({ payslip, index }: {
  payslip: Payslip; index: number
}) {
  const pdfHref = `/api/payroll/pdf?kind=${payslip.kind}&id=${encodeURIComponent(payslip.id)}`
  return (
    <li
      className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors hover:bg-[#F8FAF2]"
      style={index ? { borderTop: '1px solid var(--light-gray)' } : undefined}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          <FileText size={18} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-[14px]" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              {fmtCutoff(payslip.cutoffPeriod)}
            </p>
            <StatusPill tone="success">Locked</StatusPill>
            <Tag>{payslip.kind === 'employee' ? 'Employee' : 'Consultant'}</Tag>
          </div>
          <div className="flex items-center gap-x-3 gap-y-0.5 text-xs flex-wrap" style={{ color: 'var(--mid-gray)' }}>
            <span className="flex items-center gap-1"><Building2 size={12} aria-hidden /> {branchLabel(payslip.branch)}</span>
            <span className="flex items-center gap-1"><CalendarIcon size={12} aria-hidden /> Issued {fmtIssued(payslip.issuedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 sm:shrink-0 pl-[52px] sm:pl-0">
        <div className="sm:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>Net pay</p>
          <p className="text-[15px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
            {PHP.format(payslip.netPay)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(BTN_SM, !payslip.hasPdf && 'opacity-40 pointer-events-none')}
            style={SECONDARY_STYLE}
            title={payslip.hasPdf ? 'Open PDF in new tab' : 'No PDF on file'}
          >
            <Eye size={14} aria-hidden />
            View
          </a>
          <a
            href={pdfHref}
            download={`payslip-${payslip.cutoffPeriod}.pdf`}
            className={cn(BTN_SM, 'text-white hover:!bg-[var(--deep-teal)] hover:opacity-90', !payslip.hasPdf && 'opacity-40 pointer-events-none')}
            style={PRIMARY_STYLE}
            title={payslip.hasPdf ? 'Download PDF' : 'No PDF on file'}
          >
            <Download size={14} aria-hidden />
            PDF
          </a>
        </div>
      </div>
    </li>
  )
}

// PdfPreviewModal removed: nginx adds X-Frame-Options: DENY +
// frame-ancestors 'none' to all responses for security, which blocks
// embedding our own PDFs in an <iframe> ("refused to connect"). The
// View button now opens the PDF in a new browser tab instead — same
// UX without fighting the security policy.
