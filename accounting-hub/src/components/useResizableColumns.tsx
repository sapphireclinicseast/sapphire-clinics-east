'use client'

import { RefObject, useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drag-to-resize table columns. Minimal wiring per table:
 *   const tableRef = useRef<HTMLTableElement>(null)
 *   const rz = useResizableColumns('petty-cash-entries', tableRef)
 *   <table ref={tableRef} style={{ ...rz.tableStyle }}>
 *     <ResizableColgroup rz={rz} />
 *     <thead>… each <th> gets a <ColResizeHandle rz={rz} index={i} /> …</thead>
 *
 * On first mount it measures the natural width of every header cell so the table
 * looks identical, then switches to table-layout: fixed so the stored widths are
 * authoritative (columns can be widened AND narrowed). Widths persist per user in
 * localStorage under storageKey.
 */
export interface ResizeApi {
  widths: Record<number, number>
  ready: boolean
  colCount: number
  tableStyle: React.CSSProperties
  startResize: (index: number, e: React.MouseEvent) => void
}

export function useResizableColumns(storageKey: string, tableRef: RefObject<HTMLTableElement | null>): ResizeApi {
  const [widths, setWidths] = useState<Record<number, number>>({})
  const [ready, setReady] = useState(false)
  const [colCount, setColCount] = useState(0)
  const seeded = useRef(false)

  useEffect(() => {
    if (seeded.current) return
    const t = tableRef.current
    if (!t) return
    const headRow = t.querySelector('thead tr')
    if (!headRow) return
    const cells = Array.from(headRow.children) as HTMLElement[]
    if (cells.length === 0) return

    let stored: Record<number, number> | null = null
    try { const raw = localStorage.getItem(storageKey); if (raw) stored = JSON.parse(raw) } catch { /* ignore */ }

    const w: Record<number, number> = {}
    cells.forEach((c, i) => {
      const s = stored?.[i]
      w[i] = (typeof s === 'number' && s > 0) ? s : Math.max(40, Math.round(c.getBoundingClientRect().width))
    })
    setColCount(cells.length)
    setWidths(w)
    setReady(true)
    seeded.current = true
  })

  useEffect(() => {
    if (ready && Object.keys(widths).length) {
      try { localStorage.setItem(storageKey, JSON.stringify(widths)) } catch { /* ignore */ }
    }
  }, [widths, ready, storageKey])

  const startResize = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    setWidths(prev => {
      const startW = prev[index] ?? 120
      const move = (ev: MouseEvent) => {
        const next = Math.max(40, startW + (ev.clientX - startX))
        setWidths(p => ({ ...p, [index]: next }))
      }
      const up = () => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      return prev
    })
  }, [])

  const tableStyle: React.CSSProperties = ready ? { tableLayout: 'fixed' } : {}
  return { widths, ready, colCount, tableStyle, startResize }
}

/** Renders a <colgroup> matching the measured/stored widths. Place as first child of <table>. */
export function ResizableColgroup({ rz }: { rz: ResizeApi }) {
  if (!rz.ready || rz.colCount === 0) return null
  return (
    <colgroup>
      {Array.from({ length: rz.colCount }, (_, i) => (
        <col key={i} style={rz.widths[i] ? { width: rz.widths[i] } : undefined} />
      ))}
    </colgroup>
  )
}

/** Drag grip for a header cell. The <th> must be position: relative. */
export function ColResizeHandle({ rz, index }: { rz: ResizeApi; index: number }) {
  return (
    <span
      onMouseDown={(e) => rz.startResize(index, e)}
      onClick={(e) => { e.stopPropagation() }}
      title="Drag to resize column"
      style={{
        position: 'absolute', top: 0, right: -2, height: '100%', width: 8,
        cursor: 'col-resize', userSelect: 'none', zIndex: 20, touchAction: 'none',
      }}
    />
  )
}
