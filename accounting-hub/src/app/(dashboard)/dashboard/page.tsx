import Link from 'next/link'
import {
  BookOpen,
  Wallet,
  Package,
  ShoppingCart,
  BadgeDollarSign,
  ArrowLeftRight,
  BarChart3,
  Target,
  Users,
  Stethoscope,
} from 'lucide-react'
import { auth } from '@/lib/auth'
import PendingQueueWidget from '@/components/dashboard/PendingQueueWidget'

const FRONT_DESK_ROLES = ['SBEA_FRONTDESK', 'SBGH_FRONTDESK']

const ALL_MODULES = [
  {
    href: '/chart-of-accounts',
    icon: BookOpen,
    title: 'Chart of Accounts',
    description: 'Manage account categories, types, and balances',
    status: 'coming-soon' as const,
  },
  {
    href: '/petty-cash',
    icon: Wallet,
    title: 'Petty Cash Recording',
    description: 'Track and record petty cash transactions',
    status: 'coming-soon' as const,
  },
  {
    href: '/inventory',
    icon: Package,
    title: 'Inventory & Procurement',
    description: 'Manage stock levels and purchase orders',
    status: 'coming-soon' as const,
  },
  {
    href: '/pos',
    icon: ShoppingCart,
    title: 'Point of Sale',
    description: 'Process sales transactions',
    status: 'active' as const,
    frontDesk: true,
  },
  {
    href: '/payroll',
    icon: BadgeDollarSign,
    title: 'Payroll',
    description: 'Employee salary management and processing',
    status: 'coming-soon' as const,
  },
  {
    href: '/bank-reconciliation',
    icon: ArrowLeftRight,
    title: 'Bank Reconciliation',
    description: 'Match bank statements with accounting records',
    status: 'coming-soon' as const,
  },
  {
    href: '/reports',
    icon: BarChart3,
    title: 'Reports',
    description: 'Financial reports and analytics',
    status: 'coming-soon' as const,
  },
  {
    href: '/budgets',
    icon: Target,
    title: 'Budgets',
    description: 'Budget planning, allocation, and tracking',
    status: 'coming-soon' as const,
  },
  {
    href: '/services',
    icon: Stethoscope,
    title: 'Services',
    description: 'View and manage clinic services',
    status: 'active' as const,
    frontDesk: true,
  },
  {
    href: '/users',
    icon: Users,
    title: 'Users',
    description: 'User management and role-based access control',
    status: 'active' as const,
    adminOnly: true,
  },
]

export default async function DashboardPage() {
  const session = await auth()
  const role = session?.user?.role || ''
  const isAdmin = role === 'ADMIN'
  const isFrontDesk = FRONT_DESK_ROLES.includes(role)

  // Front desk users only see Services + POS (active, clickable)
  const visibleModules = isFrontDesk
    ? ALL_MODULES.filter((m) => m.frontDesk)
    : ALL_MODULES.filter((m) => !m.adminOnly || isAdmin)

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
        >
          Welcome back, {session?.user?.name?.split(' ')[0]}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          SAPPHIRE Accounting Hub — Module Overview
        </p>
      </div>

      {/* Pending Queue Widget — shown to front desk users */}
      {isFrontDesk && (
        <div className="mb-6">
          <PendingQueueWidget branch={session?.user?.branch} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleModules.map((mod) => {
          const Icon = mod.icon
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="group rounded-2xl border p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              style={{
                background: 'white',
                borderColor: 'var(--light-gray)',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: 'var(--pale-teal)' }}
                >
                  <Icon
                    size={24}
                    style={{ color: 'var(--teal)' }}
                    className="transition-colors"
                  />
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                  style={
                    mod.status === 'active'
                      ? { background: '#dcfce7', color: '#166534' }
                      : { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
                  }
                >
                  {mod.status === 'active' ? 'Active' : 'Coming Soon'}
                </span>
              </div>

              <h3
                className="font-semibold text-base mb-1"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
              >
                {mod.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                {mod.description}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
