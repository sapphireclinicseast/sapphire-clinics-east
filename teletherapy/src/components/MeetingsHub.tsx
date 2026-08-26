'use client'

// Meetings hub with sub-tabs: Meeting Schedule (upcoming/past), Set a Meeting
// (book someone with published availability), and — for supervisors / mentors —
// My Availability. Used by the Internship and Mentorship sections.

import { useState } from 'react'
import { Calendar, Video, Clock } from 'lucide-react'
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
      <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-[var(--off-white)] border border-[var(--light-gray)] w-fit">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setSub(t.k)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${sub === t.k ? 'bg-white text-[var(--teal)] shadow-sm' : 'text-[var(--mid-gray)] hover:text-[var(--charcoal)]'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {sub === 'schedule' && <MeetingsPanel key={refreshKey} context={context} canAddMeeting={canSetAvailability} title="Meeting Schedule" />}
      {sub === 'book' && <SetMeeting context={context} onBooked={() => { setRefreshKey((k) => k + 1); setSub('schedule') }} />}
      {sub === 'availability' && canSetAvailability && <AvailabilityEditor />}
    </div>
  )
}
