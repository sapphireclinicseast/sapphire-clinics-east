'use client'

import { useEffect, useState } from 'react'
import { HeartHandshake, Quote } from 'lucide-react'
import {
  CARD_STYLE, EmptyState, ErrorCard, PAGE, PageHeader, Skeleton, Tag,
} from '@/components/hub/ui'

interface StrengthItem {
  id: string
  text: string
  branch: string
  submittedAt: string
}

// Moss accent for the peer wall (the patient wall uses blush), so the two
// recognition pages are told apart at a glance.
const ACCENT = 'var(--teal)'
const ACCENT_BG = 'var(--pale-teal)'

function cleanComment(s: string): string {
  return s
    .replace(/\\r\\n|\\n|\\r/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function QuoteCard({ text, index }: { text: string; index: number }) {
  return (
    <figure
      className="break-inside-avoid mb-4 rounded-xl p-4 sm:p-5 animate-fade-up transition-shadow hover:shadow-[0_4px_14px_rgba(26,26,26,0.06)]"
      style={{ ...CARD_STYLE, animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <Quote size={18} aria-hidden style={{ color: ACCENT }} fill="currentColor" className="opacity-60" />
      <blockquote className="mt-2 text-[15px] leading-relaxed [overflow-wrap:anywhere]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}>
        {cleanComment(text)}
      </blockquote>
      <figcaption className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <HeartHandshake size={13} aria-hidden style={{ color: ACCENT }} />
          A colleague
        </span>
        <Tag>Peer evaluation</Tag>
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

export default function PeersLovePage() {
  const [strengths, setStrengths] = useState<StrengthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Aggregate across ALL of this clinician's branches (e.g. East + Greenhills).
  useEffect(() => {
    fetchStrengths()
  }, [])

  async function fetchStrengths() {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/peers-love`)
      if (res.ok) {
        const data = await res.json()
        setStrengths(data.strengths ?? [])
        // The route answers 200 + { error } when the peer-evaluation source
        // can't be read; say so instead of showing "No peer feedback yet".
        if (data.error && !(data.strengths ?? []).length) setFailed(true)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    }
    setLoading(false)
  }

  const total = strengths.length

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Recognition"
        title="What your Peers Love About You"
        description="Strengths your colleagues highlighted about you in their peer evaluations."
      />

      {loading ? (
        <WallSkeleton />
      ) : failed ? (
        <ErrorCard title="Couldn't load your peer feedback" hint="The peer evaluation data isn't available right now. Try again in a moment." onRetry={fetchStrengths} />
      ) : total === 0 ? (
        <section className="rounded-xl overflow-hidden" style={CARD_STYLE}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Codepaca.svg" alt="" aria-hidden width={120} height={120} className="block mx-auto mt-8 w-[110px] h-[110px]" />
          <EmptyState
            title="No peer feedback yet, but great things are coming"
            hint="Once your peers complete their evaluations, the strengths they highlight about you will appear here."
          />
        </section>
      ) : (
        <>
          <section className="rounded-xl px-4 sm:px-5 py-4 flex items-center gap-4 sm:gap-5 overflow-hidden" style={CARD_STYLE}>
            <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: ACCENT_BG, color: ACCENT }}>
              <HeartHandshake size={22} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[22px] sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                {total} kind {total === 1 ? 'word' : 'words'}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--mid-gray)' }}>from your peers</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Codepaca.svg" alt="Aura alpaca mascot" width={120} height={120} className="hidden sm:block shrink-0 w-[96px] h-[96px] lg:w-[120px] lg:h-[120px] -my-2" />
          </section>

          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
            {strengths.map((s, i) => (
              <QuoteCard key={s.id} text={s.text} index={i} />
            ))}
          </div>
        </>
      )}

      <p className="text-[12px] leading-relaxed px-0.5" style={{ color: 'var(--mid-gray)' }}>
        <strong style={{ color: 'var(--deep-teal)' }}>About these comments:</strong> they are the &ldquo;Strengths&rdquo; answers from your peer evaluations, shown anonymously. Only strengths appear here; areas for improvement are not shown.
      </p>
    </div>
  )
}
