'use client'

/**
 * View-only manual reader. Renders server-rasterized PAGE IMAGES (never
 * the source PDF) with a book page-turn animation. Download / print /
 * drag-save are all suppressed: there is no PDF in the DOM, the context
 * menu is disabled, images are non-draggable and non-selectable.
 */
import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export interface ManualMeta {
  id: string
  name: string
  version: string
  pageCount: number
  sizeBytes: number
  departments: string[]
}

export default function ManualViewer({
  manual,
  onClose,
}: {
  manual: ManualMeta
  onClose: () => void
}) {
  const total = Math.max(1, manual.pageCount)
  const [index, setIndex] = useState(0) // 0-based current page
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [loaded, setLoaded] = useState(false)

  const go = useCallback(
    (d: 'next' | 'prev') => {
      setIndex((prev) => {
        const nx = d === 'next' ? prev + 1 : prev - 1
        if (nx < 0 || nx >= total) return prev
        setDir(d)
        setLoaded(false)
        return nx
      })
    },
    [total],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go('next')
      else if (e.key === 'ArrowLeft') go('prev')
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const pageNum = index + 1
  const src = `/api/manuals/${manual.id}/page/${pageNum}`
  const preloadNext = index + 1 < total ? `/api/manuals/${manual.id}/page/${pageNum + 1}` : null
  const preloadPrev = index - 1 >= 0 ? `/api/manuals/${manual.id}/page/${pageNum - 1}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 text-white/90 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14px] truncate">{manual.name}</p>
          <p className="text-[11px] text-white/50">
            {manual.version ? `Version ${manual.version} · ` : ''}
            {manual.departments.join(', ')} · View-only
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      {/* Book stage */}
      <div
        className="flex-1 flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-6 py-4 overflow-hidden"
        style={{ perspective: '2200px' }}
      >
        <button
          onClick={() => go('prev')}
          disabled={index === 0}
          className="shrink-0 p-2 sm:p-3 rounded-full text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="relative h-full flex items-center justify-center" style={{ maxWidth: '760px', width: '100%' }}>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
            </div>
          )}
          {/* key=index remounts the sheet so the flip animation replays each turn */}
          <img
            key={index}
            src={src}
            alt={`Page ${pageNum}`}
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={dir === 'next' ? 'manual-sheet flip-next' : 'manual-sheet flip-prev'}
            style={{
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              WebkitUserDrag: 'none',
              pointerEvents: 'none',
              opacity: loaded ? 1 : 0,
            } as React.CSSProperties}
          />
        </div>

        <button
          onClick={() => go('next')}
          disabled={index >= total - 1}
          className="shrink-0 p-2 sm:p-3 rounded-full text-white/80 bg-white/10 hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 text-center text-white/70 text-[12px] border-t border-white/10">
        Page {pageNum} of {total}
      </div>

      {/* Hidden preloads for instant neighboring turns */}
      {preloadNext && <img src={preloadNext} alt="" aria-hidden className="hidden" />}
      {preloadPrev && <img src={preloadPrev} alt="" aria-hidden className="hidden" />}

      <style>{`
        .manual-sheet {
          background: #fff;
          border-radius: 2px;
          box-shadow: 0 18px 50px rgba(0,0,0,.55);
        }
        @keyframes manualFlipNext {
          0%   { transform: rotateY(-105deg); opacity: .15; }
          100% { transform: rotateY(0deg);    opacity: 1; }
        }
        @keyframes manualFlipPrev {
          0%   { transform: rotateY(105deg);  opacity: .15; }
          100% { transform: rotateY(0deg);    opacity: 1; }
        }
        .flip-next { transform-origin: left center;  animation: manualFlipNext .5s cubic-bezier(.2,.7,.3,1); }
        .flip-prev { transform-origin: right center; animation: manualFlipPrev .5s cubic-bezier(.2,.7,.3,1); }
        @media (prefers-reduced-motion: reduce) {
          .flip-next, .flip-prev { animation: none; }
        }
      `}</style>
    </div>
  )
}
