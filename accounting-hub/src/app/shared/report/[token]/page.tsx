'use client'

/**
 * PUBLIC view-only page for a Reports → Share link (/shared/report/<token>).
 * No login: the token decides which statement (year, branches, columns) is
 * shown. Figures come live from the ledger engine through the link's own
 * endpoint, and amounts open their entries when the link allows it.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Eye, Loader2, Lock, MousePointerClick, ShieldCheck } from 'lucide-react'
import LedgerStatements from '@/app/(dashboard)/reports/LedgerStatements'
import { HR_VARS } from '@/components/ui/hr-tokens'
import { shareBranchLabel, shareViewLabel } from '@/lib/reports/share'

interface ShareMeta {
  tab: 'income-statement'
  year: number
  branch: string
  view: 'monthly' | 'quarterly' | 'annual'
  allowDrill: boolean
  hideNames: boolean
  expiresAt: string | null
  createdAt: string
}

const longDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<{ meta: ShareMeta | null; error: string | null }>({ meta: null, error: null })

  useEffect(() => {
    let live = true
    fetch(`/api/report-share/${encodeURIComponent(token)}?meta=1`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!live) return
        setState(r.ok ? { meta: j as ShareMeta, error: null } : { meta: null, error: j.error || 'This link could not be opened.' })
      })
      .catch(() => live && setState({ meta: null, error: 'This link could not be opened. Check your connection and try again.' }))
    return () => { live = false }
  }, [token])

  const { meta, error } = state
  const apiBase = `/api/report-share/${encodeURIComponent(token)}`

  return (
    <main style={{ ...HR_VARS, background: 'var(--off-white)', color: 'var(--charcoal)', minHeight: '100vh' }}>
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-4">
        {/* ── Brand + title ─────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scei-mark.png" alt="" width={38} height={38} className="flex-none" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[.5px]" style={{ color: 'var(--mid-gray)' }}>
                Sapphire Clinics East Incorporated
              </p>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Income Statement
              </h1>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold"
            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            <Eye size={14} /> View only
          </span>
        </header>

        {error && (
          <div className="rounded-lg border bg-white px-6 py-12 text-center" style={{ borderColor: 'var(--light-gray)' }}>
            <Lock size={26} className="mx-auto mb-3" style={{ color: 'var(--hr-faint)' }} />
            <p className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{error}</p>
            <p className="text-[13px] mt-1" style={{ color: 'var(--mid-gray)' }}>
              Ask the person who shared it with you for a new link.
            </p>
          </div>
        )}

        {!error && !meta && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin" size={22} style={{ color: 'var(--teal)' }} />
            <span className="ml-3 text-sm" style={{ color: 'var(--mid-gray)' }}>Opening the report…</span>
          </div>
        )}

        {meta && (<>
          {/* ── What this link shows ──────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            {[String(meta.year), shareViewLabel(meta.view), shareBranchLabel(meta.branch)].map(c => (
              <span key={c} className="inline-flex items-center h-7 px-3 rounded-full border bg-white font-semibold"
                style={{ borderColor: 'var(--light-gray)', fontFamily: 'var(--font-display)' }}>{c}</span>
            ))}
            <span className="ml-1" style={{ color: 'var(--mid-gray)' }}>
              Live from the books — figures update as entries are recorded.
              {meta.expiresAt ? ` This link works until ${longDate(meta.expiresAt)}.` : ''}
            </span>
          </div>

          {/* ── Statement ─────────────────────────────────────────── */}
          <div className="rounded-lg overflow-hidden bg-white" style={{ border: '1px solid var(--light-gray)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--light-gray)', background: '#fcfdfa', boxShadow: 'inset 4px 0 0 var(--teal)' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                Sapphire Clinics East Incorporated
              </p>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginTop: '2px' }}>Income Statement</p>
              <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '1px' }}>
                For the Year Ended December 31, {meta.year}{meta.branch !== 'ALL' ? ` · ${shareBranchLabel(meta.branch)}` : ''}
              </p>
            </div>
            <LedgerStatements
              year={meta.year} branch={meta.branch} tab="income-statement" view={meta.view}
              readOnly={!meta.allowDrill} apiBase={apiBase} shared
            />
            <div className="text-center py-3 px-4 text-xs" style={{ borderTop: '1px solid var(--hr-line)', color: 'var(--mid-gray)', background: '#fcfdfa' }}>
              Viewed {longDate(new Date())} &bull; Shared from the SCEI Accounting Hub
            </div>
          </div>

          {/* ── How to read it ────────────────────────────────────── */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]" style={{ color: 'var(--mid-gray)' }}>
            {meta.allowDrill && (
              <span className="inline-flex items-center gap-1.5">
                <MousePointerClick size={14} style={{ color: 'var(--teal)' }} />
                Click any amount to see the entries that make it up, and download them to Excel.
              </span>
            )}
            {meta.allowDrill && meta.hideNames && (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} style={{ color: 'var(--teal)' }} />
                Entry descriptions are withheld for privacy; each entry still shows its source, month and amount.
              </span>
            )}
          </div>
        </>)}
      </div>
    </main>
  )
}
