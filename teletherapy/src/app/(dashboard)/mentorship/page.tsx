'use client'

import MeetingsPanel from '@/components/MeetingsPanel'

export default function MentorshipPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Mentorship
        </h1>
        <p className="text-white/60 text-sm mt-1">Schedule and join your mentorship meetings</p>
      </div>

      <MeetingsPanel context="MENTORSHIP" title="Mentorship Meetings" />
    </div>
  )
}
