import { ArrowLeftRight } from 'lucide-react'

export default function BankReconciliationPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: 'var(--pale-teal)' }}
      >
        <ArrowLeftRight size={36} style={{ color: 'var(--teal)' }} />
      </div>
      <h1
        className="text-2xl font-bold mb-2"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
      >
        Bank Reconciliation
      </h1>
      <p className="text-sm max-w-md mb-6" style={{ color: 'var(--mid-gray)' }}>
        Match bank statements with accounting records to ensure accuracy and identify discrepancies.
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
