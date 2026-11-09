import type { Metadata } from 'next'

// Sign-in chooser: patient vs provider. Patients use the portal's own account
// flow; providers go to the staff portal (staff.sapphireclinicseast.org), which
// shares the *.sapphireclinicseast.org session cookie — so it's the same tab,
// seamless. (Provider self-sign-up with the Terms consent is added in a later
// phase.)

export const metadata: Metadata = {
  title: 'Sign in — Aura Health',
  description: 'Sign in to Aura Health as a patient or a provider.',
}

function IconPatient() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  )
}
function IconProvider() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" /><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" /><circle cx="20" cy="10" r="2" /></svg>
  )
}
function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
}

// Server component: the kit's string constants live in a 'use client' module
// (they would arrive here as client references, not strings), so the kit
// classes are spelled out locally. Icon is a component and imports fine.
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]'
const CHOICE = `group flex items-center gap-4 rounded-xl px-4 py-4 sm:px-5 transition-colors hover:bg-[color:var(--paper)] ${FOCUS_RING}`

export default function SignInChooser() {
  return (
    <div className="animate-fade-up mx-auto max-w-xl">
      <div
        className="rounded-[18px] overflow-hidden px-5 py-8 sm:px-10 sm:py-10"
        style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 2px 12px rgba(25,72,80,0.06)' }}
      >
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
            Welcome back
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>
            Sign in to Aura Health
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--mid-gray)' }}>Choose how you&apos;d like to continue.</p>
        </div>

        <div className="space-y-2.5">
          {/* Patient */}
          <a href="/#get-started" className={CHOICE} style={{ border: '1.5px solid var(--light-gray)' }}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}><IconPatient /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>I&apos;m a patient</span>
              <span className="block text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>Book visits, view your sessions and reward points.</span>
            </span>
            <span className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--teal)' }}><Arrow /></span>
          </a>

          {/* Provider */}
          <a href="/signin/provider" className={CHOICE} style={{ border: '1.5px solid var(--light-gray)' }}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}><IconProvider /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>I&apos;m a provider</span>
              <span className="block text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>Aura Health therapists &amp; staff — sign in or create an account.</span>
            </span>
            <span className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--teal)' }}><Arrow /></span>
          </a>
        </div>

        <p className="mt-7 pt-5 text-center text-[13px]" style={{ borderTop: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
          New patient? <a href="/#get-started" className={`font-semibold rounded hover:underline ${FOCUS_RING}`} style={{ color: 'var(--teal)' }}>Register here</a>
        </p>
      </div>
    </div>
  )
}
