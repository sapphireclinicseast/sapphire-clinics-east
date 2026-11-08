'use client'

// Building blocks for the Budget page. They live at module level on purpose: a row
// component defined inside the page's render is a new component on every
// keystroke, so React remounted every input and typing lost focus after one key.
import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Unlock, Loader2 } from 'lucide-react'
import { type Line, type VsRow, MS } from './budget-math'

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 1,234.56 — table cells (no ₱ in every cell; tiles and totals carry it). */
export const num = (v: number) => v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pesoSigned = (v: number) => `${v < 0 ? '-' : ''}₱${num(Math.abs(v))}`

const ink = { color: 'var(--charcoal)' }
const muted = { color: 'var(--mid-gray)' }
export const FAV = '#15803d'
export const UNFAV = '#b91c1c'
const LOCKED_BG = '#f7f4ee'

/* ── summary tile ─────────────────────────────────────────────────────── */

export function Tile({ label, value, note, tone, children }: { label: string; value: string; note?: React.ReactNode; tone?: 'strong'; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-3 sm:p-4 min-w-0"
      style={tone === 'strong' ? { borderColor: 'var(--bright-teal)', background: 'var(--pale-teal)' } : { borderColor: 'var(--light-gray)', background: 'white' }}>
      <p className="text-xs font-semibold" style={muted}>{label}</p>
      <p className="text-base sm:text-xl font-bold mt-1 tabular-nums break-words" style={{ color: tone === 'strong' ? 'var(--deep-teal)' : 'var(--charcoal)' }}>{value}</p>
      {note && <div className="text-[11px] mt-0.5" style={muted}>{note}</div>}
      {children}
    </div>
  )
}

/** Twelve dots, filled for locked months. */
export function LockStrip({ locked }: { locked: Set<number> }) {
  return (
    <div className="flex gap-1 mt-2" aria-hidden>
      {MS.map(m => (
        <span key={m} title={`${MON[m - 1]}${locked.has(m) ? ' — locked' : ''}`} className="h-1.5 flex-1 rounded-full"
          style={{ background: locked.has(m) ? '#d97706' : 'var(--light-gray)' }} />
      ))}
    </div>
  )
}

/* ── entry cell ───────────────────────────────────────────────────────── */

/**
 * A budget amount. Shows 1,234.56 while idle and the raw figure while editing, so
 * the stored text is always a plain number (commas typed or pasted are dropped —
 * before, "1,000" saved as 1).
 */
export function BudgetInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  // Select the raw figure as soon as it replaces the formatted one, before the next
  // keystroke, so typing overwrites it (a frame later would swallow the first key).
  useLayoutEffect(() => { if (focused) ref.current?.select() }, [focused])
  const n = parseFloat(value || '0') || 0
  return (
    <input ref={ref} inputMode="decimal" aria-label={label} placeholder="—"
      value={focused ? value : (n ? num(n) : '')}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value.replace(/,/g, ''))}
      className="w-full px-2 py-1 rounded-md border text-xs text-right tabular-nums bg-white outline-none focus:border-[var(--bright-teal)] focus:ring-2 focus:ring-[#4A807333] placeholder:text-[#c9c2b6]"
      style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }} />
  )
}

/* ── the year grid ────────────────────────────────────────────────────── */

export interface GridSection { id: string; title: string; lines: Line[] }
export interface GridTotal { label: string; row: { months: number[]; year: number }; net?: boolean }

