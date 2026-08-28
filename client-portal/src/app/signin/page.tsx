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

const STAFF_LOGIN = 'https://staff.sapphireclinicseast.org/login'

function IconPatient() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  )
}
function IconProvider() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" /><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" /><circle cx="20" cy="10" r="2" /></svg>
  )
}
function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
}

export default function SignInChooser() {
  return (
    <div className="animate-fade-up mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)]">Sign in to Aura Health</h1>
        <p className="mt-1 text-sm text-[color:var(--mid-gray)]">Choose how you&apos;d like to continue.</p>
      </div>

      <div className="space-y-3">
        {/* Patient */}
        <a href="/#get-started" className="card-static flex items-center gap-4 transition-all hover:border-[color:var(--sage)] hover:shadow-[0_6px_18px_rgba(27,63,56,0.10)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--paper-2)] text-[color:var(--deep-teal)]"><IconPatient /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>I&apos;m a patient</div>
            <div className="text-[13px] text-[color:var(--mid-gray)]">Book visits, view your sessions and reward points.</div>
          </div>
          <span className="text-[color:var(--moss)]"><Arrow /></span>
        </a>

        {/* Provider */}
        <a href={STAFF_LOGIN} className="card-static flex items-center gap-4 transition-all hover:border-[color:var(--sage)] hover:shadow-[0_6px_18px_rgba(27,63,56,0.10)]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--paper-2)] text-[color:var(--deep-teal)]"><IconProvider /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-[color:var(--narra)]" style={{ fontFamily: 'var(--font-display)' }}>I&apos;m a provider</div>
            <div className="text-[13px] text-[color:var(--mid-gray)]">Aura Health therapists &amp; staff — go to the staff portal.</div>
          </div>
          <span className="text-[color:var(--moss)]"><Arrow /></span>
        </a>
      </div>

      <p className="mt-5 text-center text-[12px] text-[color:var(--mid-gray)]">
        New patient? <a href="/#get-started" className="font-semibold text-[color:var(--moss)] hover:underline">Register here</a>
      </p>
    </div>
  )
}
