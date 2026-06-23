'use client'

// ── Front Desk Daily Shortcut card ───────────────────────────────────────────
// Shared between the Dashboard (FrontDeskWelcome) and the Clinic Schedule
// "Today" view so both render the exact same card.
export default function DeskShortcutCard() {
  const steps = [
    { letter: 'D', action: 'Deck out to patients', time: 'by 1:00 PM', desc: 'Send next-day schedule to each patient to confirm.' },
    { letter: 'E', action: 'Expect patient replies', time: 'until 5:00 PM', desc: 'Wait for patients to confirm their next-day session.' },
    { letter: 'S', action: 'Send to consultant', time: 'by 5:00 PM', desc: 'Send the confirmed next-day schedule to the consultant.' },
    { letter: 'K', action: 'Keep patients posted', time: 'on clinic opening', desc: 'Consultants notify Front Desk by 8:00 AM of any same-day absence.' },
  ]
  const cutoffs = [
    { time: '1:00 PM', label: 'Deck out' },
    { time: '5:00 PM', label: 'Patient replies' },
    { time: '5:00 PM', label: 'To consultant' },
    { time: '8:00 AM', label: 'Consultant absence' },
  ]
  const tiers = [
    { label: 'Standard', desc: 'Cancels before 5 PM the day before', bg: '#edf3d9', border: '#b8d4a0', color: '#4a8073' },
    { label: 'Late Cancel', desc: 'Cancels after 5 PM the day before', bg: '#FFFBEB', border: '#FDE68A', color: '#D97706' },
    { label: 'No-Show', desc: 'Did not show up for the session', bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
  ]

  return (
    <div style={{
      width: '100%',
      background: '#fff',
      border: '1.5px solid #EDE5D8',
      borderRadius: '0.875rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #244952, #4a8073)', padding: '0.6rem 0.9rem' }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.73rem', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
          Front Desk Daily Shortcut
        </p>
        <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.61rem', margin: '0.18rem 0 0' }}>
          Scheduling · Cancellations · No-Shows · Make-Ups
        </p>
      </div>

      {/* DESK steps */}
      <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {steps.map(({ letter, action, time, desc }) => (
          <div key={letter} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{
              flexShrink: 0, width: 26, height: 26,
              background: '#244952', borderRadius: '0.35rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '0.85rem',
            }}>
              {letter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1A1A1A', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                {action}
                <span style={{ background: '#c69849', color: '#fff', borderRadius: 99, padding: '0.05rem 0.45rem', fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {time}
                </span>
              </div>
              <div style={{ fontSize: '0.63rem', color: '#666', marginTop: '0.12rem', lineHeight: 1.4 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* At-a-Glance Cutoffs */}
      <div style={{ borderTop: '1px solid #F0E8DC', padding: '0.5rem 0.75rem' }}>
        <div style={{ fontSize: '0.59rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#AAA', marginBottom: '0.35rem' }}>
          At-a-Glance Cutoffs
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem' }}>
          {cutoffs.map(({ time, label }) => (
            <div key={label} style={{ background: '#FFF8F3', border: '1px solid #EDE5D8', borderRadius: '0.35rem', padding: '0.28rem 0.2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.67rem', fontWeight: 800, color: '#4a8073' }}>{time}</div>
              <div style={{ fontSize: '0.54rem', color: '#888', lineHeight: 1.3, marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancellation Tiers */}
      <div style={{ borderTop: '1px solid #F0E8DC', padding: '0.5rem 0.75rem 0.7rem' }}>
        <div style={{ fontSize: '0.59rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#AAA', marginBottom: '0.35rem' }}>
          Cancellation Tiers · 5:00 PM Rule
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {tiers.map(({ label, desc, bg, border, color }) => (
            <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: '0.35rem', padding: '0.3rem 0.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.59rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
              <div style={{ fontSize: '0.57rem', color: '#555', marginTop: '0.1rem', lineHeight: 1.35 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
