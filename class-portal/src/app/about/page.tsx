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
              A small class<br/>with big care.
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
            <li className="flex gap-3"><Dot/><span>Kindergarten and Grades 1–10 in graded classes.</span></li>
            <li className="flex gap-3"><Dot/><span>DepEd-accredited curriculum — your child stays on track with the national program.</span></li>
            <li className="flex gap-3"><Dot/><span>Every enrolled student is issued a Learner Reference Number (LRN).</span></li>
            <li className="flex gap-3"><Dot/><span>Students are issued an official <span className="font-semibold">report card</span> each grading period.</span></li>
            <li className="flex gap-3"><Dot/><span>Our graded classes are <span className="font-semibold">recognised</span> when your child transfers to another school — completed levels carry over.</span></li>
            <li className="flex gap-3"><Dot/><span>Small class sizes for individualised attention.</span></li>
            <li className="flex gap-3"><Dot/><span>Integrated with Sapphire Clinics East&apos;s allied health services when extra support is needed.</span></li>
          </ul>
        </div>

        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-1">How enrollment works</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-5">A 7-step process from initial evaluation to your child&apos;s first day in class.</p>

          <ol className="relative space-y-4">
            {ENROLLMENT_STEPS.map((step, i) => (
              <li key={i} className="relative pl-12">
                {i < ENROLLMENT_STEPS.length - 1 && (
                  <span aria-hidden className="absolute left-[15px] top-9 bottom-[-1rem] w-[2px]" style={{ background: 'var(--paper-3)' }} />
                )}
                <span
                  aria-hidden
                  className="absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ background: 'var(--narra)', color: '#fff', fontFamily: 'var(--font-display)' }}
                >
                  {i + 1}
                </span>
                <div className="font-semibold text-[color:var(--narra)] text-[15px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                  {step.titleHighlight ? renderHighlighted(step.title, step.titleHighlight) : step.title}
                </div>
                <div className="text-[13.5px] text-[color:var(--ink)] mt-1 leading-relaxed">
                  {step.highlight ? renderHighlighted(step.body, step.highlight) : step.body}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-7">
            <a href="/" className="btn-primary">Start enrollment →</a>
          </div>
        </div>

        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-1">Documents to prepare</h2>
          <p className="text-[12.5px] text-[color:var(--mid-gray)] mb-5">
            For <span className="font-semibold text-[color:var(--narra)]">Kindergarten</span>, only the PSA Birth Certificate is required. For <span className="font-semibold text-[color:var(--narra)]">Grades 1&ndash;10</span>, the full list below applies. Please have <span className="font-semibold text-[color:var(--narra)]">scanned copies</span> of these available for upload here in the website. Please also bring the <span className="font-semibold text-[color:var(--narra)]">hard copies</span> when going to the clinic.
          </p>

          <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
            {ENROLLMENT_DOCS.map((doc, i) => {
              const num = i + 1
              const isMandatory = !!doc.mandatory
              return (
                <li key={i} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0"
                    style={{
                      background: isMandatory ? 'var(--clay)' : 'var(--sage)',
                      color: '#fff',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    {num}
                  </span>
                  <span className={`text-[13.5px] leading-snug ${isMandatory ? 'font-semibold text-[color:var(--clay)]' : 'text-[color:var(--ink)]'}`}>
                    {doc.title}
                    {isMandatory && <span className="ml-1 text-[11px] uppercase tracking-[0.08em]">&larr; Mandatory</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-1">Questions?</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mb-5">
            If you have any questions about admissions, programs, or your child&apos;s enrollment, please reach out to us.
          </p>

          <div className="grid sm:grid-cols-2 gap-5">
            <BranchCard
              name="East Branch"
              address="Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig"
              email="east.sandboxclinic@gmail.com"
              phones={['+63 917 118 9289', '(02) 5310-4991']}
            />
            <BranchCard
              name="Greenhills Branch"
              address="Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City"
              email="greenhills.sandboxclinic@gmail.com"
              phones={['+63 917 770 1686', '(02) 8529-1590']}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function BranchCard({ name, address, email, phones }: { name: string; address: string; email: string; phones: string[] }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ borderColor: 'var(--paper-3)', background: 'var(--paper-2)' }}>
      <h3 className="text-[16px] font-semibold text-[color:var(--narra)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
        {name}
      </h3>
      <ul className="space-y-2.5 text-[13.5px] text-[color:var(--ink)]">
        <li className="flex gap-2.5"><span aria-hidden>📍</span><span>{address}</span></li>
        <li className="flex gap-2.5"><span aria-hidden>✉️</span>
          <a href={`mailto:${email}`} className="text-[color:var(--narra)] hover:underline break-all">{email}</a>
        </li>
        <li className="flex gap-2.5"><span aria-hidden>📞</span>
          <span className="flex flex-wrap gap-x-2 gap-y-1">
            {phones.map((p, i) => (
              <span key={p} className="whitespace-nowrap">
                <a href={`tel:${p.replace(/[^+\d]/g, '')}`} className="text-[color:var(--narra)] hover:underline">{p}</a>
                {i < phones.length - 1 && <span className="text-[color:var(--mid-gray)] ml-2">|</span>}
              </span>
            ))}
          </span>
        </li>
      </ul>
    </div>
  )
}

function Dot() {
  return <span className="mt-2 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--clay)] shrink-0" />
}

const ENROLLMENT_STEPS: Array<{ title: string; titleHighlight?: string; body: string; highlight?: string }> = [
  {
    title: 'Schedule an initial evaluation',
    titleHighlight: 'initial evaluation',
    body: 'Book a session with our front desk so the SPED teacher can assess your child and prepare an Individualized Education Program (IEP). New students only — existing clients with a clinic IEP can skip this step.',
  },
  {
    title: 'Register your child and choose an enrollment level (here in the website)',
    titleHighlight: 'Register',
    body: 'Create a parent account and pick the grade level (Kindergarten or Grade 1 through Grade 10).',
  },
  {
    title: 'Fill out and sign the enrollment form on the website',
    titleHighlight: 'Fill out and sign',
    body: 'Complete the DepEd Annex 2 learner profile, then add your signature inside the certification block.',
  },
  {
    title: 'Upload the required documents and sign the Parent/Guardian Waiver',
    titleHighlight: 'Upload',
    body: 'See the document list below. The Parent/Guardian Waiver is mandatory and must be signed before we can confirm enrollment.',
  },
  {
    title: 'Pay the tuition fee',
    titleHighlight: 'Pay',
    body: 'Choose annual, bi-annual, or monthly plan and pay securely via PayMongo (Credit card, GCash, Maya, or GrabPay).',
  },
  {
    title: 'Front desk confirms payment acceptance',
    titleHighlight: 'confirms payment',
    body: "Our front desk team verifies the payment. You may also purchase books and the school uniform from the front desk. Please also submit HARD COPIES of your child's school records at this stage.",
  },
  {
    title: 'Enrolled — your child may start attending classes!',
    titleHighlight: 'Enrolled',
    body: 'You will receive your Learner Reference Number (LRN), school ID, and class schedule. Welcome to SCEI SPED Class!',
  },
]

/** Wrap the first occurrence of `phrase` in `text` with a brand-clay
 *  highlight span. Case-insensitive match. */
function renderHighlighted(text: string, phrase: string): React.ReactNode {
  const i = text.toLowerCase().indexOf(phrase.toLowerCase())
  if (i < 0) return text
  const before = text.slice(0, i)
  const match = text.slice(i, i + phrase.length)
  const after = text.slice(i + phrase.length)
  return (
    <>
      {before}
      <span
        className="font-bold px-1 rounded"
        style={{ background: 'var(--gold-tint, #fef3c7)', color: 'var(--clay, #a85c3d)' }}
      >
        {match}
      </span>
      {after}
    </>
  )
}

const ENROLLMENT_DOCS: Array<{ title: string; mandatory?: boolean }> = [
  { title: 'PSA Birth Certificate (photocopy)' },
  { title: '1x1 photo of your child (for student ID)' },
  { title: 'Form 137 / SF10 or previous school records' },
  { title: 'Latest Report Card / SF9' },
  { title: 'Certificate of Good Moral Character' },
  { title: 'Completed enrollment form (LBCA digital form)' },
  { title: 'Medical / developmental / therapy reports (if relevant)' },
  { title: 'Signed Parent/Guardian Waiver', mandatory: true },
]