export function BudgetGrid({ months, sections, totalsAfter, inputs, setInput, canEdit, locked, onToggleLock, lockBusy, hideEmpty, collapsed, onToggleSection, yearTotalOf }: {
  months: number[]
  sections: GridSection[]
  /** totals rows shown after the section with that id */
  totalsAfter: Record<string, GridTotal[]>
  inputs: Record<string, string>
  setInput: (k: string, v: string) => void
  canEdit: boolean
  locked: Set<number>
  onToggleLock: (m: number) => void
  lockBusy: number | null
  hideEmpty: boolean
  collapsed: Set<string>
  onToggleSection: (id: string) => void
  yearTotalOf: (key: string) => number
}) {
  const val = (m: number, key: string) => parseFloat(inputs[`${m}:${key}`] || '0') || 0
  const cols = months.length + 2
  const labelCls = 'sticky left-0 z-10 min-w-[150px] sm:min-w-[250px] max-w-[250px] px-3 sm:px-4'
  const totalCls = 'min-w-[112px] px-3 text-right'

  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr>
          <th className={`${labelCls} top-0 z-30 py-2.5 text-left text-xs font-semibold border-b`} style={{ background: 'var(--off-white)', ...muted, borderColor: 'var(--light-gray)' }}>Line item</th>
          {months.map(m => {
            const isLocked = locked.has(m)
            return (
              <th key={m} className="sticky top-0 z-20 px-1.5 py-1.5 text-center text-xs font-semibold min-w-[96px] border-b" style={{ background: isLocked ? '#efe9de' : 'var(--off-white)', borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                <div>{MON[m - 1]}</div>
                {canEdit ? (
                  <button onClick={() => onToggleLock(m)} disabled={lockBusy != null}
                    title={isLocked ? `Unlock ${MON[m - 1]}` : `Lock ${MON[m - 1]} (saves its figures first)`}
                    className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold border disabled:opacity-60"
                    style={isLocked ? { background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' } : { background: 'white', borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                    {lockBusy === m ? <Loader2 size={10} className="animate-spin" /> : isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                    {isLocked ? 'Locked' : 'Open'}
                  </button>
                ) : isLocked ? (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#92400e' }}><Lock size={10} /> Locked</div>
                ) : null}
              </th>
            )
          })}
          <th className={`${totalCls} sticky top-0 sm:right-0 z-30 py-2.5 text-xs font-semibold border-b border-l`} style={{ background: 'var(--off-white)', color: 'var(--charcoal)', borderColor: 'var(--light-gray)' }}>Year total</th>
        </tr>
      </thead>
      <tbody>
        {sections.map(sec => {
          const isCollapsed = collapsed.has(sec.id)
          const shown = hideEmpty ? sec.lines.filter(l => yearTotalOf(l.key) !== 0) : sec.lines
          return (
            <SectionRows key={sec.id}>
              <tr className="cursor-pointer select-none" onClick={() => onToggleSection(sec.id)}>
                <td colSpan={cols} className="px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wide border-b" style={{ background: '#fbf9f5', color: 'var(--deep-teal)', borderColor: 'var(--light-gray)' }}>
                  <span className="sticky left-3 sm:left-4 inline-flex items-center gap-1">
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {sec.title}
                    <span className="normal-case tracking-normal font-medium" style={muted}>
                      · {hideEmpty && shown.length !== sec.lines.length ? `${shown.length} of ${sec.lines.length} lines` : `${sec.lines.length} line${sec.lines.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                </td>
              </tr>
              {!isCollapsed && shown.map(l => (
                <tr key={l.key} className="group">
                  <td className={`${labelCls} py-1.5 text-[13px] leading-tight border-b bg-white group-hover:bg-[#fbf9f5]`} style={{ ...ink, borderColor: 'var(--light-gray)' }} title={l.label}>
                    {l.label}
                  </td>
                  {months.map(m => {
                    const editable = canEdit && !locked.has(m)
                    const v = val(m, l.key)
                    return (
                      <td key={m} className="px-1.5 py-1 text-right text-xs tabular-nums border-b" style={{ borderColor: 'var(--light-gray)', background: locked.has(m) ? LOCKED_BG : undefined }}>
                        {editable
                          ? <BudgetInput value={inputs[`${m}:${l.key}`] ?? ''} onChange={x => setInput(`${m}:${l.key}`, x)} label={`${l.label}, ${MON[m - 1]}`} />
                          : <span className="px-2" style={v ? ink : { color: '#c9c2b6' }}>{v ? num(v) : '—'}</span>}
                      </td>
                    )
                  })}
                  <td className={`${totalCls} sm:sticky sm:right-0 z-10 py-1.5 text-xs font-semibold tabular-nums border-b border-l bg-white group-hover:bg-[#fbf9f5]`} style={{ color: 'var(--deep-teal)', borderColor: 'var(--light-gray)' }}>
                    {num(yearTotalOf(l.key))}
                  </td>
                </tr>
              ))}
              {!isCollapsed && shown.length === 0 && (
                <tr><td colSpan={cols} className="px-4 py-2 text-xs border-b" style={{ ...muted, borderColor: 'var(--light-gray)' }}>
                  <span className="sticky left-4">Nothing budgeted here yet{hideEmpty ? ' — untick “Hide empty lines” to see every line' : ''}.</span>
                </td></tr>
              )}
              {(totalsAfter[sec.id] || []).map(t => <TotalRowView key={t.label} t={t} months={months} />)}
            </SectionRows>
          )
        })}
      </tbody>
    </table>
  )
}

function SectionRows({ children }: { children: React.ReactNode }) { return <>{children}</> }

function TotalRowView({ t, months }: { t: GridTotal; months: number[] }) {
  const bg = t.net ? 'var(--pale-teal)' : '#f5f2ec'
  const color = t.net ? 'var(--deep-teal)' : 'var(--charcoal)'
  const border = { borderColor: t.net ? 'var(--bright-teal)' : 'var(--light-gray)' }
  return (
    <tr className={t.net ? 'font-bold' : 'font-semibold'}>
      <td className="sticky left-0 z-10 px-3 sm:px-4 py-2 text-[13px] border-b" style={{ background: bg, color, ...border }}>{t.label}</td>
      {months.map(m => (
        <td key={m} className="px-3 py-2 text-right text-xs tabular-nums border-b" style={{ background: bg, color, ...border }}>{num(t.row.months[m - 1])}</td>
      ))}
      <td className="sm:sticky sm:right-0 z-10 px-3 py-2 text-right text-xs tabular-nums border-b border-l" style={{ background: bg, color, ...border }}>{num(t.row.year)}</td>
    </tr>
  )
}

/* ── Budget vs Actual ─────────────────────────────────────────────────── */

export function Variance({ v, ok }: { v: number; ok: boolean }) {
  return <span className="font-semibold" style={{ color: ok ? FAV : UNFAV }}>{v >= 0 ? '+' : '−'}{num(Math.abs(v))}</span>
}

/** Actual as a share of budget, with a small bar; blank when nothing was budgeted. */
export function PctOfBudget({ actual, budget, ok }: { actual: number; budget: number; ok: boolean }) {
  if (!budget) return <span style={{ color: '#c9c2b6' }}>—</span>
  const pct = (actual / budget) * 100
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="hidden lg:inline-block w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--light-gray)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: ok ? FAV : UNFAV }} />
      </span>
      <span className="tabular-nums" style={{ color: ok ? FAV : UNFAV }}>{pct.toFixed(0)}%</span>
    </span>
  )
}

export interface VsSection { title: string; rows: VsRow[]; total?: { label: string; b: number; a: number; ok: boolean; net?: boolean }[] }

export function VsTable({ heading, sections, hideEmpty }: { heading: string; sections: VsSection[]; hideEmpty: boolean }) {
  const th = 'sticky top-0 z-10 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b'
  const thStyle = { background: 'var(--off-white)', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }
  const td = 'px-3 sm:px-4 py-2 border-b'
  const tdStyle = { borderColor: 'var(--light-gray)' }
  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr>
          <th className={`${th} text-left rounded-tl-2xl`} style={thStyle}>{heading}</th>
          <th className={`${th} text-right`} style={thStyle}>Budget</th>
          <th className={`${th} text-right`} style={thStyle}>Actual</th>
          <th className={`${th} text-right`} style={thStyle}>Variance</th>
          <th className={`${th} text-right hidden sm:table-cell rounded-tr-2xl`} style={thStyle}>Of budget</th>
        </tr>
      </thead>
      <tbody>
        {sections.map(sec => {
          const rows = hideEmpty ? sec.rows.filter(r => r.budget !== 0 || r.actual !== 0) : sec.rows
          return (
            <SectionRows key={sec.title}>
              <tr><td colSpan={5} className={`${td} text-xs font-bold uppercase tracking-wide`} style={{ ...tdStyle, background: '#fbf9f5', color: 'var(--deep-teal)' }}>
                {sec.title}{hideEmpty && rows.length !== sec.rows.length && <span className="normal-case tracking-normal font-medium" style={muted}> · {rows.length} of {sec.rows.length} lines</span>}
              </td></tr>
              {rows.map(r => (
                <tr key={r.l.key} className="hover:bg-[#fbf9f5]">
                  <td className={`${td} text-[13px] leading-tight`} style={{ ...tdStyle, ...ink }}>{r.l.label}</td>
                  <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={{ ...tdStyle, ...ink }}>{num(r.budget)}</td>
                  <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={{ ...tdStyle, ...ink }}>{num(r.actual)}</td>
                  <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={tdStyle}><Variance v={r.variance} ok={r.favorable} /></td>
                  <td className={`${td} text-right text-xs hidden sm:table-cell whitespace-nowrap`} style={tdStyle}><PctOfBudget actual={r.actual} budget={r.budget} ok={r.favorable} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className={`${td} text-xs`} style={{ ...tdStyle, ...muted }}>No budget or actual on these lines.</td></tr>
              )}
              {(sec.total || []).map(t => {
                const bg = t.net ? 'var(--pale-teal)' : '#f5f2ec'
                const color = t.net ? 'var(--deep-teal)' : 'var(--charcoal)'
                const s = { ...tdStyle, background: bg, color, ...(t.net ? { borderColor: 'var(--bright-teal)' } : {}) }
                return (
                  <tr key={t.label} className={t.net ? 'font-bold' : 'font-semibold'}>
                    <td className={`${td} text-[13px]`} style={s}>{t.label}</td>
                    <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={s}>{num(t.b)}</td>
                    <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={s}>{num(t.a)}</td>
                    <td className={`${td} text-right text-xs tabular-nums whitespace-nowrap`} style={s}><Variance v={t.a - t.b} ok={t.ok} /></td>
                    <td className={`${td} text-right text-xs hidden sm:table-cell whitespace-nowrap`} style={s}><PctOfBudget actual={t.a} budget={t.b} ok={t.ok} /></td>
                  </tr>
                )
              })}
            </SectionRows>
          )
        })}
      </tbody>
    </table>
  )
}
