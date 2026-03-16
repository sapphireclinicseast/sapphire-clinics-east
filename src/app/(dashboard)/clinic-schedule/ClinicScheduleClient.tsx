'use client'

import { useState } from 'react'
import { CalendarDays, LayoutGrid, Clock, Activity } from 'lucide-react'
import DepartmentView from './DepartmentView'
import DailyView from './DailyView'
import CalendarView from './CalendarView'
import StatusView from './StatusView'

const TABS = [
  { id: 'department', label: 'Department View', icon: LayoutGrid },
  { id: 'calendar',   label: 'Calendar View',   icon: CalendarDays },
  { id: 'daily',      label: 'Daily View',       icon: Clock },
  { id: 'status',     label: 'Status View',      icon: Activity },
] as const

type TabId = typeof TABS[number]['id']

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="rounded-xl flex flex-col items-center justify-center py-24 gap-4"
      style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--pale-teal)' }}>
        <CalendarDays size={22} style={{ color: 'var(--teal)' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Coming Soon</p>
        <p className="text-xs mt-1" style={{ color: 'var(--mid-gray)' }}>{label} is under development.</p>
      </div>
    </div>
  )
}

export default function ClinicScheduleClient({ role }: { role: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('department')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Clinic Tools
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Clinic Schedule
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Manage appointments and therapist schedules.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === id ? 'var(--teal)' : 'var(--mid-gray)',
              borderBottom: activeTab === id ? '2px solid var(--teal)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'department' && <DepartmentView role={role} />}
      {activeTab === 'calendar'   && <CalendarView role={role} />}
      {activeTab === 'daily'      && <DailyView role={role} />}
      {activeTab === 'status'     && <StatusView role={role} />}
    </div>
  )
}
