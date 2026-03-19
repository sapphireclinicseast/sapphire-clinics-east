'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Wallet,
  Package,
  ShoppingCart,
  BadgeDollarSign,
  ArrowLeftRight,
  BarChart3,
  Target,
  Users,
  Calculator,
  X,
} from 'lucide-react'

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  adminOnly?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'General Ledger',
    items: [
      { href: '/chart-of-accounts', icon: BookOpen, label: 'Chart of Accounts' },
      { href: '/bank-reconciliation', icon: ArrowLeftRight, label: 'Bank Reconciliation' },
    ],
  },
  {
    label: 'Transactions',
    items: [
      { href: '/petty-cash', icon: Wallet, label: 'Petty Cash' },
      { href: '/inventory', icon: Package, label: 'Inventory & Procurement' },
      { href: '/pos', icon: ShoppingCart, label: 'Point of Sale' },
      { href: '/payroll', icon: BadgeDollarSign, label: 'Payroll' },
    ],
  },
  {
    label: 'Planning & Analysis',
    items: [
      { href: '/budgets', icon: Target, label: 'Budgets' },
      { href: '/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/users', icon: Users, label: 'Users', adminOnly: true },
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
  const isAdmin = userRole === 'ADMIN'

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
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--teal)' }}
            >
              <Calculator size={20} className="text-white" />
            </div>
            <div>
              <h1
                className="text-sm font-bold text-white tracking-wide"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                SAPPHIRE
              </h1>
              <p className="text-[10px] text-white/50 uppercase tracking-widest">
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
              (item) => !item.adminOnly || isAdmin
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
