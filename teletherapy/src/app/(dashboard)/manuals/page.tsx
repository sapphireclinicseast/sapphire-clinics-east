'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Eye, Layers, Lock } from 'lucide-react'
import ManualViewer, { type ManualMeta } from './ManualViewer'
import {
  EmptyState, ErrorCard, PageHeader, Skeleton, Tag,
  CARD_STYLE, CONTROL, CONTROL_STYLE, FOCUS, PAGE, SUBTLE_BG,
} from '@/components/hub/ui'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Cover thumbnail = the manual's first rendered page (served by
 * /api/manuals/[id]/page/1, the same view-only image pipeline as the
 * reader — the source PDF never reaches the browser). Falls back to the
 * teal book tile while loading or if the page image can't be fetched.
 */
function ManualCover({ id }: { id: string }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  return (
    <div className="relative w-14 h-[76px] rounded-md overflow-hidden shrink-0 bg-white" style={{ border: '1px solid var(--light-gray)', boxShadow: '0 2px 8px rgba(36,73,82,0.08)' }}>
      {status !== 'ok' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'var(--pale-teal)' }}
        >
          <BookOpen style={{ color: 'var(--teal)' }} size={20} />
        </div>
      )}
      {status !== 'error' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/manuals/${id}/page/1`}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
          className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300 ${status === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

export default function ManualsPage() {
  const [manuals, setManuals] = useState<ManualMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<ManualMeta | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/manuals', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed to load manuals (${res.status})`)
        const data = (await res.json()) as { manuals?: ManualMeta[] }
        if (!cancelled) setManuals(data.manuals ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load manuals')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const q = search.trim().toLowerCase()
  const shown = q
    ? manuals.filter((m) => `${m.name} ${m.version ?? ''} ${m.departments.join(' ')}`.toLowerCase().includes(q))
    : manuals

  return (
    <div className={`${PAGE} !max-w-[1000px]`}>
      <PageHeader
        eyebrow="Resources"
        title="Manuals"
        description="Department manuals you can read here. View-only — these cannot be downloaded."
        actions={
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
            <Lock size={12} /> View-only
          </span>
        }
      />

      {/* Search — only worth showing once there's more than a handful. */}
      {!loading && !error && manuals.length > 4 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manuals by name or department…"
          aria-label="Search manuals"
          className={`${CONTROL} w-full h-10`}
          style={CONTROL_STYLE}
        />
      )}

      {loading && (
        <div className="grid sm:grid-cols-2 gap-4" role="status" aria-label="Loading manuals">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      )}

      {!loading && error && <ErrorCard title="Could not load manuals" hint={error} />}

      {!loading && !error && manuals.length === 0 && (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState icon="book" title="No manuals available yet" hint="Manuals published for your department will appear here." />
        </div>
      )}

      {!loading && !error && manuals.length > 0 && shown.length === 0 && (
        <div className="rounded-xl" style={CARD_STYLE}>
          <EmptyState icon="search" title={`No manuals match "${search}".`} hint="Try a different name or department." />
        </div>
      )}

      {!loading && !error && shown.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {shown.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActive(m)}
              className={`group text-left rounded-xl flex flex-col min-w-0 transition-[border-color,box-shadow] hover:shadow-[0_8px_24px_-12px_rgba(36,73,82,0.28)] hover:border-[var(--teal)] ${FOCUS}`}
              style={CARD_STYLE}
            >
              <div className="p-4 sm:p-5 flex items-start gap-3.5 flex-1">
                <ManualCover id={m.id} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{m.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                    {m.version && <span>v{m.version}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Layers size={12} /> {m.pageCount} page{m.pageCount === 1 ? '' : 's'}
                    </span>
                    {formatSize(m.sizeBytes) && <span>{formatSize(m.sizeBytes)}</span>}
                  </div>
                  {m.departments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.departments.map((d) => <Tag key={d} tone="brand">{d}</Tag>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between rounded-b-xl" style={{ borderTop: '1px solid var(--light-gray)', background: SUBTLE_BG }}>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-all group-hover:gap-2.5" style={{ color: 'var(--teal)' }}>
                  <Eye size={14} /> Read manual
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                  <Lock size={11} /> View-only
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {active && <ManualViewer manual={active} onClose={() => setActive(null)} />}
    </div>
  )
}
