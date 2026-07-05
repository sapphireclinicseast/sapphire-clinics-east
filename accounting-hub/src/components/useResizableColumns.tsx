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
  // Keep a live mirror of widths so the drag handler can read the current width
  // synchronously (without stale closures) when a resize starts.
  const widthsRef = useRef(widths)
  widthsRef.current = widths

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
    // Read the starting width synchronously; fall back to the header cell's real
    // width if this column hasn't been measured yet.
    let startW = widthsRef.current[index]
    if (!startW) {
      const th = (e.currentTarget as HTMLElement).closest('th')
      startW = th ? Math.round(th.getBoundingClientRect().width) : 120
    }
    // Attach listeners synchronously so the very next mousemove already resizes.
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
      className="group/resize"
      style={{
        position: 'absolute', top: 0, right: -4, height: '100%', width: 10,
        cursor: 'col-resize', userSelect: 'none', zIndex: 20, touchAction: 'none',
        display: 'flex', justifyContent: 'center',
      }}
    >
      {/* thin grip line, brightens on hover */}
      <span
        className="group-hover/resize:opacity-100"
        style={{ width: 2, height: '100%', background: 'var(--teal)', opacity: 0.25, transition: 'opacity .15s' }}
      />
    </span>
  )
}
