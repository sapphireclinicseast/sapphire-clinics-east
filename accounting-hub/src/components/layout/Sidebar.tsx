'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Wallet,
  HandCoins,
  Package,
  ShoppingCart,
  BadgeDollarSign,
  ArrowLeftRight,
  BarChart3,
  Target,
  Users,
  Stethoscope,
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
  X,
} from 'lucide-react'

// Roles that see all accounting modules (excludes front desk and HMO Officer).
// Bookkeeper now has the same visibility as Accountant (everything except Analysis).
const FULL_ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Referral section: everyone EXCEPT the HMO Officer.
const REFERRAL_ACCESS = [...FULL_ACCESS, 'PAYROLL_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']
const ENTRY_ACCESS = FULL_ACCESS
// Roles that see Services + POS (front desk + full access + Payroll Officer)
const SERVICES_POS_ACCESS = [...FULL_ACCESS, 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const SERVICES_POS_PAYROLL = [...SERVICES_POS_ACCESS, 'PAYROLL_OFFICER']
// Roles that see the Dashboard overview
const DASHBOARD_ACCESS = SERVICES_POS_ACCESS
// Roles that can view Accounts Receivable
const AR_ACCESS = [...FULL_ACCESS, 'HMO_OFFICER']
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

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  roles?: string[] // If set, only these roles see this item. If unset, visible to all.
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
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
      { href: '/beginning-balances', icon: BookOpen, label: 'Beginning Balances', roles: FULL_ACCESS },
      { href: '/bank-reconciliation', icon: ArrowLeftRight, label: 'Bank Reconciliation', roles: FULL_ACCESS },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { href: '/petty-cash', icon: Wallet, label: 'Petty Cash', roles: ENTRY_ACCESS },
      { href: '/expenses', icon: CreditCard, label: 'Expenses', roles: ENTRY_ACCESS },
      { href: '/cash-advances', icon: HandCoins, label: 'Cash Advances', roles: TAX_ACCESS },
      { href: '/inventory', icon: Package, label: 'Inventory & Procurement', roles: FULL_ACCESS },
      { href: '/asset-management', icon: Building2, label: 'Asset Management', roles: SERVICES_POS_ACCESS },
      { href: '/services', icon: Stethoscope, label: 'Services', roles: SERVICES_POS_PAYROLL },
      { href: '/pos', icon: ShoppingCart, label: 'Point of Sale', roles: SERVICES_POS_PAYROLL },
      { href: '/paymongo', icon: CreditCard, label: 'PayMongo', roles: SERVICES_POS_ACCESS },
      { href: '/referral', icon: Users, label: 'Referral', roles: REFERRAL_ACCESS },
      { href: '/accounts-receivable', icon: FileCheck, label: 'Accounts Receivable', roles: AR_ACCESS },
      { href: '/payroll', icon: BadgeDollarSign, label: 'Payroll', roles: PAYROLL_ACCESS },
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
      { href: '/reports', icon: BarChart3, label: 'Reports', roles: [...FULL_ACCESS, 'MEDREP'] },
      { href: '/sales-summary', icon: Receipt, label: 'Sales Summary', roles: FULL_ACCESS },
      { href: '/products-analysis', icon: PackageSearch, label: 'Products Analysis', roles: ANALYSIS_ACCESS },
      { href: '/sales-analysis', icon: TrendingUp, label: 'Sales Analysis', roles: ANALYSIS_ACCESS },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/users', icon: Users, label: 'Users', roles: ['ADMIN'] },
    ],
  },
]

interface SidebarProps {
  userRole?: string
  open: boolean
  onClose: () => void
}

export default function Sidebar({ userRole, open, onClose }: SidebarProps) {
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
          transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--charcoal)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            {/* Aura Health Rehab arch logomark */}
            <svg width="46" height="25" viewBox="0 0 220 116" role="img" aria-label="Aura Health Rehab" className="shrink-0">
              <path d="M10,110 A100,100 0 0 1 210,110 L188,110 A78,78 0 0 0 32,110 Z" fill="#296354"/>
              <path d="M32,110 A78,78 0 0 1 188,110 L182,110 A72,72 0 0 0 38,110 Z" fill="#ffffff"/>
              <path d="M38,110 A72,72 0 0 1 182,110 L160,110 A50,50 0 0 0 60,110 Z" fill="#8EAF74"/>
              <path d="M60,110 A50,50 0 0 1 160,110 L154,110 A44,44 0 0 0 66,110 Z" fill="#ffffff"/>
              <path d="M66,110 A44,44 0 0 1 154,110 L132,110 A22,22 0 0 0 88,110 Z" fill="#6E8E8E"/>
              <path d="M88,110 A22,22 0 0 1 132,110 Z" fill="#ffffff"/>
            </svg>
            <div>
              <h1
                className="text-sm text-white tracking-wider"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, letterSpacing: '0.12em' }}
              >
                SAPPHIRE
              </h1>
              <p className="text-[10px] text-white/50 uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}>
                Accounting Hub
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
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
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
                          flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                          transition-colors duration-150
                          ${active
                            ? 'text-white font-medium'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                          }
                        `}
                        style={active ? { background: 'var(--teal)' } : undefined}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-[10px] text-white/30 text-center">
            Sapphire Clinics East Inc.
          </p>
        </div>
      </aside>
    </>
  )
}
