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

function fmtCutoff(s: string): string {
  // "2026-03-1" => "Mar 1–15, 2026", "2026-03-2" => "Mar 16–end, 2026"
  const m = s.match(/^(\d{4})-(\d{2})-([12])$/)
  if (!m) return s
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const month = months[Number(m[2]) - 1]
  const half = m[3] === '1' ? '1\u201315' : '16\u2013end'
  return `${month} ${half}, ${m[1]}`
}

function fmtIssued(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const BRANCH_LABEL: Record<string, string> = {
  SBEA: 'Sandbox East',
  SBGH: 'Sandbox Greenhills',
  SANDBOX_EAST: 'Sandbox East',
  SANDBOX_GREENHILLS: 'Sandbox Greenhills',
  VERDANA_STORE: 'Verdana Store',
}

export default function PayrollPage() {
  const [data, setData] = useState<PayrollResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<Payslip | null>(null)

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

  const total = useMemo(() => {
    if (!data) return 0
    return data.payslips.reduce((sum, p) => sum + p.netPay, 0)
  }, [data])

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero */}
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-6 animate-fade-up">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Payroll
            </h1>
            <p className="text-white/70 text-sm mt-1">
              Locked payslips from the accounting hub. Drafts and unfinalized
              cutoffs aren&rsquo;t shown here.
            </p>
          </div>
        </div>
      </div>

      {/* Summary card */}
      {data && data.payslips.length > 0 && (
        <div className="card-static !p-4 mb-6 animate-fade-up stagger-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--sage-tint)] text-[var(--moss)] flex items-center justify-center">
              <Lock size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--mid-gray)]">Locked Payslips</p>
              <p className="text-[20px] font-bold text-[var(--narra)] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {data.payslips.length}
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
      ) : !data || data.payslips.length === 0 ? (
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
          {data.payslips.map((p, i) => (
            <PayslipRow key={`${p.kind}-${p.id}`} payslip={p} index={i} onPreview={() => setPreviewing(p)} />
          ))}
        </div>
      )}

      {previewing && (
        <PdfPreviewModal
          payslip={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  )
}

function PayslipRow({ payslip, index, onPreview }: {
  payslip: Payslip; index: number; onPreview: () => void
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
          <button
            onClick={onPreview}
            disabled={!payslip.hasPdf}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--paper-3)] text-[var(--narra)] hover:bg-[var(--paper-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={payslip.hasPdf ? 'View PDF' : 'No PDF on file'}
          >
            <Eye size={14} />
            View
          </button>
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

function PdfPreviewModal({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  const pdfHref = `/api/payroll/pdf?kind=${payslip.kind}&id=${encodeURIComponent(payslip.id)}`
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] overflow-hidden flex flex-col animate-gate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hero-gradient px-5 py-3.5 flex items-center gap-3 shrink-0">
          <FileText size={18} className="text-white shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-white tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>
              Payslip — {fmtCutoff(payslip.cutoffPeriod)}
            </h2>
            <p className="text-white/70 text-[11px] truncate">
              Net pay {PHP.format(payslip.netPay)} · {BRANCH_LABEL[payslip.branch] ?? payslip.branch}
            </p>
          </div>
          <a
            href={pdfHref}
            download={`payslip-${payslip.cutoffPeriod}.pdf`}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 transition-colors backdrop-blur-sm border border-white/20"
            title="Download"
          >
            <Download size={13} /> Download
          </a>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
            title="Close"
          >
            <XIcon size={18} />
          </button>
        </div>
        <div className="flex-1 bg-[var(--paper-2)] overflow-hidden">
          <iframe
            src={pdfHref}
            title="Payslip PDF"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  )
}
