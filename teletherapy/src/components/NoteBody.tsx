'use client'

// Renders a session note body: structured department forms (Psychology, OT,
// SLP, SPED, PT) are parsed from their JSON and shown with the proper display
// component; anything else falls back to plain pre-wrapped text. Shared by the
// patient detail page, the Mentorship mentee-notes view, and the Internship
// intern-notes view so none of them ever shows raw JSON.

import PsychologyNoteDisplay from './PsychologyNoteDisplay'
import OTNoteDisplay from './OTNoteDisplay'
import SLPNoteDisplay from './SLPNoteDisplay'
import SPEDNoteDisplay from './SPEDNoteDisplay'
import PTNoteDisplay from './PTNoteDisplay'

export default function NoteBody({ notes }: { notes: string | null | undefined }) {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    if (parsed.formType?.startsWith('PSYCH_')) return <PsychologyNoteDisplay data={parsed} />
    if (parsed.formType === 'OT_DAILY_NOTES') return <OTNoteDisplay data={parsed} />
    if (parsed.formType === 'SLP_DAILY_NOTES') return <SLPNoteDisplay data={parsed} />
    if (parsed.formType === 'SPED16' || parsed.formType === 'SPED18') return <SPEDNoteDisplay data={parsed} />
    if (parsed.formType === 'PT_SESSION_NOTES') return <PTNoteDisplay data={parsed} />
  } catch { /* not JSON — render as plain text below */ }
  return (
    <div className="text-[13px] text-[var(--charcoal)] whitespace-pre-wrap bg-[var(--off-white)] p-3 rounded-lg border border-[var(--light-gray)]">{notes}</div>
  )
}
