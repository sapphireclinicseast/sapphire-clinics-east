'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Clock, AlertCircle, ArrowRight } from 'lucide-react'

interface QueueItem {
  id: string
  time: string
  patientName: string
  sessionType: string
  clinician: string
  converted?: boolean
}

interface PendingQueueWidgetProps {
  branch?: string | null
}

export default function PendingQueueWidget({ branch }: PendingQueueWidgetProps) {
  const [pending, setPending] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const queueBranch = branch === 'SANDBOX_EAST' ? 'SBEA' : branch === 'SANDBOX_GREENHILLS' ? 'SBGH' : 'SBEA'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    fetch(`/api/pos/queue?branch=${queueBranch}&date=${today}`)
      .then(r => r.json())
      .then((items: QueueItem[]) => {
        setPending(Array.isArray(items) ? items.filter(q => !q.converted) : [])
      })
      .catch(() => setPending([]))
      .finally(() => setLoading(false))
  }, [branch])

  if (loading) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} style={{ color: 'var(--teal)' }} />
          <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Pending Queue
          </h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--light-gray)', borderLeft: `4px solid ${pending.length > 0 ? '#d97706' : '#059669'}`, background: pending.length > 0 ? '#fffbeb' : 'white' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {pending.length > 0 ? (
            <AlertCircle size={18} style={{ color: '#b45309' }} />
          ) : (
            <Clock size={18} style={{ color: 'var(--teal)' }} />
          )}
          <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Pending Queue
          </h3>
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>
              {pending.length}
            </span>
          )}
        </div>
        <Link href="/pos" className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: 'var(--teal)' }}>
          Go to POS <ArrowRight size={14} />
        </Link>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          All queue items for today have been converted to orders. ✓
        </p>
      ) : (
        <>
          <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>
            These appointments have not yet been converted to orders:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pending.slice(0, 10).map((q) => (
              <div key={q.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'white', border: '1px solid var(--light-gray)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>
                    {q.patientName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {q.time} · {q.sessionType} · {q.clinician}
                  </p>
                </div>
              </div>
            ))}
            {pending.length > 10 && (
              <p className="text-xs text-center pt-1" style={{ color: 'var(--mid-gray)' }}>
                +{pending.length - 10} more
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
