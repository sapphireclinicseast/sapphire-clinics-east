'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  FileText,
  Loader2,
  Download,
  Eye,
  Lock,
  Building2,
  Calendar as CalendarIcon,
  X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'East Branch',
  SBGH: 'Greenhills Branch',
  SANDBOX_EAST: 'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE: 'Verdana Store',
}

// Normalize branch codes between accounting (SBEA/SBGH) and the Patient
// enum (SANDBOX_EAST/SANDBOX_GREENHILLS) so the BranchSwitcher can match.
function canonicalBranch(b: string): string {
  const m: Record<string, string> = {
    SBEA: 'SANDBOX_EAST',
    SBGH: 'SANDBOX_GREENHILLS',
  }
  return m[b] ?? b
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
  // — normalize both sides via canonicalBranch().
  const visiblePayslips = useMemo(() => {
    if (!data) return []
    if (!isMultiBranch || !activeBranch) return data.payslips
    const wanted = canonicalBranch(activeBranch.branch)
    return data.payslips.filter((p) => canonicalBranch(p.branch) === wanted)
  }, [data, isMultiBranch, activeBranch])

  const total = useMemo(
    () => visiblePayslips.reduce((sum, p) => sum + p.netPay, 0),
    [visiblePayslips],
  )

  return (
    <div className="max-w-5xl mx-auto">
      {/* Branch switcher for interbranch clinicians */}
      {isMultiBranch && (
        <div className="mb-4 animate-fade-up">
          <BranchSwitcher />
        </div>
      )}

      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Payroll
              </h1>
              <p className="text-white/70 text-sm mt-1">
                Locked payslips from the accounting hub. Drafts and unfinalized
                cutoffs aren&rsquo;t shown here.
              </p>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Codepaca.svg" alt="Aura alpaca mascot" width={200} height={200} style={{ display: 'block', flexShrink: 0 }} />
        </div>
      </div>

      {/* Summary card */}
      {data && visiblePayslips.length > 0 && (
        <div className="card-static !p-4 mb-6 animate-fade-up stagger-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--sage-tint)] text-[var(--moss)] flex items-center justify-center">
              <Lock size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">Locked Payslips</p>
              <p className="text-[20px] font-bold text-[var(--narra)] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {visiblePayslips.length}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)] text-right">Lifetime Net Pay</p>
            <p className="text-[20px] font-bold text-[var(--narra)] leading-tight text-right" style={{ fontFamily: 'var(--font-display)' }}>
              {PHP.format(total)}
            </p>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-[var(--moss)] animate-spin" />
          <p className="text-sm text-[var(--mid-gray)]">Loading payslips...</p>
        </div>
      ) : error ? (
        <div className="card-static text-center py-12 animate-fade-up">
          <p className="text-[13px] text-[var(--clay)] font-semibold">{error}</p>
          <button
            onClick={fetchPayslips}
            className="mt-3 text-[12px] font-semibold text-[var(--moss)] hover:underline"
          >
            Try again
          </button>
        </div>
      ) : !data || visiblePayslips.length === 0 ? (
        <div className="card-static text-center py-14 animate-fade-up">
          <div className="w-14 h-14 rounded-2xl bg-[var(--paper-2)] flex items-center justify-center mx-auto mb-3">
            <Lock size={22} className="text-[var(--mid-gray)]" />
          </div>
          <p className="text-[13px] text-[var(--narra)] font-semibold mb-1">No locked payslips yet.</p>
          <p className="text-[12px] text-[var(--mid-gray)] max-w-sm mx-auto">
            Payslips appear here once accounting locks them in. Cutoffs still in
            <span className="font-semibold"> Draft</span> or
            <span className="font-semibold"> Final</span> review remain hidden.
          </p>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-up">
          {visiblePayslips.map((p, i) => (
            <PayslipRow key={`${p.kind}-${p.id}`} payslip={p} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function PayslipRow({ payslip, index }: {
  payslip: Payslip; index: number
}) {
  const branchLabel = BRANCH_LABEL[payslip.branch] ?? payslip.branch
  const pdfHref = `/api/payroll/pdf?kind=${payslip.kind}&id=${encodeURIComponent(payslip.id)}`
  return (
    <div
      className={cn(
        'card-static !p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-up',
        `stagger-${Math.min(index + 1, 10)}`
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-[var(--sage-tint)] text-[var(--moss)] flex items-center justify-center shrink-0">
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-bold text-[14px] text-[var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>
              {fmtCutoff(payslip.cutoffPeriod)}
            </p>
            <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--sage)] text-white">
              <Lock size={9} className="inline -mt-0.5 mr-0.5" />
              Locked
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--paper-2)] text-[var(--mid-gray)] border border-[var(--paper-3)]">
              {payslip.kind === 'employee' ? 'Employee' : 'Consultant'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--mid-gray)] flex-wrap">
            <span className="flex items-center gap-1"><Building2 size={11} /> {branchLabel}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><CalendarIcon size={11} /> Issued {fmtIssued(payslip.issuedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 sm:shrink-0">
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">Net Pay</p>
          <p className="text-[15px] font-bold text-[var(--narra)] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {PHP.format(payslip.netPay)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--paper-3)] text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors',
              !payslip.hasPdf && 'opacity-40 pointer-events-none'
            )}
            title={payslip.hasPdf ? 'Open PDF in new tab' : 'No PDF on file'}
          >
            <Eye size={14} />
            View
          </a>
          <a
            href={pdfHref}
            download={`payslip-${payslip.cutoffPeriod}.pdf`}
            className={cn(
              'inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--moss)] text-white hover:bg-[var(--narra)] transition-colors',
              !payslip.hasPdf && 'opacity-40 pointer-events-none'
            )}
            title={payslip.hasPdf ? 'Download PDF' : 'No PDF on file'}
          >
            <Download size={14} />
            PDF
          </a>
        </div>
      </div>
    </div>
  )
}

// PdfPreviewModal removed: nginx adds X-Frame-Options: DENY +
// frame-ancestors 'none' to all responses for security, which blocks
// embedding our own PDFs in an <iframe> ("refused to connect"). The
// View button now opens the PDF in a new browser tab instead — same
// UX without fighting the security policy.
