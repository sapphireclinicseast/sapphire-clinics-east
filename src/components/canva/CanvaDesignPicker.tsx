'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, X, Loader2, ExternalLink, ImageIcon, RefreshCw, ChevronLeft } from 'lucide-react'
import type { CanvaDesign } from '@/lib/canva'

interface Props {
  onSelect: (imageUrl: string, designTitle: string) => void
  onClose: () => void
}

type Step = 'designs' | 'pages'

export default function CanvaDesignPicker({ onSelect, onClose }: Props) {
  // ── Design list state ──────────────────────────────────────────────────────
  const [designs, setDesigns] = useState<CanvaDesign[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const [continuation, setContinuation] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)

  // ── Page picker state ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('designs')
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [loadingPages, setLoadingPages] = useState(false)
  const [downloadingPage, setDownloadingPage] = useState<number | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isExpiredError = (msg: string) => /expired|reconnect|unauthorized/i.test(msg)

  // ── Fetch design list ──────────────────────────────────────────────────────
  const fetchDesigns = useCallback(async (q: string, cont?: string, append = false) => {
    setLoading(true)
    setError(null)
    setTokenExpired(false)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (cont) params.set('continuation', cont)

      const res = await fetch(`/api/canva/designs?${params}`)
      const data = await res.json()

      if (!data.connected) {
        const msg = data.error || 'Canva is not connected. Please connect your Canva account in Settings.'
        setError(msg)
        if (isExpiredError(msg)) setTokenExpired(true)
        setDesigns([])
        return
      }

      if (data.displayName) setDisplayName(data.displayName)
      setDesigns((prev) => append ? [...prev, ...data.designs] : data.designs)
      setContinuation(data.continuation)
      setHasMore(!!data.continuation)
    } catch {
      setError('Failed to load designs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDesigns('')
  }, [fetchDesigns])

  function handleSearchChange(value: string) {
    setQuery(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    const t = setTimeout(() => fetchDesigns(value), 500)
    setSearchTimeout(t)
  }

  function loadMore() {
    if (continuation) fetchDesigns(query, continuation, true)
  }

  // ── Step 1 → Step 2: export design pages ──────────────────────────────────
  async function handleOpenDesign(design: CanvaDesign) {
    setSelectedDesign(design)
    setLoadingPages(true)
    setStep('pages')
    setPages([])
    try {
      const res = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: design.id, designTitle: design.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Export failed')
      setPages(data.pages || [])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load design pages.')
      setStep('designs')
      setSelectedDesign(null)
    } finally {
      setLoadingPages(false)
    }
  }

  // ── Step 2: user picks a page → download and return imageUrl ──────────────
  async function handleSelectPage(pageUrl: string, pageIndex: number) {
    if (!selectedDesign) return
    setDownloadingPage(pageIndex)
    try {
      const res = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl, designTitle: selectedDesign.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Download failed')
      onSelect(data.imageUrl, selectedDesign.title)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import page.')
    } finally {
      setDownloadingPage(null)
    }
  }

  function handleBack() {
    setStep('designs')
    setSelectedDesign(null)
    setPages([])
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col"
        style={{ background: '#fff', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div className="flex items-center gap-3">
            {step === 'pages' && (
              <button
                onClick={handleBack}
                className="p-1 rounded-lg hover:bg-gray-100 mr-1"
                title="Back to designs"
              >
                <ChevronLeft size={18} style={{ color: 'var(--charcoal)' }} />
              </button>
            )}
            {/* Canva logo */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: '#7B2FBE' }}
            >
              C
            </div>
            <div>
              <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                {step === 'pages' && selectedDesign
                  ? selectedDesign.title || 'Choose a Page'
                  : 'Import from Canva'}
              </h2>
              {step === 'designs' && displayName && (
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {displayName}
                </p>
              )}
              {step === 'pages' && !loadingPages && pages.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {pages.length === 1 ? '1 page' : `${pages.length} pages`} — click a page to use it
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} style={{ color: 'var(--mid-gray)' }} />
          </button>
        </div>

        {/* Search (design list only) */}
        {step === 'designs' && (
          <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ border: '1.5px solid var(--light-gray)' }}>
              <Search size={15} style={{ color: 'var(--mid-gray)' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search your Canva designs…"
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: 'var(--charcoal)' }}
              />
              {query && (
                <button onClick={() => { setQuery(''); fetchDesigns('') }}>
                  <X size={13} style={{ color: 'var(--mid-gray)' }} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Step 1: Design list ── */}
          {step === 'designs' && (
            error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: '#FEE2E2' }}
                >
                  <RefreshCw size={22} style={{ color: '#DC2626' }} />
                </div>
                <p className="text-sm text-center font-medium" style={{ color: '#DC2626', maxWidth: 340 }}>
                  {error}
                </p>
                {tokenExpired ? (
                  <div className="flex flex-col items-center gap-2">
                    <a
                      href="/api/canva/auth"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2 rounded-xl text-sm font-bold text-white inline-flex items-center gap-2"
                      style={{ background: '#7B2FBE' }}
                    >
                      <RefreshCw size={14} />
                      Reconnect Canva
                    </a>
                    <button
                      onClick={() => fetchDesigns(query)}
                      className="text-xs underline"
                      style={{ color: 'var(--teal)' }}
                    >
                      I've reconnected — retry
                    </button>
                  </div>
                ) : (
                  <a
                    href="/settings/accounts"
                    className="text-sm font-semibold underline"
                    style={{ color: 'var(--teal)' }}
                  >
                    Go to Settings → Connected Accounts
                  </a>
                )}
              </div>
            ) : loading && designs.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--teal)' }} />
              </div>
            ) : designs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <ImageIcon size={32} style={{ color: 'var(--light-gray)' }} />
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {query ? `No designs found for "${query}"` : 'No designs found in your Canva account.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {designs.map((design) => (
                    <div
                      key={design.id}
                      className="rounded-xl overflow-hidden border group relative"
                      style={{ borderColor: 'var(--light-gray)' }}
                    >
                      {/* Thumbnail */}
                      <div
                        className="relative aspect-video flex items-center justify-center"
                        style={{ background: '#F3F4F6' }}
                      >
                        {design.thumbnail?.url ? (
                          <img
                            src={design.thumbnail.url}
                            alt={design.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ background: '#EDE9FE' }}
                          >
                            <span className="text-2xl font-bold" style={{ color: '#7B2FBE' }}>C</span>
                          </div>
                        )}

                        {/* Hover overlay */}
                        <div
                          className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(0,0,0,0.5)' }}
                        >
                          <button
                            onClick={() => handleOpenDesign(design)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
                            style={{ background: '#7B2FBE' }}
                          >
                            View Pages
                          </button>
                          {design.urls?.edit_url && (
                            <a
                              href={design.urls.edit_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-white/20 text-white"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <div className="px-2 py-2">
                        <p
                          className="text-xs font-medium truncate"
                          style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}
                          title={design.title}
                        >
                          {design.title || 'Untitled'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="px-5 py-2 rounded-lg text-sm font-semibold"
                      style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}
                    >
                      {loading ? 'Loading…' : 'Load more designs'}
                    </button>
                  </div>
                )}
              </>
            )
          )}

          {/* ── Step 2: Page picker ── */}
          {step === 'pages' && (
            loadingPages ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--teal)' }} />
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
                  Exporting design pages…
                </p>
              </div>
            ) : pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <ImageIcon size={32} style={{ color: 'var(--light-gray)' }} />
                <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>No pages found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {pages.map((pageUrl, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden border group relative cursor-pointer"
                    style={{ borderColor: 'var(--light-gray)' }}
                    onClick={() => {
                      if (downloadingPage === null) handleSelectPage(pageUrl, idx)
                    }}
                  >
                    {/* Page thumbnail */}
                    <div
                      className="relative aspect-video flex items-center justify-center"
                      style={{ background: '#F3F4F6' }}
                    >
                      <img
                        src={pageUrl}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-full object-contain"
                      />

                      {/* Hover overlay */}
                      <div
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.5)' }}
                      >
                        {downloadingPage === idx ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#7B2FBE' }}>
                            <Loader2 size={12} className="animate-spin" />
                            Importing…
                          </span>
                        ) : (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#7B2FBE' }}>
                            Use this page
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Page label */}
                    <div className="px-2 py-2 flex items-center justify-between">
                      <p
                        className="text-xs font-medium"
                        style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}
                      >
                        Page {idx + 1}
                      </p>
                      {downloadingPage === idx && (
                        <Loader2 size={12} className="animate-spin" style={{ color: 'var(--teal)' }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--light-gray)' }}
        >
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            {step === 'designs'
              ? 'Click a design to view its pages, then choose a page to add to your post.'
              : 'Click any page to export it as a JPG and add it to your post.'}
          </p>
          <button
            onClick={step === 'pages' ? handleBack : onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--light-gray)', color: 'var(--charcoal)' }}
          >
            {step === 'pages' ? 'Back' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
