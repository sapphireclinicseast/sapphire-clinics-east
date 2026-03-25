'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  totalItems: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function Pagination({
  totalItems,
  page,
  pageSize,
  pageSizeOptions = [25, 50, 75, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between py-3 px-1 text-xs" style={{ color: 'var(--mid-gray)' }}>
      <div className="flex items-center gap-2">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1) }}
          className="px-2 py-1 rounded-lg border text-xs outline-none"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span>per page</span>
      </div>

      <div className="flex items-center gap-3">
        <span>{start}–{end} of {totalItems}</span>
        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1 rounded-lg border disabled:opacity-30 hover:bg-gray-50 transition-colors"
            style={{ borderColor: 'var(--light-gray)' }}
          >
            <ChevronLeft size={14} />
          </button>
          {totalPages <= 7 ? (
            Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => onPageChange(p)}
                className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
                style={p === page
                  ? { background: 'var(--teal)', color: '#fff' }
                  : { color: 'var(--charcoal)' }
                }>
                {p}
              </button>
            ))
          ) : (
            <>
              {[1, 2].map((p) => (
                <button key={p} onClick={() => onPageChange(p)}
                  className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
                  style={p === page ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--charcoal)' }}>
                  {p}
                </button>
              ))}
              {page > 3 && <span className="px-1">...</span>}
              {page > 2 && page < totalPages - 1 && (
                <button onClick={() => onPageChange(page)}
                  className="w-7 h-7 rounded-lg text-xs font-medium"
                  style={{ background: 'var(--teal)', color: '#fff' }}>
                  {page}
                </button>
              )}
              {page < totalPages - 2 && <span className="px-1">...</span>}
              {[totalPages - 1, totalPages].filter(p => p > 2).map((p) => (
                <button key={p} onClick={() => onPageChange(p)}
                  className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
                  style={p === page ? { background: 'var(--teal)', color: '#fff' } : { color: 'var(--charcoal)' }}>
                  {p}
                </button>
              ))}
            </>
          )}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1 rounded-lg border disabled:opacity-30 hover:bg-gray-50 transition-colors"
            style={{ borderColor: 'var(--light-gray)' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
