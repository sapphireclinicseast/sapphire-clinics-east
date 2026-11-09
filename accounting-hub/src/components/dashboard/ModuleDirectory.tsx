'use client'

// Dashboard module directory: every module the signed-in role can open (the same
// role rule as the sidebar, read from its NAV_SECTIONS), grouped by job, with a
// one-line description and a search box. HR Hub "Shortcuts" card style.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { NAV_SECTIONS, type NavItem } from '@/components/layout/Sidebar'

const GROUPS: { label: string; hrefs: string[] }[] = [
  { label: 'Books & bank', hrefs: ['/chart-of-accounts', '/subsidiary-ledger', '/journal-entries', '/bank-reconciliation', '/fund-transfer'] },
  { label: 'Spending', hrefs: ['/petty-cash', '/expenses', '/suppliers', '/accounts-payable', '/cash-advances', '/refunds'] },
  { label: 'Sales & billing', hrefs: ['/pos', '/services', '/quotations', '/paymongo', '/accounts-receivable', '/unearned-revenue', '/referral'] },
  { label: 'Stock & assets', hrefs: ['/inventory', '/asset-management'] },
  { label: 'People & tax', hrefs: ['/payroll', '/benefits-payable', '/taxes'] },
  { label: 'Equity & financing', hrefs: ['/equity', '/loans-and-advances', '/scholars'] },
  { label: 'Reports & analysis', hrefs: ['/reports', '/budgets', '/sales-summary', '/sales-analysis', '/products-analysis', '/investor-subsidiary-ledger', '/mentorship-audit'] },
  { label: 'Records & admin', hrefs: ['/official-documents', '/users', '/handbook'] },
]

const DESCRIPTIONS: Record<string, string> = {
  '/chart-of-accounts': 'Accounts, types and balances',
  '/subsidiary-ledger': 'Every posted line, by account',
  '/journal-entries': 'Catch-all journal entries',
  '/bank-reconciliation': 'Match bank lines to the books',
  '/fund-transfer': 'Transfers, forex and checks',
  '/petty-cash': 'PCF entries, liquidation and replenishment',
  '/expenses': 'One-time and recurring expenses, RFPs',
  '/suppliers': 'Registered names, TINs and addresses',
  '/accounts-payable': 'Bills owed to suppliers',
  '/cash-advances': 'Event floats, liquidations and returns',
  '/refunds': 'Refunds of prepaid patient balances',
  '/pos': 'Orders, sales and payments',
  '/services': 'Services, prices and PF rules',
  '/quotations': 'Quotes from services and products',
  '/paymongo': 'Online payment links and settlements',
  '/accounts-receivable': 'HMO and other receivables, SOAs',
  '/unearned-revenue': 'Prepaid sessions not yet delivered',
  '/referral': 'Referrers, referred patients and commissions',
  '/inventory': 'Stock, purchase orders and forms',
  '/asset-management': 'Equipment, custody and depreciation',
  '/payroll': 'Cutoffs, payslips and consultant fees',
  '/benefits-payable': 'SSS, PhilHealth and Pag-IBIG remittances',
  '/taxes': 'BIR forms and the tax position',
  '/equity': 'Shares, holders and capitalization',
  '/loans-and-advances': 'Loans and their repayments',
  '/scholars': 'Scholarship fund and scholars',
  '/reports': 'Income statement, balance sheet and more',
  '/budgets': 'Budget versus actual',
  '/sales-summary': 'Sales reports by branch',
  '/sales-analysis': 'Sales by branch, department and method',
  '/products-analysis': 'Physical product sales and movement',
  '/investor-subsidiary-ledger': 'Ledger view for investors',
  '/mentorship-audit': 'Mentorship billing audit',
  '/official-documents': 'Company records and expiry dates',
  '/users': 'User accounts and role access',
  '/handbook': 'How to use the hub',
}

export default function ModuleDirectory({ role }: { role: string }) {
  const [q, setQ] = useState('')

  // Same visibility rule as the sidebar; the Dashboard itself is left out.
  const visible = useMemo(() => {
    const m = new Map<string, NavItem>()
    for (const s of NAV_SECTIONS) for (const it of s.items) {
      if (it.href === '/dashboard') continue
      if (!it.roles || it.roles.includes(role)) m.set(it.href, it)
    }
    return m
  }, [role])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (it: NavItem) => !needle
      || it.label.toLowerCase().includes(needle)
      || (DESCRIPTIONS[it.href] || '').toLowerCase().includes(needle)
    const placed = new Set<string>()
    const out = GROUPS.map(g => {
      const items = g.hrefs.map(h => visible.get(h)).filter((it): it is NavItem => !!it)
      items.forEach(it => placed.add(it.href))
      return { label: g.label, items: items.filter(match) }
    })
    // Anything new in the sidebar that has no group yet still shows up.
    const rest = [...visible.values()].filter(it => !placed.has(it.href))
    if (rest.length) out.push({ label: 'More', items: rest.filter(match) })
    return out.filter(g => g.items.length > 0)
  }, [visible, q])

  const total = visible.size
  const shown = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <section aria-labelledby="dash-modules-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="dash-modules-title" className="text-xs font-bold uppercase tracking-[.5px]" style={{ color: 'var(--mid-gray)', fontFamily: 'var(--font-display)' }}>
          Modules <span className="font-semibold normal-case tracking-normal">· {q ? `${shown} of ${total}` : total}</span>
        </h2>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--hr-faint)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a module…" aria-label="Find a module"
            className="w-full h-9 pl-8 pr-8 rounded-lg border text-[13px] bg-white focus:outline-none focus:border-[var(--teal)]" style={{ borderColor: 'var(--light-gray)' }} />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--pale-teal)]"><X size={14} style={{ color: 'var(--mid-gray)' }} /></button>}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="rounded-lg border bg-white py-10 text-center text-[13px]" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          No module matches “{q}”.
        </div>
      )}

      {groups.map(g => (
        <div key={g.label}>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.5px]" style={{ color: 'var(--hr-faint)', fontFamily: 'var(--font-display)' }}>{g.label}</h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {g.items.map(it => {
              const Icon = it.icon
              return (
                <Link key={it.href} href={it.href}
                  className="group flex items-center gap-3 min-w-0 rounded-lg border bg-white px-3.5 py-3 transition-[box-shadow,border-color] hover:border-[#BFD8CB] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ borderColor: 'var(--light-gray)', outlineColor: 'var(--teal)' }}>
                  <span className="flex-none w-9 h-9 rounded-[9px] flex items-center justify-center" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                    <Icon size={18} />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[13.5px] font-bold truncate group-hover:text-[var(--teal)]" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{it.label}</span>
                    {DESCRIPTIONS[it.href] && <span className="text-xs leading-snug line-clamp-2" style={{ color: 'var(--mid-gray)' }}>{DESCRIPTIONS[it.href]}</span>}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
