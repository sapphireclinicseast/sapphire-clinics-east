const STEPS = [
  { n: '1', t: 'Tell us your city', d: 'We show therapists who serve your area.' },
  { n: '2', t: 'Pick your therapist', d: 'Choose by their open schedule and the cities they cover.' },
  { n: '3', t: 'Book & pay securely', d: 'Confirm a time and pay online — the therapist comes to you.' },
]

export default function NickelHome() {
  return (
    <div className="animate-fade-up space-y-6">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[22px] p-7 text-white shadow-[0_12px_36px_rgba(34,48,63,0.25)] sm:p-10"
        style={{ background: 'linear-gradient(135deg, var(--steel), var(--steel-deep))' }}
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white opacity-10" />
        <span className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-white opacity-5" />
        <div className="relative max-w-xl">
          <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/70">Homecare therapy</div>
          <h1 className="mt-2 text-[34px] font-bold leading-[1.05] text-white sm:text-[44px]">Therapy that comes to you.</h1>
          <p className="mt-3 text-[15px] leading-snug text-white/85 sm:text-[16px]">
            Nickel connects you with licensed home therapists near you. Pick a therapist by their schedule, book a time, and they&apos;ll come to your home.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/book" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-semibold" style={{ color: 'var(--steel-deep)' }}>
              Find a therapist →
            </a>
            <a href="/provider/login" className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-[15px] font-semibold text-white hover:bg-white/10">
              Provider sign in
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="card">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--sky)]">How it works</div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: 'var(--steel)' }}>{s.n}</div>
              <div>
                <div className="text-[15px] font-semibold text-[color:var(--ink)]">{s.t}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-[color:var(--slate)]">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Provider CTA */}
      <section className="card flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="text-[16px] font-semibold text-[color:var(--ink)]">Are you a therapist?</div>
          <p className="text-[13px] text-[color:var(--slate)]">Join Nickel, set your own rate and schedule, and reach clients near you.</p>
        </div>
        <a href="/provider/signup" className="btn-outline shrink-0">Join as a therapist</a>
      </section>
    </div>
  )
}
