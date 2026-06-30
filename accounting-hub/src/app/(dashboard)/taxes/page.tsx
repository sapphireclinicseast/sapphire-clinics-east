'use client'

import { useEffect, useMemo, useState } from 'react'
import { Landmark, ExternalLink, CalendarClock } from 'lucide-react'
import { computeTaxDue, TAX_PORTALS, type TaxDueInfo } from '@/lib/taxes'
import WithholdingCompensation from './WithholdingCompensation'
import ExpandedWithholding from './ExpandedWithholding'
import BusinessTax from './BusinessTax'
import TaxesRfp from './TaxesRfp'
import TaxesPaid from './TaxesPaid'

type Tab = 'guide' | 'compensation' | 'ewt' | 'business' | 'rfp' | 'paid'

const TABS: { key: Tab; label: string }[] = [
  { key: 'guide', label: 'Guide & Summary' },
  { key: 'compensation', label: 'Withholding on Compensation' },
  { key: 'ewt', label: 'Expanded Withholding (EWT)' },
  { key: 'business', label: 'Business Tax (VAT)' },
  { key: 'rfp', label: 'RFP' },
  { key: 'paid', label: 'Taxes Paid' },
]

const dueBadge = (d: number) =>
  d < 0 ? { background: '#fee2e2', color: '#b91c1c', text: `${-d} day${d === -1 ? '' : 's'} overdue` }
    : d <= 5 ? { background: '#fee2e2', color: '#b91c1c', text: d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${d} days` }
    : d <= 15 ? { background: '#fef3c7', color: '#92400e', text: `Due in ${d} days` }
    : { background: '#dcfce7', color: '#166534', text: `Due in ${d} days` }

export default function TaxesPage() {
  const [tab, setTab] = useState<Tab>('guide')
  const [due, setDue] = useState<TaxDueInfo[] | null>(null)

  // Deadlines depend on "today" → compute client-side to avoid hydration drift.
  useEffect(() => { setDue(computeTaxDue(new Date())) }, [])

  const soon = useMemo(() => (due || []).filter(d => d.daysUntil <= 5), [due])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          <Landmark size={22} style={{ color: 'var(--teal)' }} /> Taxes
        </h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex rounded-xl overflow-hidden border flex-wrap w-fit" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 text-xs font-semibold transition-colors"
            style={tab === t.key ? { background: 'var(--deep-teal)', color: '#fff' } : { background: '#fff', color: 'var(--mid-gray)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <div className="space-y-4">
          {/* Deadlines-soon banner */}
          {soon.length > 0 && (
            <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
              <CalendarClock size={18} style={{ color: '#b91c1c', marginTop: 2 }} />
              <div>
                <p className="text-sm font-bold" style={{ color: '#b91c1c' }}>
                  {soon.length} tax deadline{soon.length === 1 ? '' : 's'} within 5 days
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#7f1d1d' }}>
                  {soon.map(s => `${s.name.split(' ')[0]} (${s.nextDue})`).join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Tax summary table */}
          <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--off-white)' }}>
                  {['Tax', 'BIR Forms', 'Frequency', 'Deadline rule', 'Next deadline', 'Links'].map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap align-bottom" style={{ color: 'var(--charcoal)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(due || []).map(d => {
                  const b = dueBadge(d.daysUntil)
                  return (
                    <tr key={d.key} className="border-t align-top" style={{ borderColor: 'var(--light-gray)' }}>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--charcoal)', maxWidth: 220 }}>{d.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)', maxWidth: 180 }}>{d.forms}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{d.frequency}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)', minWidth: 320 }}>{d.deadlineRule}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: b.background, color: b.color }}>{b.text}</span>
                        <div className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--charcoal)' }}>{d.nextDue}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {d.links.map(l => (
                            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--teal)' }}>
                              <ExternalLink size={12} /> {l.label}
                            </a>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!due && (
                  <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BIR portals */}
          <div className="rounded-2xl border bg-white p-4" style={{ borderColor: 'var(--light-gray)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--mid-gray)' }}>BIR portals</p>
            <div className="flex flex-wrap gap-2">
              {TAX_PORTALS.map(p => (
                <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
                  <ExternalLink size={13} /> {p.label}
                </a>
              ))}
            </div>
          </div>

          <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
            Deadlines reflect manual / eBIRForms filing. eFPS filers may have staggered due dates by industry grouping. Always confirm against the BIR Tax Calendar. A reminder pop-up appears for accountants, bookkeepers, and the main admin when a deadline is within 5 days.
          </p>
        </div>
      )}

      {tab === 'compensation' && <WithholdingCompensation />}
      {tab === 'ewt' && <ExpandedWithholding />}
      {tab === 'business' && <BusinessTax />}
      {tab === 'rfp' && <TaxesRfp />}
      {tab === 'paid' && <TaxesPaid />}
    </div>
  )
}
