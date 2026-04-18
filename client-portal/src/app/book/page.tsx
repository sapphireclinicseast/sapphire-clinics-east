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
  SPED: 'Special Education',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychology',
  PSYCHIATRY: 'Psychiatry',
  ORTHOSIS: 'Orthosis / Prosthesis',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
}
const SERVICE_EMOJI: Record<string, string> = {
  PT: '🧘', OT: '✋', SLP: '💬', SPED: '📚', MD: '🩺',
  PSYCHOLOGY: '🧠', PSYCHIATRY: '💊', ORTHOSIS: '🦾', DEVELOPMENTAL_PEDIATRICIAN: '👶',
}

export default function BookStep1Page() {
  const router = useRouter()
  const [branch, setBranch] = useState<'SBEA' | 'SBGH'>('SBEA')
  const [service, setService] = useState<string | null>(null)

  useEffect(() => { if (!getSession()) router.push('/') }, [router])

  const services = branch === 'SBEA' ? SERVICES_SBEA : SERVICES_SBGH

  function next() {
    if (!service) return
    const qs = new URLSearchParams({ branch, department: service }).toString()
    router.push(`/book/slots?${qs}`)
  }

  return (
    <div className="animate-fade-up">
      <StepHeader active={1} />

      <div className="card-static">
        <h1 className="text-[28px] text-[color:var(--deep-teal)] leading-tight">Pick a service</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-7">Start by choosing a branch and the service you need.</p>

        <div className="mb-7">
          <div className="label">Branch</div>
          <div className="flex gap-2 flex-wrap">
            {(['SBEA', 'SBGH'] as const).map((b) => (
              <button
                key={b}
                onClick={() => { setBranch(b); setService(null) }}
                className={`pill ${branch === b ? 'pill-active' : ''}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
                {b === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Service</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {services.map((s, i) => (
              <button
                key={s}
                onClick={() => setService(s)}
                className={`text-left group rounded-2xl border-[1.5px] p-3.5 transition-all animate-fade-up stagger-${Math.min(i+1, 7)} ${
                  service === s
                    ? 'bg-gradient-to-br from-[color:var(--gold)] to-[color:var(--gold-light)] border-transparent text-white shadow-[0_8px_20px_rgba(237,104,35,0.25)]'
                    : 'bg-white border-[color:var(--light-gray)] hover:border-[color:var(--bright-teal)] hover:shadow-[0_4px_14px_rgba(46,94,90,0.08)]'
                }`}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <div className="text-2xl mb-1.5 leading-none">{SERVICE_EMOJI[s] ?? '✨'}</div>
                <div className={`text-[13.5px] font-semibold leading-tight ${service === s ? '' : 'text-[color:var(--deep-teal)]'}`}>
                  {SERVICE_LABELS[s] ?? s}
                </div>
                <div className={`text-[11px] mt-0.5 opacity-70`}>{s}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <button disabled={!service} onClick={next} className="btn-cta">
            Continue → Pick a slot
          </button>
        </div>
      </div>
    </div>
  )
}

function StepHeader({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['Service', 'Slot', 'Confirm']
  return (
    <div className="flex items-center gap-3 mb-6" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${state === 'active' ? 'step-dot-active' : state === 'done' ? 'step-dot-done' : ''}`}></span>
              <span className={`text-[11.5px] uppercase tracking-[0.12em] ${state === 'active' ? 'text-[color:var(--gold)] font-semibold' : state === 'done' ? 'text-[color:var(--teal)]' : 'text-[color:var(--mid-gray)]'}`}>
                {n}. {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-[color:var(--light-gray)]"></span>}
          </div>
        )
      })}
    </div>
  )
}
