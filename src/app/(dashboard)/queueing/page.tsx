import { ListOrdered } from 'lucide-react'

export default function QueueingPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Clinic Tools
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Queueing
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Manage patient queues and waiting lists for clinic appointments.
        </p>
      </div>

      <div
        className="rounded-xl flex flex-col items-center justify-center py-20 gap-4"
        style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--pale-teal)' }}
        >
          <ListOrdered size={26} style={{ color: 'var(--teal)' }} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>
            Coming Soon
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>
            The Queueing Module is under development.
          </p>
        </div>
      </div>
    </div>
  )
}
