'use client'

// Customer Satisfaction Survey — its own page under INVESTOR VIEW.
//
// Previously this was a section buried near the bottom of the Patient
// Dashboard, below the interdepartmental co-occurrence block; investors
// couldn't find it. Route is deliberately /customer-satisfaction, NOT
// /customer-survey/* — the investor route gate in (dashboard)/layout.tsx
// matches on path PREFIX, so nesting this under the admin Customer Survey
// module's path would have handed investors that whole module.
//
// Therapist names arrive pre-masked to initials from the API for INVESTOR
// sessions; see SurveySection and /api/patients/dashboard-survey.

import { useState } from 'react'
import SurveySection from './SurveySection'

const ALL_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE'] as const
type Branch = typeof ALL_BRANCHES[number]

const BRANCH_LABELS: Record<string, string> = {
  SANDBOX_EAST:       'East Branch',
  SANDBOX_GREENHILLS: 'Greenhills Branch',
  VERDANA_STORE:      'Verdana Store',
}

const BRANCH_COLORS: Record<string, string> = {
  SANDBOX_EAST:       '#1A7B8A',
  SANDBOX_GREENHILLS: '#2AAABB',
  VERDANA_STORE:      '#52B788',
}

export default function CustomerSatisfactionPage() {
  const [selectedBranches, setSelectedBranches] = useState<Branch[]>([...ALL_BRANCHES])
  const isAllSelected = selectedBranches.length === ALL_BRANCHES.length

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Patients &amp; Email
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Customer Satisfaction Survey
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Therapist leaderboard and patient feedback from satisfaction surveys.
        </p>

        {/* Branch filter — same pills as the Patient Dashboard */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => setSelectedBranches([...ALL_BRANCHES])}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: isAllSelected ? 'var(--teal)' : 'var(--light-gray)',
              color: isAllSelected ? '#fff' : 'var(--mid-gray)',
              border: `1.5px solid ${isAllSelected ? 'var(--teal)' : 'var(--light-gray)'}`,
              cursor: 'pointer',
            }}
          >
            All
          </button>

          {ALL_BRANCHES.map((branch) => {
            const active = selectedBranches.includes(branch)
            const color = BRANCH_COLORS[branch]
            return (
              <button
                key={branch}
                onClick={() => setSelectedBranches([branch])}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                style={{
                  background: active ? color : '#F3F4F6',
                  color: active ? '#fff' : 'var(--mid-gray)',
                  border: `1.5px solid ${active ? color : '#E5E7EB'}`,
                  cursor: 'pointer',
                }}
              >
                {BRANCH_LABELS[branch]}
              </button>
            )
          })}
        </div>
      </div>

      <SurveySection branches={selectedBranches} />
    </div>
  )
}
