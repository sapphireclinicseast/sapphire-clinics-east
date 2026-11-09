'use client'

import { useEffect, useMemo, useState } from 'react'
import { Heart, Quote } from 'lucide-react'
import BranchSwitcher, { useBranchSwitcher } from '@/components/BranchSwitcher'
import {
  CARD_STYLE, EmptyState, ErrorCard, PAGE, PageHeader, PillTabs, Skeleton, Tag,
} from '@/components/hub/ui'

interface StrengthItem {
  id: string
  text: string
  surveyType: string
  branch: string
  submittedAt: string
  respondent: string | null
}

// Warm accent for this page (the blush the old hero used), so the
// recognition pages still feel a little different from the admin ones.
const BLUSH = '#C68077'
const BLUSH_BG = '#F8ECE9'

// Survey type → friendly label
const TYPE_LABEL: Record<string, string> = {
  HR10: 'Pedia Patient',
  HR11: 'Adult Patient',
  HR12: 'Front Desk',
  HR16: 'Group Therapy',
}
const labelFor = (t: string) => TYPE_LABEL[t] ?? t

// Survey responses round-tripped through JSON.stringify can carry literal
// backslash-n / backslash-r sequences (and stray control whitespace) at
// display time. Strip them so the card renders clean prose.
function cleanComment(s: string): string {
  return s
    .replace(/\\r\\n|\\n|\\r/g, ' ') // literal "\n" / "\r\n" pairs → space
    .replace(/[\r\n]+/g, ' ')        // real newlines collapse to space
    .replace(/\s{2,}/g, ' ')         // multiple spaces → one
    .trim()
}

function QuoteCard({ text, surveyType, index }: { text: string; surveyType: string; index: number }) {
  return (
    <figure
      className="break-inside-avoid mb-4 rounded-xl p-4 sm:p-5 animate-fade-up transition-shadow hover:shadow-[0_4px_14px_rgba(26,26,26,0.06)]"
      style={{ ...CARD_STYLE, animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <Quote size={18} aria-hidden style={{ color: BLUSH }} fill="currentColor" className="opacity-70" />
      <blockquote className="mt-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}>
        {cleanComment(text)}
      </blockquote>
      <figcaption className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Heart size={12} aria-hidden fill="currentColor" style={{ color: BLUSH }} />
          Anonymous patient
        </span>
        <Tag>{labelFor(surveyType)}</Tag>
      </figcaption>
    </figure>
  )
}

function WallSkeleton() {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4" aria-busy="true" aria-label="Gathering kind words">
      {[96, 140, 112, 128, 92, 150].map((h, i) => (
        <div key={i} className="break-inside-avoid mb-4 rounded-xl p-5 space-y-2.5" style={CARD_STYLE}>
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3" style={{ width: `${40 + (h % 50)}%` }} />
          <div className="pt-2"><Skeleton className="h-3 w-1/3" /></div>
        </div>
      ))}
    </div>
  )
}

export default function PatientsLovePage() {
  const [strengths, setStrengths] = useState<StrengthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const { isMultiBranch, activeStaffId } = useBranchSwitcher()

  useEffect(() => {
    if (activeStaffId || !isMultiBranch) fetchStrengths()
  }, [activeStaffId, isMultiBranch])

  async function fetchStrengths() {
    setLoading(true)
    setFailed(false)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `?staffId=${activeStaffId}` : ''
      const res = await fetch(`/api/patient-love${staffParam}`)
      if (res.ok) {
        const data = await res.json()
        setStrengths(data.strengths ?? [])
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    }
    setLoading(false)
  }

  // Count per survey type, in a stable order (known types first).
  const byType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of strengths) counts.set(s.surveyType, (counts.get(s.surveyType) ?? 0) + 1)
    const order = Object.keys(TYPE_LABEL)
    return [...counts.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [strengths])

  // Fall back to "All" when switching branch leaves the chosen type empty.
  const activeFilter = filter !== 'ALL' && byType.some(([t]) => t === filter) ? filter : 'ALL'
  const shown = activeFilter === 'ALL' ? strengths : strengths.filter(s => s.surveyType === activeFilter)
  const total = strengths.length

  return (
    <div className={PAGE}>
      {isMultiBranch && <BranchSwitcher />}

      <PageHeader
        eyebrow="Recognition"
        title="What Patients Love About You"
        description="Kind words from the patients you've helped, taken from our customer survey."
      />

      {loading ? (
        <WallSkeleton />
      ) : failed ? (
        <ErrorCard title="Couldn't load your patients' comments" hint="Check your connection and try again." onRetry={fetchStrengths} />
      ) : total === 0 ? (
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Codepaca.svg" alt="" aria-hidden width={120} height={120} className="block mx-auto mt-8 w-[110px] h-[110px]" />
          <EmptyState
            title="No feedback yet, but great things are coming"
            hint="Your patients may not have been chosen for the customer survey yet. Once they respond, their kind words will appear here."
          />
        </section>
      ) : (
        <>
          {/* Summary: total and the mascot (per-survey counts live on the filter tabs) */}
          <section className="rounded-xl px-4 sm:px-5 py-4 flex items-center gap-4 sm:gap-5 overflow-hidden" style={CARD_STYLE}>
            <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: BLUSH_BG, color: BLUSH }}>
              <Heart size={22} fill="currentColor" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                {total} kind {total === 1 ? 'word' : 'words'}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                from your patients{byType.length === 1 ? ` · ${labelFor(byType[0][0])} survey` : ''}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Codepaca.svg" alt="Aura alpaca mascot" width={120} height={120} className="hidden sm:block shrink-0 w-[96px] h-[96px] lg:w-[120px] lg:h-[120px] -my-2" />
          </section>

          {byType.length > 1 && (
            <PillTabs
              label="Filter by survey"
              value={activeFilter}
              onChange={setFilter}
              tabs={[
                { id: 'ALL', label: 'All', count: total },
                ...byType.map(([t, n]) => ({ id: t, label: labelFor(t), count: n })),
              ]}
            />
          )}

          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
            {shown.map((s, i) => (
              <QuoteCard key={s.id} text={s.text} surveyType={s.surveyType} index={i} />
            ))}
          </div>
        </>
      )}

      <p className="text-[12px] leading-relaxed px-0.5" style={{ color: 'var(--mid-gray)' }}>
        <strong style={{ color: 'var(--deep-teal)' }}>About these comments:</strong> they come from patients randomly chosen for our customer survey, and every response is anonymous. If nothing appears yet, your patients may not have been chosen, or they did not leave a written comment.
      </p>
    </div>
  )
}
