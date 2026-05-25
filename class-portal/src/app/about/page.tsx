export const metadata = {
  title: 'About',
  description:
    'Aura Academy for Learning is a DepEd-accredited small private school in partnership with Light Bearer Christian Academy. Nursery, Kindergarten, and Grades 1–12 in small graded classes, with SPED-inclusive support from the Sapphire Clinics East team.',
  alternates: { canonical: 'https://class.sapphireclinicseast.org/about' },
  openGraph: {
    title: 'About Aura Academy for Learning',
    description:
      'Small, attentive classes from Nursery through Grade 12. DepEd-accredited, with a Learner Reference Number for every student.',
    url: 'https://class.sapphireclinicseast.org/about',
  },
}

export default function AboutPage() {
  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start">
      <section className="md:col-span-2 animate-fade-up md:sticky md:top-24">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              About Aura Academy
            </div>
            <h1 className="text-[40px] md:text-[44px] leading-[1.05] mb-4">
              A small class<br/>with big care.
            </h1>
            <p className="text-white/85 text-[15px] leading-relaxed">
              We&apos;re an in-clinic school program designed around the way young learners thrive — close attention, predictable routines, and a graded class that meets the standards of the Department of Education.
            </p>

            <div className="mt-6 pt-5 border-t border-white/15 flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/npc-seal.png"
                alt="National Privacy Commission — Registered DPO / DPS"
                className="w-[88px] h-auto shrink-0"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
              />
              <p className="text-white/80 text-[12.5px] leading-relaxed">
                Registered with the <span className="font-semibold text-white">National Privacy Commission</span> and compliant with the <span className="font-semibold text-white">Data Privacy Act of 2012</span>.
              </p>
            </div>

            <div className="mt-5 pt-5 border-t border-white/15">
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/70 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Is this different from Sandbox Clinic?
              </div>
              <p className="text-white/80 text-[12.5px] leading-relaxed">
                <span className="font-semibold text-white">Aura Academy for Learning</span> is still under <span className="font-semibold text-white">Sapphire Clinics East</span>, but is not under the <span className="font-semibold text-white">Sandbox Clinic</span> brand. Classes are hosted in the clinic premises of <span className="font-semibold text-white">Sandbox Clinic East</span> and <span className="font-semibold text-white">Sandbox Clinic Greenhills</span>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="md:col-span-3 animate-fade-up stagger-2 space-y-6">
        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-3">What we offer</h2>
          <ul className="space-y-2.5 text-[14.5px] text-[color:var(--ink)]">
            <li className="flex gap-3"><Dot/><span>Nursery, Kindergarten, and Grades 1–12 in graded classes.</span></li>
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

          <ul className="flex flex-col gap-2.5 max-w-2xl">
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
                    {doc.note && (
                      <span className="block text-[11.5px] text-[color:var(--mid-gray)] font-normal mt-0.5">{doc.note}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card-static">
          <h2 className="text-[22px] leading-tight mb-1">Other FAQs</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mb-5">
            Quick answers to the questions parents ask most often. Tap any question to expand the answer.
          </p>

          {/* Native <details>/<summary> for accordion behaviour — no JS, no
              hydration mismatch, fully keyboard-accessible, and works
              identically on every device. Styling matches the rest of the
              cards (rounded corners, paper-3 borders, narra/moss accents). */}
          <ul className="flex flex-col gap-2.5">
            {[
              {
                q: 'Is this a real school?',
                a: 'Yes. We’re in partnership with Light Bearer Christian Academy, so each student gets an LRN (Learner Reference Number) and an actual DepEd-compliant report card.',
              },
              {
                q: 'What grade levels do you offer?',
                a: 'We now offer all grade levels — Nursery and Kindergarten through Grade 12. All levels are graded except Nursery.',
              },
              {
                q: 'What subjects are taught?',
                a: 'The full DepEd-aligned curriculum — English, Math, Science, Filipino, Araling Panlipunan, MAPEH, and Edukasyon sa Pagpapakatao — plus the practical-life and SPED supports our clinic team adds on top.',
              },
              {
                q: 'Is the IE (Initial Evaluation) fee the same as the clinic’s normal IE?',
                a: 'Yes. The IE assessment uses the prevailing clinic rate and is separate from the school tuition. It also includes an entrance exam so we can place your child in the right grade level and tailor support from day one.',
              },
              {
                q: 'How much are the books, and what’s the class schedule?',
                a: 'Classes meet every Tuesday and Thursday. Books are roughly ₱7,500 per set — final price to be announced once we lock in the supplier.',
              },
              {
                q: 'Is Aura Academy DepEd-accredited?',
                a: 'Yes. Through our partnership with Light Bearer Christian Academy, the program is DepEd-accredited end to end.',
              },
            ].map((item, i) => (
              <li key={i}>
                <details className="group rounded-2xl border border-[color:var(--paper-3)] bg-white/60 overflow-hidden transition-colors hover:border-[color:var(--moss)]/40 open:border-[color:var(--moss)]/60 open:bg-[color:var(--paper-2)]">
                  <summary
                    className="cursor-pointer list-none px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3 text-[14px] leading-snug font-semibold text-[color:var(--narra)] group-open:text-[color:var(--moss)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    <span>{item.q}</span>
                    <span
                      aria-hidden
                      className="shrink-0 w-6 h-6 rounded-full bg-[color:var(--paper-3)] text-[color:var(--narra)] flex items-center justify-center text-[14px] font-bold leading-none transition-transform group-open:rotate-45 group-open:bg-[color:var(--moss)] group-open:text-white"
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 -mt-1 text-[13.5px] leading-relaxed text-[color:var(--ink)]">
                    {item.a}
                  </div>
                </details>
              </li>
            ))}
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
    body: 'Create a parent account and pick the grade level (Nursery, Kindergarten, or Grade 1 through Grade 12).',
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
    body: 'Choose annual, bi-annual, or monthly plan and pay through any of three options: securely via PayMongo (Credit card, GCash, Maya, or GrabPay), in cash at the front desk, or by direct bank deposit with proof of payment uploaded.',
  },
  {
    title: 'Front desk confirms payment acceptance',
    titleHighlight: 'confirms payment',
    body: "Our front desk team verifies the payment. You may also purchase books and the school uniform from the front desk. Please also submit HARD COPIES of your child's school records at this stage.",
  },
  {
    title: 'Enrolled — your child may start attending classes!',
    titleHighlight: 'Enrolled',
    body: 'You will receive your Learner Reference Number (LRN), school ID, welcome kit, and class schedule. Welcome to Aura Academy for Learning!',
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

// Form 137 / SF10 is endorsed by the previous school directly — parents
// don't bring or upload it, so it's excluded from the parent-facing list.
const ENROLLMENT_DOCS: Array<{ title: string; note?: string; mandatory?: boolean }> = [
  { title: 'PSA Birth Certificate (photocopy)' },
  { title: '1x1 photo of your child (for student ID)' },
  { title: 'Parent/Guardian Valid ID', note: 'For the main signatory and contact person on the enrollment.' },
  { title: 'PWD ID (if applicable)' },
  { title: 'Latest Report Card / SF9' },
  { title: 'Certificate of Good Moral Character' },
  { title: 'Completed enrollment form (DepEd Annex 2)', note: 'Generated from the Learner Profile you complete on our website.' },
  { title: 'Medical / developmental / therapy reports (if relevant)' },
  { title: 'Signed Parent/Guardian Waiver', mandatory: true },
]
