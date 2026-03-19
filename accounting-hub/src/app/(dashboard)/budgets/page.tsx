import { Target } from 'lucide-react'

export default function BudgetsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'var(--pale-teal)' }}
      >
        <Target size={36} style={{ color: 'var(--teal)' }} />
      </div>
      <h1
        className="text-2xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
      >
        Budgets
      </h1>
      <p className="text-sm max-w-md mb-6" style={{ color: 'var(--mid-gray)' }}>
        Plan, allocate, and track budgets across departments and branches. Monitor spending vs. targets.
      </p>
      <span
        className="px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider"
        style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
      >
        Coming Soon
      </span>
    </div>
  )
}
