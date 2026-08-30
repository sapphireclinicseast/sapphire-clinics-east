'use client'

import { usePathname } from 'next/navigation'

const TABS: [string, string][] = [
  ['/clinic', 'Overview'],
  ['/clinic/people', 'Patients & therapists'],
  ['/clinic/settings', 'Business details'],
  ['/clinic/verify', 'Documents'],
]

export default function ClinicNav() {
  const path = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-[color:var(--line)] bg-white p-1">
      {TABS.map(([href, label]) => {
        const active = href === '/clinic' ? path === '/clinic' : path.startsWith(href)
        return <a key={href} href={href} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${active ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)] hover:bg-[color:var(--mist)]'}`}>{label}</a>
      })}
    </div>
  )
}
