export const metadata = {
  title: 'About — Sapphire Clinics East Class Portal',
}

export default function AboutPage() {
  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start">
      <section className="md:col-span-2 animate-fade-up md:sticky md:top-24">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              About SCEI Class
            </div>
            <h1 className="text-[40px] md:text-[44px] leading-[1.05] mb-4">
              A small school<br/>with big care.
            </h1>
            <p className="text-white/85 text-[15px] leading-relaxed">
              We&apos;re an in-clinic school program designed around the way young learners thrive — close attention, predictable routines, and a graded class that meets the standards of the Department of Education.
            </p>
          </div>
        </div>
      </section>

      <section className="md:col-span-3 animate-fade-up stagger-2 space-y-6">
        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-3">What we offer</h2>
          <ul className="space-y-2.5 text-[14.5px] text-[color:var(--ink)]">
            <li className="flex gap-3"><Dot/> Kindergarten and Grades 1–3 in one graded class.</li>
            <li className="flex gap-3"><Dot/> DepEd-accredited curriculum — your child stays on track with the national program.</li>
            <li className="flex gap-3"><Dot/> Every enrolled student is issued a Learner Reference Number (LRN).</li>
            <li className="flex gap-3"><Dot/> Small class sizes for individualised attention.</li>
            <li className="flex gap-3"><Dot/> Integrated with Sapphire Clinics East&apos;s allied health services when extra support is needed.</li>
          </ul>
        </div>

        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-3">How enrollment works</h2>
          <ol className="space-y-2.5 text-[14.5px] text-[color:var(--ink)] list-decimal pl-5">
            <li>Register your student and choose an enrollment level.</li>
            <li>Provide the PSA Birth Certificate number.</li>
            <li>Upload the required documents and sign the Parent/Guardian Waiver.</li>
            <li>Our admissions team reviews and confirms next steps.</li>
          </ol>
          <div className="mt-5">
            <a href="/" className="btn-primary">Start enrollment →</a>
          </div>
        </div>
      </section>
    </div>
  )
}

function Dot() {
  return <span className="mt-2 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--clay)] shrink-0" />
}
