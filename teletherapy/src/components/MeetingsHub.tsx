'use client'

// Meetings hub with sub-tabs: Meeting Schedule (upcoming/past), Set a Meeting
// (book someone with published availability), and — for supervisors / mentors —
// My Availability. Used by the Internship and Mentorship sections.

import { useState } from 'react'
import { Calendar, Video, Clock } from 'lucide-react'
import { Banner } from '@/components/hub/ui'
import MeetingsPanel from './MeetingsPanel'
import SetMeeting from './SetMeeting'
import AvailabilityEditor from './AvailabilityEditor'

type Sub = 'schedule' | 'book' | 'availability'

export default function MeetingsHub({
  context,
  canSetAvailability = false,
}: {
  context: 'INTERNSHIP' | 'MENTORSHIP'
  canSetAvailability?: boolean
}) {
  const [sub, setSub] = useState<Sub>('schedule')
  const [refreshKey, setRefreshKey] = useState(0)

  const tabs: { k: Sub; label: string; icon: typeof Calendar }[] = [
    { k: 'schedule', label: 'Meeting Schedule', icon: Calendar },
    { k: 'book', label: 'Set a Meeting', icon: Video },
    ...(canSetAvailability ? [{ k: 'availability' as Sub, label: 'My Availability', icon: Clock }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Sub-navigation as an underline bar (not a second pill row), so it
          reads as part of the Meetings tab instead of another stacked tab set. */}
      <div role="tablist" aria-label="Meetings" className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--light-gray)', fontFamily: 'var(--font-display)' }}>
        {tabs.map((t) => {
          const active = sub === t.k
          return (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSub(t.k)}
              className={`-mb-px inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--teal)] ${active ? '' : 'hover:text-[color:var(--charcoal)]'}`}
              style={active
                ? { borderColor: 'var(--teal)', color: 'var(--deep-teal)' }
                : { borderColor: 'transparent', color: 'var(--mid-gray)' }}
            >
              <t.icon size={14} aria-hidden /> {t.label}
            </button>
          )
        })}
      </div>

      {/* The fee note matters when booking, so it lives on Set a Meeting
          rather than above every schedule view. */}
      {sub === 'book' && context === 'MENTORSHIP' && (
        <Banner tone="info">
          Each mentorship meeting is compensated to the mentor at the prevailing mentorship fee, deducted from the mentee&apos;s payroll.
        </Banner>
      )}

      {sub === 'schedule' && <MeetingsPanel key={refreshKey} context={context} />}
      {sub === 'book' && <SetMeeting context={context} canCreateLink={canSetAvailability} onBooked={() => { setRefreshKey((k) => k + 1); setSub('schedule') }} />}
      {sub === 'availability' && canSetAvailability && <AvailabilityEditor />}
    </div>
  )
}
