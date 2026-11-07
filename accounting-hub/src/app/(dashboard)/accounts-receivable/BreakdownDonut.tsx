'use client'

// The ring chart on the HMO and GL summaries: the total in the middle, a ranked
// list beside it, and the numbers on hover (over a slice or its row).

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface DonutItem {
  label: string
  value: number
  /** Extra lines for the hover card, e.g. received and not yet paid. */
  details?: { label: string; value: string }[]
}

// Six is what stays readable on a ring. Checked for colour-blind separation between
// neighbours; a repeated colour would make two slices read as one. The rest fold
// into a neutral "Others", which the list and hover card still spell out.
const PALETTE = ['#00958A', '#C4553F', '#7B4FB0', '#D39A1F', '#2F78D0', '#A8682E']
const OTHERS_COLOR = '#B8B2A7'
const OTHERS_KEY = '__others__'

const SIZE = 200
const CENTER = SIZE / 2
const OUTER = 92
const INNER = 66
const HOVER_GROW = 6
// A 0.3% slice is under 1°: too thin to see or hover. Drawn slightly wider, while
// the numbers stay exact.
const MIN_SWEEP = 3

interface Segment extends DonutItem {
  key: string
  share: number
  color: string
  start: number
  sweep: number
  members?: DonutItem[]
}

function polar(radius: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180
  return `${(CENTER + radius * Math.cos(rad)).toFixed(3)} ${(CENTER + radius * Math.sin(rad)).toFixed(3)}`
}

function ringPath(start: number, sweep: number, outer: number): string {
  // An arc can't draw a full circle in one go, so a lone slice is two halves.
  if (sweep >= 359.99) return `${ringPath(0, 180, outer)} ${ringPath(180, 180, outer)}`
  const end = start + sweep
  const large = sweep > 180 ? 1 : 0
  return `M ${polar(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${polar(outer, end)} L ${polar(INNER, end)} A ${INNER} ${INNER} 0 ${large} 0 ${polar(INNER, start)} Z`
}

