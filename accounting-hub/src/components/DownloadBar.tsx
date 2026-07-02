'use client'
import { Download } from 'lucide-react'
import type { ExportFormat } from '@/lib/export'

// Shared From/To date filter + Excel/PDF download buttons for list views.
export function DownloadBar({ from, to, onFrom, onTo, onExport, dateLabel = 'Date range', note }: {
  from: string; to: string
  onFrom: (v: string) => void; onTo: (v: string) => void
  onExport: (fmt: ExportFormat) => void
  dateLabel?: string; note?: string
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <span className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>{dateLabel}:</span>
      <input type="date" value={from} onChange={e => onFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
      <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>→</span>
      <input type="date" value={to} onChange={e => onTo(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} />
      {(from || to) && <button onClick={() => { onFrom(''); onTo('') }} className="text-[11px] underline" style={{ color: 'var(--mid-gray)' }}>clear</button>}
      <div className="ml-auto flex items-center gap-2">
        {note && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{note}</span>}
        <button onClick={() => onExport('xlsx')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#166534' }}><Download size={13} /> Excel</button>
        <button onClick={() => onExport('pdf')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#b91c1c' }}><Download size={13} /> PDF</button>
      </div>
    </div>
  )
}
