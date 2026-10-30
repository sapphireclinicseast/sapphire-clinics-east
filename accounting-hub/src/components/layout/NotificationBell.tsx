'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, TrendingDown, CalendarClock, Landmark, ShieldCheck, Loader2 } from 'lucide-react'
import { computeTaxDue } from '@/lib/taxes'
import type { ComplianceDue } from '@/lib/compliance'

/* Top-bar bell: one place for what needs action soon —
   PF to recover after HMO decreases, recurring expenses, BIR tax deadlines,
   and benefit/government compliance deadlines (Taxes → Compliance Calendar).
   Each source is role-gated by its own API; a 403 just means "not yours". */

const TAX_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const TAX_WINDOW_DAYS = 7
const REFRESH_MS = 10 * 60 * 1000

interface Item { key: string; title: string; detail: string; daysUntil: number | null; href: string }
interface Group { key: string; label: string; icon: typeof Bell; items: Item[] }

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dueText = (d: number) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days`)
const getJson = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null)

async function loadGroups(role: string): Promise<Group[]> {
  const [pf, recurring, compliance] = await Promise.all([
    getJson('/api/payroll/hmo-settlement-alerts'),
    getJson('/api/expenses/reminders'),
    getJson('/api/compliance-deadlines?due=1'),
  ])
  const groups: Group[] = []

  // PF to recover — one line per consultant
  const alerts: { consultant: string; overpaid: number }[] = pf?.alerts || []
  if (alerts.length) {
    const by = new Map<string, { total: number; n: number }>()
    for (const a of alerts) {
      const g = by.get(a.consultant) || { total: 0, n: 0 }
      g.total += a.overpaid; g.n += 1; by.set(a.consultant, g)
    }
    groups.push({
      key: 'pf', label: 'PF to recover (HMO decreases)', icon: TrendingDown,
      items: [...by.entries()].map(([name, g]) => ({
        key: `pf-${name}`, title: `${name} — ${peso(g.total)}`,
        detail: `${g.n} session${g.n === 1 ? '' : 's'} decreased to the HMO-paid amount after PF was released`,
        daysUntil: null, href: '/payroll?sub=hmo-pf',
      })),
    })
  }

  // Recurring expenses (the API already limits to the next few days)
  const reminders: { id: string; payee: string | null; description: string | null; accountTitle: string | null; branchLabel: string; gross: number; daysUntil: number; nextDue: string }[] = recurring?.reminders || []
  if (reminders.length) {
    groups.push({
      key: 'recurring', label: 'Recurring expenses', icon: CalendarClock,
      items: reminders.map(r => ({
        key: `rec-${r.id}`, title: r.payee || r.description || r.accountTitle || 'Recurring expense',
        detail: `${r.branchLabel} · ${peso(r.gross)} · ${r.nextDue}`, daysUntil: r.daysUntil, href: '/expenses',
      })),
    })
  }

  // BIR tax deadlines (computed client-side, same as the Taxes page)
  if (TAX_ROLES.includes(role)) {
    const taxes = computeTaxDue(new Date()).filter(t => t.daysUntil <= TAX_WINDOW_DAYS).sort((a, b) => a.daysUntil - b.daysUntil)
    if (taxes.length) {
      groups.push({
        key: 'tax', label: 'BIR tax deadlines', icon: Landmark,
        items: taxes.map(t => ({ key: `tax-${t.key}`, title: t.name, detail: `${t.forms} · ${t.nextDue}`, daysUntil: t.daysUntil, href: '/taxes' })),
      })
    }
  }

  // Benefits & government compliance (Compliance Calendar)
  const due: ComplianceDue[] = compliance?.due || []
  if (due.length) {
    groups.push({
      key: 'compliance', label: 'Benefits & compliance', icon: ShieldCheck,
      items: due.map(c => ({
        key: `cmp-${c.id}`, title: c.name,
        detail: `${c.periodLabel ? `${c.periodLabel} · ` : ''}${c.nextDue}`, daysUntil: c.daysUntil, href: '/taxes?tab=compliance',
      })),
    })
  }
  return groups
}

export default function NotificationBell({ role }: { role?: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => { loadGroups(role || '').then(setGroups).catch(() => setGroups([])) }, [role])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [refresh])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mouseup', close)
    return () => document.removeEventListener('mouseup', close)
  }, [])

  const count = (groups || []).reduce((s, g) => s + g.items.length, 0)
  const urgent = (groups || []).some(g => g.items.some(i => i.daysUntil !== null && i.daysUntil <= 0))

  return (
    <div className="relative mr-1" ref={ref}>
      <button onClick={() => { setOpen(o => !o); if (!open) refresh() }} className="relative p-2 rounded-lg hover:bg-gray-100"
        title="Notifications" aria-label={`Notifications${count ? ` (${count})` : ''}`} style={{ color: 'var(--charcoal)' }}>
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: urgent ? '#dc2626' : '#d97706' }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl shadow-lg border z-50"
          style={{ background: 'white', borderColor: 'var(--light-gray)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--light-gray)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>Notifications</p>
            <a href="/taxes?tab=compliance" className="text-[11px] font-medium" style={{ color: 'var(--teal)' }}>Compliance calendar</a>
          </div>
          {groups === null ? (
            <p className="px-4 py-6 text-xs flex items-center gap-2" style={{ color: 'var(--mid-gray)' }}><Loader2 size={13} className="animate-spin" /> Loading…</p>
          ) : count === 0 ? (
            <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--mid-gray)' }}>You&apos;re all caught up.</p>
          ) : groups.map(g => (
            <div key={g.key} className="py-2 border-b last:border-b-0" style={{ borderColor: 'var(--light-gray)' }}>
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--mid-gray)' }}>
                <g.icon size={13} /> {g.label}
              </p>
              {g.items.map(i => (
                <a key={i.key} href={i.href} onClick={() => setOpen(false)} className="flex items-start justify-between gap-3 px-4 py-2 hover:bg-gray-50">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{i.title}</span>
                    <span className="block text-[11px] truncate" style={{ color: 'var(--mid-gray)' }}>{i.detail}</span>
                  </span>
                  {i.daysUntil !== null && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                      style={i.daysUntil <= 0 ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#92400e' }}>
                      {dueText(i.daysUntil)}
                    </span>
                  )}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
