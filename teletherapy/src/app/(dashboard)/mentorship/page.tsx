'use client'

import { Sparkles } from 'lucide-react'

export default function MentorshipPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="hero-gradient rounded-2xl px-8 py-8 mb-8">
        <h1 className="text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Mentorship
        </h1>
        <p className="text-white/60 text-sm mt-1">Your active mentorships</p>
      </div>

      <div className="card-static text-center py-16">
        <div className="w-14 h-14 rounded-full bg-[var(--pale-teal)] flex items-center justify-center mx-auto mb-4">
          <Sparkles size={24} className="text-[var(--teal)]" />
        </div>
        <p className="font-semibold text-[var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          No active mentorship yet
        </p>
        <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto leading-relaxed">
          Only clinicians with an active mentorship will have content here. Once you have a mentee assigned,
          this section will show your mentorship details.
        </p>
      </div>
    </div>
  )
}
