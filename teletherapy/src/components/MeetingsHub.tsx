'use client'

// Meetings hub with sub-tabs: Meeting Schedule (upcoming/past), Set a Meeting
// (book someone with published availability), and — for supervisors / mentors —
// My Availability. Used by the Internship and Mentorship sections.

import { useState } from 'react'
import { Calendar, Video, Clock } from 'lucide-react'
import { Banner, PillTabs } from '@/components/hub/ui'
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
      {context === 'MENTORSHIP' && (
        <Banner tone="info">
          Each mentorship meeting is compensated to the mentor at the prevailing mentorship fee, deducted from the mentee&apos;s payroll.
        </Banner>
      )}

      <PillTabs
        label="Meetings"
        size="sm"
        value={sub}
        onChange={(id) => setSub(id as Sub)}
        tabs={tabs.map((t) => ({ id: t.k, label: <><t.icon size={13} aria-hidden /> {t.label}</> }))}
      />

      {sub === 'schedule' && <MeetingsPanel key={refreshKey} context={context} title="Meeting Schedule" />}
      {sub === 'book' && <SetMeeting context={context} canCreateLink={canSetAvailability} onBooked={() => { setRefreshKey((k) => k + 1); setSub('schedule') }} />}
      {sub === 'availability' && canSetAvailability && <AvailabilityEditor />}
    </div>
  )
}
