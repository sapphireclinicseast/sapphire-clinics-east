'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Wallet,
  Shield,
  Undo2,
  HandCoins,
  Package,
  ShoppingCart,
  BadgeDollarSign,
  ArrowLeftRight,
  BarChart3,
  Target,
  Users,
  Stethoscope,
  FileSignature,
  FileCheck,
  Receipt,
  CreditCard,
  Building2,
  PackageSearch,
  TrendingUp,
  Landmark,
  PieChart,
  GraduationCap,
  Repeat,
  ScrollText,
  X,
  FileText,
  PiggyBank,
  FolderLock,
  Truck,
 AlertTriangle } from 'lucide-react'

// Roles that see all accounting modules (excludes front desk and HMO Officer).
// Bookkeeper now has the same visibility as Accountant (everything except Analysis).
const FULL_ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Referral section: everyone EXCEPT the HMO Officer.
const REFERRAL_ACCESS = [...FULL_ACCESS, 'PAYROLL_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']
const ENTRY_ACCESS = FULL_ACCESS
// Inventory: full access for accounting; front desk + MedRep get a Forms-only
// slice (the page itself collapses to the Forms tab for them).
const INVENTORY_ACCESS = [...FULL_ACCESS, 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']
// Roles that see Services + POS (front desk + full access + Payroll Officer)
const SERVICES_POS_ACCESS = [...FULL_ACCESS, 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const SERVICES_POS_PAYROLL = [...SERVICES_POS_ACCESS, 'PAYROLL_OFFICER']
// Roles that see the Dashboard overview
const DASHBOARD_ACCESS = SERVICES_POS_ACCESS
// Roles that can view Accounts Receivable. Branch front desk get a read-only
// slice of it — HMO only, Per HMO and SOA Report sub-tabs (see the page).
const AR_ACCESS = [...FULL_ACCESS, 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
// Roles that can view Chart of Accounts (full access only — HMO Officer gets it via COA_WITH_HMO)
const COA_ACCESS = [...FULL_ACCESS, 'HMO_OFFICER']
// Taxes module: main admin, accountant, bookkeeper.
const TAX_ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
// Equity: main admin (full) + accountant/bookkeeper (Preferred Shares tab only, view-only).
const EQUITY_ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const LOANS_ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
// Payroll: full access + the dedicated Payroll Officer.
const PAYROLL_ACCESS = [...FULL_ACCESS, 'PAYROLL_OFFICER']
// Products & Sales Analysis: main admin + branch admins + viewer (NOT accountant/bookkeeper).
const ANALYSIS_ACCESS = ['ADMIN', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  roles?: string[] // If set, only these roles see this item. If unset, visible to all.
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: DASHBOARD_ACCESS },
    ],
  },
  {
    label: 'General Ledger',
    items: [
      { href: '/chart-of-accounts', icon: BookOpen, label: 'Chart of Accounts', roles: COA_ACCESS },
      { href: '/subsidiary-ledger', icon: ScrollText, label: 'Subsidiary Ledger', roles: FULL_ACCESS },
      { href: '/bank-reconciliation', icon: ArrowLeftRight, label: 'Bank Reconciliation', roles: FULL_ACCESS },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { href: '/petty-cash', icon: Wallet, label: 'Petty Cash', roles: ENTRY_ACCESS },
      { href: '/expenses', icon: CreditCard, label: 'Expenses', roles: ENTRY_ACCESS },
      { href: '/suppliers', icon: Truck, label: 'Suppliers', roles: ENTRY_ACCESS },
      { href: '/refunds', icon: Undo2, label: 'Refunds', roles: ENTRY_ACCESS },
      { href: '/cash-advances', icon: HandCoins, label: 'Cash Advances', roles: TAX_ACCESS },
      { href: '/inventory', icon: Package, label: 'Inventory & Procurement', roles: INVENTORY_ACCESS },
      { href: '/asset-management', icon: Building2, label: 'Asset Management', roles: SERVICES_POS_ACCESS },
      { href: '/services', icon: Stethoscope, label: 'Services', roles: SERVICES_POS_PAYROLL },
      { href: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: SERVICES_POS_PAYROLL },
      { href: '/quotations', icon: FileSignature, label: 'Quotations', roles: SERVICES_POS_ACCESS },
      { href: '/paymongo', icon: CreditCard, label: 'PayMongo', roles: SERVICES_POS_ACCESS },
      { href: '/referral', icon: Users, label: 'Referral', roles: REFERRAL_ACCESS },
      { href: '/accounts-receivable', icon: FileCheck, label: 'Accounts Receivable', roles: AR_ACCESS },
      { href: '/accounts-payable', icon: FileText, label: 'Accounts Payable', roles: TAX_ACCESS },
      { href: '/journal-entries', icon: BookOpen, label: 'General Journal', roles: TAX_ACCESS },
      { href: '/unearned-revenue', icon: PiggyBank, label: 'Unearned Revenue', roles: TAX_ACCESS },
      { href: '/payroll', icon: BadgeDollarSign, label: 'Payroll', roles: PAYROLL_ACCESS },
      { href: '/benefits-payable', icon: Shield, label: 'Benefits Payable', roles: PAYROLL_ACCESS },
      { href: '/taxes', icon: Landmark, label: 'Taxes', roles: TAX_ACCESS },
      { href: '/fund-transfer', icon: Repeat, label: 'Fund Transfer', roles: TAX_ACCESS },
      { href: '/equity', icon: PieChart, label: 'Equity', roles: EQUITY_ACCESS },
      { href: '/loans-and-advances', icon: Landmark, label: 'Loans & Advances', roles: LOANS_ACCESS },
      { href: '/scholars', icon: GraduationCap, label: 'Scholars', roles: EQUITY_ACCESS },
    ],
  },
  {
    label: 'Planning & Analysis',
    items: [
      { href: '/budgets', icon: Target, label: 'Budgets', roles: FULL_ACCESS },
      { href: '/reports', icon: BarChart3, label: 'Reports', roles: [...FULL_ACCESS, 'MEDREP', 'PAYROLL_OFFICER', 'INVESTOR'] },
      { href: '/sales-summary', icon: Receipt, label: 'Sales Summary', roles: SERVICES_POS_ACCESS },
      // Catches mentorship sessions paid for without the "Mentorship" service.
      // The cashier prompt is advisory by design, so this is where a miss surfaces.
      { href: '/mentorship-audit', icon: AlertTriangle, label: 'Mentorship Audit', roles: SERVICES_POS_ACCESS },
      { href: '/products-analysis', icon: PackageSearch, label: 'Products Analysis', roles: [...ANALYSIS_ACCESS, 'ACCOUNTANT', 'BOOKKEEPER'] },
      { href: '/sales-analysis', icon: TrendingUp, label: 'Sales Analysis', roles: ANALYSIS_ACCESS },
    ],
  },
  {
    // Business, SEC, BIR and benefit-agency papers (permits, registrations, filings).
    label: 'Company Records',
    items: [
      { href: '/official-documents', icon: FolderLock, label: 'Official Documents', roles: [...FULL_ACCESS, 'PAYROLL_OFFICER', 'HMO_OFFICER'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/users', icon: Users, label: 'Users', roles: ['ADMIN'] },
      { href: '/handbook', icon: BookOpen, label: 'Handbook' }, // visible to every signed-in role
    ],
  },
]

interface SidebarProps {
  userRole?: string
  open: boolean
  onClose: () => void
  /** Desktop collapse — slides the rail off-canvas so the work area gets the full width. */
  collapsed?: boolean
}

export default function Sidebar({ userRole, open, onClose, collapsed = false }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 flex flex-col
          transition-[transform,margin] duration-300 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'lg:-ml-64' : 'lg:ml-0'}
        `}
        // Shared SCEI sidebar: the Class Portal's dark teal with mint accents.
        style={{ background: '#17323A' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            {/* SCEI mark in a white tile — same header as every staff-facing portal */}
            <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/scei-mark.png" alt="SCEI" className="w-7 h-7 object-contain" />
            </span>
            <div>
              <h1
                className="text-white"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}
              >
                SCEI
              </h1>
              <p className="uppercase" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.6rem', letterSpacing: '0.2em', color: '#CBDAB5' }}>
                Accounting Portal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-white/50 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.roles || item.roles.includes(userRole || '')
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label}>
                <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body)' }}>
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const active = pathname === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`
                          flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                          transition-colors duration-150
                          ${active
                            ? 'text-white'
                            : 'text-white/75 hover:text-white hover:bg-white/[0.06]'
                          }
                        `}
                        style={active ? { background: 'rgba(125,162,146,0.22)', fontFamily: 'var(--font-body)' } : { fontFamily: 'var(--font-body)' }}
                      >
                        <Icon size={16} style={active ? { color: '#CBDAB5' } : undefined} />
                        <span>{item.label}</span>
                        {active && (
                          <svg className="ml-auto shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#CBDAB5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/[0.08]">
          <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}>
            <span style={{ color: '#CBDAB5', fontWeight: 600 }}>SCEI</span> · Accounting Portal
          </p>
        </div>
      </aside>
    </>
  )
}
