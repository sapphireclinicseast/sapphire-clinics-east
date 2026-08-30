'use client'

import { usePathname } from 'next/navigation'

const TABS: [string, string][] = [
  ['/admin/overview', 'Overview'],
  ['/admin/create', 'Create account'],
  ['/admin', 'Verification'],
  ['/admin/providers', 'Providers'],
  ['/admin/doctors', 'Doctors'],
  ['/admin/clinics', 'Clinics'],
  ['/admin/patients', 'Patients'],
  ['/admin/bookings', 'Bookings'],
  ['/admin/payouts', 'Payouts'],
]

export default function AdminNav() {
  const path = usePathname()
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-[color:var(--line)] bg-white p-1">
        {TABS.map(([href, label]) => {
          const active = href === '/admin' ? path === '/admin' : path.startsWith(href)
          return (
            <a key={href} href={href}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${active ? 'bg-[color:var(--steel)] text-white' : 'text-[color:var(--slate)] hover:bg-[color:var(--mist)]'}`}>
              {label}
            </a>
          )
        })}
      </div>
      <form action="/api/admin/logout" method="post">
        <button className="rounded-lg border border-[color:var(--line-2)] px-3 py-1.5 text-[13px] text-[color:var(--slate)] hover:bg-white">Log out</button>
      </form>
    </div>
  )
}
