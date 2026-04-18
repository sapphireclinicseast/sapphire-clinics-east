'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'

const SERVICES_SBEA = ['PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'ORTHOSIS'] as const
const SERVICES_SBGH = ['PT', 'OT', 'SLP', 'SPED', 'MD', 'PSYCHOLOGY', 'PSYCHIATRY', 'DEVELOPMENTAL_PEDIATRICIAN'] as const

const SERVICE_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
  SPED: 'SPED',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychology',
  PSYCHIATRY: 'Psychiatry',
  ORTHOSIS: 'Orthosis / Prosthesis',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
}

export default function BookStep1Page() {
  const router = useRouter()
  const [branch, setBranch] = useState<'SBEA' | 'SBGH'>('SBEA')
  const [service, setService] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) router.push('/')
  }, [router])

  const services = branch === 'SBEA' ? SERVICES_SBEA : SERVICES_SBGH

  function next() {
    if (!service) return
    const qs = new URLSearchParams({ branch, department: service }).toString()
    router.push(`/book/slots?${qs}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Pick a service</h1>
        <div className="text-xs text-slate-500">Step 1 of 3</div>
      </div>

      <section className="mb-6">
        <div className="text-sm font-medium text-slate-700 mb-2">Branch</div>
        <div className="flex gap-2">
          {(['SBEA', 'SBGH'] as const).map((b) => (
            <button
              key={b}
              onClick={() => { setBranch(b); setService(null) }}
              className={`px-4 py-2 rounded-full text-sm font-medium border ${branch === b ? 'bg-[color:var(--scei-teal)] text-white border-transparent' : 'bg-white'}`}
            >
              {b === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <div className="text-sm font-medium text-slate-700 mb-2">Service</div>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`px-3 py-2 rounded-lg text-sm border ${service === s ? 'bg-[color:var(--scei-orange)] text-white border-transparent' : 'bg-white'}`}
            >
              {SERVICE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </section>

      <button
        disabled={!service}
        onClick={next}
        className="bg-[color:var(--scei-teal)] text-white rounded-lg px-5 py-2 font-medium disabled:opacity-40"
      >Continue</button>
    </div>
  )
}
