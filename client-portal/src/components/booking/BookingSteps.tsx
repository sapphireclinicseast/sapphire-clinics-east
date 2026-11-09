// Step indicator for the booking flow (/book → /book/slots → /book/confirm,
// and /book → /book/teletherapy). Hub-kit look: numbered dots joined by a
// rule, the current step in deep teal with a soft ring, finished steps ticked.
// Each step carries its number and label in text, so state never rests on
// colour alone. Display only.

export function BookingSteps({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol aria-label="Booking steps" className="flex flex-wrap items-center gap-x-2 gap-y-2" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = i + 1
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'active' ? 'step' : undefined}>
            <span
              aria-hidden
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
              style={
                state === 'active'
                  ? { background: 'var(--deep-teal)', color: '#fff', boxShadow: '0 0 0 3px rgba(74,128,115,0.18)' }
                  : state === 'done'
                  ? { background: 'var(--pale-teal)', color: 'var(--deep-teal)' }
                  : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }
              }
            >
              {state === 'done'
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>
                : n}
            </span>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
              style={{ color: state === 'active' ? 'var(--deep-teal)' : 'var(--mid-gray)' }}
            >
              <span className="sr-only">Step {n}: </span>{label}
              {state === 'done' && <span className="sr-only"> (done)</span>}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="w-5 sm:w-8 h-px ml-1" style={{ background: 'var(--light-gray)' }} />}
          </li>
        )
      })}
    </ol>
  )
}
