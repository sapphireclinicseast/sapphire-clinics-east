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
import { CARD_STYLE } from '../patients/dashboard/ui'

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

const pill = (active: boolean) =>
  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${active ? '' : 'hover:bg-gray-50'}`

export default function CustomerSatisfactionPage() {
  const [selectedBranches, setSelectedBranches] = useState<Branch[]>([...ALL_BRANCHES])
  const isAllSelected = selectedBranches.length === ALL_BRANCHES.length
  const scopeLabel = isAllSelected ? 'All branches' : selectedBranches.map(b => BRANCH_LABELS[b]).join(', ')

  return (
    <div className="max-w-6xl space-y-5 min-w-0">
      {/* ── Header ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Investor View
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Customer Satisfaction Survey
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          How patients rate our therapists, and what they say about them in their own words.
        </p>
      </div>

      {/* ── Toolbar: branch filter (same behaviour as before — All, or one branch) ── */}
      <div className="rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={CARD_STYLE}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch filter">
          <span className="text-[11px] font-semibold uppercase tracking-wider mr-1.5" style={{ color: 'var(--mid-gray)' }}>
            Branch
          </span>
          <button
            type="button"
            onClick={() => setSelectedBranches([...ALL_BRANCHES])}
            aria-pressed={isAllSelected}
            className={pill(isAllSelected)}
            style={{
              background: isAllSelected ? 'var(--teal)' : 'transparent',
              color: isAllSelected ? '#fff' : 'var(--charcoal)',
            }}
          >
            All
          </button>

          {ALL_BRANCHES.map((branch) => {
            const active = !isAllSelected && selectedBranches.includes(branch)
            return (
              <button
                key={branch}
                type="button"
                onClick={() => setSelectedBranches([branch])}
                aria-pressed={active}
                className={pill(active)}
                style={{
                  background: active ? 'var(--teal)' : 'transparent',
                  color: active ? '#fff' : 'var(--charcoal)',
                }}
              >
                <span className="inline-block w-2 h-2 rounded-full"
                  style={{ background: BRANCH_COLORS[branch], boxShadow: active ? '0 0 0 1.5px #fff' : undefined }} />
                {BRANCH_LABELS[branch]}
              </button>
            )
          })}
        </div>
        <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          Showing <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{scopeLabel}</span>
        </span>
      </div>

      <SurveySection branches={selectedBranches} />
    </div>
  )
}
