'use client'

import { useEffect } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard segment error:', error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--off-white)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 shadow-lg text-center"
        style={{ background: 'white', border: '1px solid var(--light-gray)' }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#FEF2F2' }}
        >
          <AlertTriangle size={28} style={{ color: '#DC2626' }} />
        </div>

        <h1
          className="text-xl font-semibold mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
        >
          Page failed to load
        </h1>

        <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>
          This usually happens right after a system update. A quick reload will fix it.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--teal)' }}
          >
            <RefreshCw size={16} />
            Reload page
          </button>
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
