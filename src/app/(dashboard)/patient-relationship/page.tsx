import { HeartHandshake } from 'lucide-react'

export default function PatientRelationshipPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Clinic Tools
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Patient Relationship
        </h1>
      </div>

      <div
        className="rounded-xl p-12 flex flex-col items-center text-center"
        style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'var(--pale-teal)' }}
        >
          <HeartHandshake size={32} style={{ color: 'var(--teal)' }} />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Patient Relationship Module
        </h2>
        <p className="text-sm mb-1" style={{ color: 'var(--mid-gray)', maxWidth: 420 }}>
          This module is under development. Content and features will be available soon.
        </p>
        <p className="text-xs" style={{ color: 'var(--light-gray-text, #bbb)' }}>
          For questions, contact your system administrator.
        </p>
      </div>
    </div>
  )
}
