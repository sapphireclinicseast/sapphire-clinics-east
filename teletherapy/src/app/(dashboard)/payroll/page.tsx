'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet, FileText, Download, Eye, Receipt, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BTN_SM, CARD_STYLE, EmptyState, ErrorCard, KpiCard, KpiSkeleton, PAGE, PageHeader, PRIMARY_STYLE, RowsSkeleton,
  SECONDARY_STYLE, Tag,
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

/* A payslip's period as a short title + its date range.
   Regular cutoffs: "2026-04-1" → "April 2026 · 1st cut-off", "Mar 26 – Apr 10, 2026".
   Special runs from the accounting hub carry a suffixed period:
   "2026-12-13TH", "2026-10-MAT-…", "2026-10-FINAL-…", "2026-05-GOVCON". */
function cutoffInfo(period: string): { title: string; range: string; year: number | null } {
  const short = (m: number) => MONTHS[m - 1].slice(0, 3)
  const reg = period.match(/^(\d{4})-(\d{2})-([12])$/)
  if (reg) {
    const year = Number(reg[1])
    const month = Number(reg[2])
    const half = Number(reg[3]) as 1 | 2
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
    const range = startMonth === month && startYear === year
      ? `${short(month)} ${startDay}–${endDay}, ${year}`
      : startYear === year
        ? `${short(startMonth)} ${startDay} – ${short(month)} ${endDay}, ${year}`
        : `${short(startMonth)} ${startDay}, ${startYear} – ${short(month)} ${endDay}, ${year}`
    return { title: `${MONTHS[month - 1]} ${year} · ${half === 1 ? '1st' : '2nd'} cut-off`, range, year }
  }
  const sp = period.match(/^(\d{4})-(\d{2})-([A-Z0-9]+)/i)
  if (sp) {
    const year = Number(sp[1])
    const monthYear = `${MONTHS[Number(sp[2]) - 1] ?? ''} ${year}`.trim()
    const kind = sp[3].toUpperCase()
    const title = kind === '13TH' ? `13th month pay ${year}`
      : kind === 'MAT' ? `Maternity pay · ${monthYear}`
        : kind === 'FINAL' ? `Final pay · ${monthYear}`
          : kind === 'GOVCON' ? `Contributions adjustment · ${monthYear}`
            : `Special pay · ${monthYear}`
    return { title, range: 'Special payroll run', year }
  }
  return { title: period, range: '', year: null }
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

  // Newest first: by the period's month, then by issue date.
  const sorted = useMemo(
    () => [...visiblePayslips].sort((a, b) =>
      b.cutoffPeriod.slice(0, 7).localeCompare(a.cutoffPeriod.slice(0, 7)) ||
      String(b.issuedAt).localeCompare(String(a.issuedAt))),
    [visiblePayslips],
  )
  const latest = sorted[0]
  const latestYear = latest ? (cutoffInfo(latest.cutoffPeriod).year ?? new Date(latest.issuedAt).getFullYear()) : null
  const years = useMemo(() => {
    const map = new Map<string, Payslip[]>()
    sorted.forEach((p) => {
      const y = String(cutoffInfo(p.cutoffPeriod).year ?? 'Other')
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(p)
    })
    return [...map.entries()]
  }, [sorted])
  const yearRows = years.find(([y]) => y === String(latestYear))?.[1] ?? []
  const sum = (rows: Payslip[], k: 'netPay' | 'totalDeductions' | 'grossPay') => rows.reduce((t, p) => t + (Number(p[k]) || 0), 0)
  // Only label Employee / Consultant when this person has both kinds.
  const mixedKinds = new Set(visiblePayslips.map((p) => p.kind)).size > 1

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
      {data && latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard label="Latest net pay" value={PHP.format(latest.netPay)} sub={cutoffInfo(latest.cutoffPeriod).title} icon={<Wallet size={16} />} />
          <KpiCard label={`Net pay ${latestYear ?? ''}`.trim()} value={PHP.format(sum(yearRows, 'netPay'))} sub={`${yearRows.length} payslip${yearRows.length === 1 ? '' : 's'}`} icon={<Receipt size={16} />} />
          <KpiCard label={`Deductions ${latestYear ?? ''}`.trim()} value={PHP.format(sum(yearRows, 'totalDeductions'))} sub={`From ${PHP.format(sum(yearRows, 'grossPay'))} gross`} icon={<MinusCircle size={16} />} />
        </div>
      )}

      {/* Body */}
      {loading ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><KpiSkeleton count={3} /></div>
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
        years.map(([year, rows]) => (
          <section key={year} className="rounded-xl overflow-hidden" style={CARD_STYLE} aria-label={`Payslips ${year}`}>
            <header className="px-4 py-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5" style={{ background: 'var(--off-white, #F8FAF2)', borderBottom: '1px solid var(--light-gray)' }}>
              <h2 className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{year}</h2>
              <p className="text-xs" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                {rows.length} payslip{rows.length === 1 ? '' : 's'} · <strong style={{ color: 'var(--charcoal)' }}>{PHP.format(sum(rows, 'netPay'))}</strong> net
              </p>
            </header>
            <ul>
              {rows.map((p, i) => (
                <PayslipRow key={`${p.kind}-${p.id}`} payslip={p} index={i} showKind={mixedKinds} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function Amount({ label, value, strong, minus }: { label: string; value: number; strong?: boolean; minus?: boolean }) {
  return (
    <div className="text-right min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>{label}</p>
      <p
        className={cn('leading-tight whitespace-nowrap', strong ? 'text-[15px] font-bold' : 'text-[13px]')}
        style={{ fontFamily: strong ? 'var(--font-display)' : undefined, color: strong ? 'var(--charcoal)' : 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}
      >
        {minus && value ? '−' : ''}{PHP.format(value)}
      </p>
    </div>
  )
}

function PayslipRow({ payslip, index, showKind }: {
  payslip: Payslip; index: number; showKind: boolean
}) {
  const pdfHref = `/api/payroll/pdf?kind=${payslip.kind}&id=${encodeURIComponent(payslip.id)}`
  const info = cutoffInfo(payslip.cutoffPeriod)
  const meta = [info.range, branchLabel(payslip.branch), `Issued ${fmtIssued(payslip.issuedAt)}`].filter(Boolean).join(' · ')
  return (
    <li
      className="px-4 py-3 grid gap-x-5 gap-y-2.5 items-center grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] transition-colors hover:bg-[#F8FAF2]"
      style={index ? { borderTop: '1px solid var(--light-gray)' } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
          <FileText size={17} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[14px] flex items-center gap-2 flex-wrap" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {info.title}
            {showKind && <Tag>{payslip.kind === 'employee' ? 'Employee' : 'Consultant'}</Tag>}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--mid-gray)' }} title={meta}>{meta}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pl-12 md:pl-0">
        <Amount label="Gross" value={payslip.grossPay} />
        <Amount label="Deductions" value={payslip.totalDeductions} minus />
        <Amount label="Net pay" value={payslip.netPay} strong />
      </div>

      <div className="flex items-center gap-1.5 pl-12 md:pl-0">
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(BTN_SM, !payslip.hasPdf && 'opacity-40 pointer-events-none')}
          style={SECONDARY_STYLE}
          title={payslip.hasPdf ? 'Open PDF in new tab' : 'No PDF on file'}
          aria-disabled={!payslip.hasPdf}
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
          aria-disabled={!payslip.hasPdf}
        >
          <Download size={14} aria-hidden />
          PDF
        </a>
      </div>
    </li>
  )
}

// PdfPreviewModal removed: nginx adds X-Frame-Options: DENY +
// frame-ancestors 'none' to all responses for security, which blocks
// embedding our own PDFs in an <iframe> ("refused to connect"). The
// View button now opens the PDF in a new browser tab instead — same
// UX without fighting the security policy.