export function buildSegments(items: DonutItem[], remembered: Map<string, string>): { segments: Segment[]; total: number } {
  const sorted = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, i) => sum + i.value, 0)
  if (total <= 0) return { segments: [], total: 0 }

  const shown = sorted.slice(0, PALETTE.length)
  const rest = sorted.slice(PALETTE.length)

  // A person's colour follows them, so filtering by branch doesn't repaint survivors.
  const taken = new Set(shown.map(i => remembered.get(i.label)).filter(Boolean))
  const free = PALETTE.filter(c => !taken.has(c))
  for (const i of shown) {
    if (!remembered.has(i.label) || !PALETTE.includes(remembered.get(i.label) as string)) remembered.set(i.label, free.shift() as string)
  }

  const parts: Omit<Segment, 'start' | 'sweep'>[] = shown.map(i => ({
    ...i, key: i.label, share: i.value / total, color: remembered.get(i.label) as string,
  }))
  if (rest.length === 1) {
    parts.push({ ...rest[0], key: rest[0].label, share: rest[0].value / total, color: OTHERS_COLOR })
  } else if (rest.length > 1) {
    const value = rest.reduce((sum, i) => sum + i.value, 0)
    parts.push({ key: OTHERS_KEY, label: `Others (${rest.length})`, value, share: value / total, color: OTHERS_COLOR, members: rest })
  }

  const widened = parts.map(p => Math.max(p.share * 360, MIN_SWEEP))
  const fixed = widened.filter((w, i) => w > parts[i].share * 360).reduce((sum, w) => sum + w, 0)
  const free360 = widened.filter((w, i) => w === parts[i].share * 360).reduce((sum, w) => sum + w, 0)
  const scale = free360 > 0 ? (360 - fixed) / free360 : 1
  let start = 0
  const segments = parts.map((p, i) => {
    const sweep = widened[i] > p.share * 360 ? widened[i] : widened[i] * scale
    const segment = { ...p, start, sweep }
    start += sweep
    return segment
  })
  return { segments, total }
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`

export default function BreakdownDonut({ title, items, format = n => formatCurrency(n), formatTotal, totalLabel = 'Total', note }: {
  title: string
  items: DonutItem[]
  format?: (value: number) => string
  /** The middle of the ring, when a total isn't the same kind of number as a slice. */
  formatTotal?: (value: number) => string
  totalLabel?: string
  note?: string
}) {
  const remembered = useRef(new Map<string, string>())
  const { segments, total } = useMemo(() => buildSegments(items, remembered.current), [items])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)

  if (segments.length === 0) return null
  const active = segments.find(s => s.key === activeKey) || null
  const leave = () => { setActiveKey(null); setPointer(null) }

  const hoverLines = active?.members?.length ?? active?.details?.length ?? 0

  return (
    <div className="rounded-xl border p-4 min-w-0" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>{title}</p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="relative flex-shrink-0 mx-auto sm:mx-0" style={{ width: 180, height: 180 }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={180} height={180} aria-hidden="true" style={{ overflow: 'visible' }}>
            {segments.map(s => (
              <path key={s.key} data-slice={s.label} d={ringPath(s.start, s.sweep, s.key === activeKey ? OUTER + HOVER_GROW : OUTER)}
                fill={s.color} stroke="white" strokeWidth={2} strokeLinejoin="round"
                className="cursor-pointer motion-reduce:transition-none"
                style={{ opacity: activeKey && activeKey !== s.key ? 0.3 : 1, transition: 'opacity 120ms ease' }}
                onPointerEnter={e => { setActiveKey(s.key); setPointer({ x: e.clientX, y: e.clientY }) }}
                onPointerMove={e => setPointer({ x: e.clientX, y: e.clientY })}
                onPointerLeave={leave} />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-8">
            <p className="text-[11px] leading-tight line-clamp-2 break-words" style={{ color: 'var(--mid-gray)' }}>{active ? active.label : totalLabel}</p>
            <p className="text-[13px] font-bold mt-0.5 tabular-nums whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
              {active ? format(active.value) : (formatTotal || format)(total)}
            </p>
            {active && <p className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--mid-gray)' }}>{percent(active.share)}</p>}
          </div>
        </div>

        <ul className="flex-1 min-w-0 w-full space-y-2">
          {segments.map(s => (
            <li key={s.key} onMouseEnter={() => setActiveKey(s.key)} onMouseLeave={leave}
              className="rounded-md px-1.5 py-1 -mx-1.5" style={{ background: activeKey === s.key ? 'var(--off-white)' : undefined }}>
              {s.members ? (
                <button type="button" aria-expanded={othersOpen} onClick={() => setOthersOpen(o => !o)} className="w-full flex items-center gap-2 text-xs text-left">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="font-medium truncate flex items-center gap-0.5" style={{ color: 'var(--charcoal)' }}>
                    {s.label}{othersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                  <span className="ml-auto flex-shrink-0 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{percent(s.share)}</span>
                  <span className="flex-shrink-0 tabular-nums font-semibold text-right" style={{ color: 'var(--charcoal)' }}>{format(s.value)}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="font-medium truncate" style={{ color: 'var(--charcoal)' }} title={s.label}>{s.label}</span>
                  <span className="ml-auto flex-shrink-0 tabular-nums" style={{ color: 'var(--mid-gray)' }}>{percent(s.share)}</span>
                  <span className="flex-shrink-0 tabular-nums font-semibold text-right" style={{ color: 'var(--charcoal)' }}>{format(s.value)}</span>
                </div>
              )}
              <div className="mt-1 ml-[18px] h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--off-white)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(s.share * 100, 0.5)}%`, background: s.color }} />
              </div>
              {s.members && othersOpen && (
                <ul className="mt-2 ml-[18px] space-y-1">
                  {s.members.map(m => (
                    <li key={m.label} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                      <span className="truncate" title={m.label}>{m.label}</span>
                      <span className="ml-auto flex-shrink-0 tabular-nums">{percent(m.value / total)}</span>
                      <span className="flex-shrink-0 tabular-nums text-right">{format(m.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
      {note && <p className="text-[11px] mt-3" style={{ color: 'var(--mid-gray)' }}>{note}</p>}

      {active && pointer && (
        <div role="tooltip" className="fixed z-[80] rounded-lg border shadow-lg px-3 py-2 pointer-events-none" style={{
          width: 248, borderColor: 'var(--light-gray)', background: 'white',
          left: Math.max(8, Math.min(pointer.x + 14, window.innerWidth - 256)),
          top: Math.max(8, Math.min(pointer.y + 14, window.innerHeight - 84 - hoverLines * 20)),
        }}>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: active.color }} />
            <span className="truncate">{active.label}</span>
          </p>
          <p className="text-sm font-bold mt-1 tabular-nums" style={{ color: 'var(--charcoal)' }}>
            {format(active.value)} <span className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>· {percent(active.share)}</span>
          </p>
          {active.details?.map(d => (
            <p key={d.label} className="flex justify-between gap-3 text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              <span>{d.label}</span><span className="tabular-nums font-medium" style={{ color: 'var(--charcoal)' }}>{d.value}</span>
            </p>
          ))}
          {active.members?.map(m => (
            <p key={m.label} className="flex justify-between gap-3 text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              <span className="truncate">{m.label}</span><span className="tabular-nums flex-shrink-0" style={{ color: 'var(--charcoal)' }}>{format(m.value)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
