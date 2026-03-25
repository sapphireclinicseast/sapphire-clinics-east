'use client'
import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'

interface Props {
  onDownload: (format: 'xlsx' | 'pdf') => void
  label?: string
  size?: 'sm' | 'md'
}

export default function DownloadMenu({ onDownload, label = 'Download', size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const py = size === 'sm' ? 'py-1.5' : 'py-2'
  const px = size === 'sm' ? 'px-3' : 'px-4'
  const text = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className={`${px} ${py} rounded-xl ${text} font-semibold flex items-center gap-1.5 transition-all hover:opacity-90`}
        style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
      >
        <Download size={size === 'sm' ? 14 : 16} />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border z-50 py-1 min-w-[160px]"
          style={{ borderColor: 'var(--light-gray)' }}>
          <button
            onClick={() => { onDownload('xlsx'); setOpen(false) }}
            className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
            style={{ color: 'var(--charcoal)' }}
          >
            <FileSpreadsheet size={14} style={{ color: '#16a34a' }} />
            Download as Excel (.xlsx)
          </button>
          <button
            onClick={() => { onDownload('pdf'); setOpen(false) }}
            className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors"
            style={{ color: 'var(--charcoal)' }}
          >
            <FileText size={14} style={{ color: '#dc2626' }} />
            Download as PDF
          </button>
        </div>
      )}
    </div>
  )
}
