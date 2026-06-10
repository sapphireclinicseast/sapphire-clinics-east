'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Eye, Layers, Lock } from 'lucide-react'
import ManualViewer, { type ManualMeta } from './ManualViewer'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ManualsPage() {
  const [manuals, setManuals] = useState<ManualMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<ManualMeta | null>(null)

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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-[22px] font-bold text-[var(--charcoal)] flex items-center gap-2.5"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <BookOpen className="text-[var(--teal)]" size={22} />
          Manuals
        </h1>
        <p className="text-[13px] text-[var(--charcoal)]/60 mt-1">
          Department manuals you can read here. View-only — these cannot be downloaded.
        </p>
      </div>

      {loading && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--light-gray)]/40 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && manuals.length === 0 && (
        <div className="rounded-2xl border border-[var(--light-gray)] bg-white p-10 text-center">
          <BookOpen className="mx-auto mb-3 text-[var(--charcoal)]/30" size={40} />
          <p className="text-[14px] font-semibold text-[var(--charcoal)]">No manuals available yet</p>
          <p className="text-[12px] text-[var(--charcoal)]/50 mt-1">
            Manuals published for your department will appear here.
          </p>
        </div>
      )}

      {!loading && !error && manuals.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {manuals.map((m) => (
            <button
              key={m.id}
              onClick={() => setActive(m)}
              className="group text-left rounded-2xl border border-[var(--light-gray)] bg-white p-5 hover:shadow-[0_8px_24px_rgba(15,49,56,0.10)] hover:border-[var(--teal)]/40 transition-all"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, var(--teal), var(--bright-teal))' }}
                >
                  <BookOpen className="text-white" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] text-[var(--charcoal)] leading-snug">{m.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-[var(--charcoal)]/55">
                    {m.version && <span>v{m.version}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Layers size={12} /> {m.pageCount} page{m.pageCount === 1 ? '' : 's'}
                    </span>
                    {formatSize(m.sizeBytes) && <span>{formatSize(m.sizeBytes)}</span>}
                  </div>
                  {m.departments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.departments.map((d) => (
                        <span
                          key={d}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--teal)]/10 text-[var(--teal)]"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--teal)] group-hover:gap-2.5 transition-all">
                  <Eye size={14} /> Read manual
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--charcoal)]/40">
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
