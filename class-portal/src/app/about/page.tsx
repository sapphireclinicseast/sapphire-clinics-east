import type { CSSProperties, ReactNode } from 'react'
import { DashCard, Icon, PageHeader, Tag, type IconName } from '@/components/hub/ui'

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

// This page is a server component (it exports `metadata`), and the hub kit is
// a 'use client' module. Its components (PageHeader, DashCard, Tag, Icon) can
// be rendered from here, but its plain string/object exports (BTN_PRIMARY,
// CARD_STYLE, SUBTLE_BG…) arrive as client references, not values. These are
// local copies of the few the page needs; keep them in step with
// components/hub/ui.tsx.
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teal)]'
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold text-white whitespace-nowrap transition-opacity hover:opacity-90 ${FOCUS}`
const PRIMARY_STYLE: CSSProperties = { background: 'var(--deep-teal)' }
const CARD_STYLE: CSSProperties = { background: '#fff', border: '1px solid var(--light-gray)' }
const SUBTLE_BG = '#FAF7F1'
const SUBTLE_STYLE: CSSProperties = { background: SUBTLE_BG, border: '1px solid var(--light-gray)' }
const DISPLAY: CSSProperties = { fontFamily: 'var(--font-display)' }
/** Warm highlight for key phrases, from the kit's "warn" tone (AA contrast). */
const HIGHLIGHT_STYLE: CSSProperties = { background: '#FBF3E8', color: '#7A4E21' }

export default function AboutPage() {
  return (
    <div className="max-w-[1100px] mx-auto space-y-5 min-w-0 animate-fade-up">
      <PageHeader size="lg"
        eyebrow="About Aura Academy"
        title={<>A small class<br/>with big care.</>}
        description={<>We&apos;re an in-clinic school program designed around the way young learners thrive — close attention, predictable routines, and a graded class that meets the standards of the Department of Education.</>}
      />

      {/* Key facts, each phrase quoted from the copy further down the page
          (What we offer, the FAQs and the branch cards). No new claims. */}
      <ul aria-label="Key facts" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FactTile icon="student">Nursery, Kindergarten, and Grades 1–12</FactTile>
        <FactTile icon="award" sub="Light Bearer Christian Academy">DepEd-accredited</FactTile>
        <FactTile icon="tag">Learner Reference Number (LRN)</FactTile>
        <FactTile icon="building" sub="Greenhills Branch">East Branch</FactTile>
      </ul>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl p-4 sm:p-5 flex items-start gap-4 min-w-0" style={CARD_STYLE}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/npc-seal.png"
            alt="National Privacy Commission — Registered DPO / DPS"
            className="w-[72px] h-auto shrink-0"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
          />
          <p className="text-[13px] leading-relaxed min-w-0" style={{ color: 'var(--mid-gray)' }}>
            Registered with the <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>National Privacy Commission</span> and compliant with the <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Data Privacy Act of 2012</span>.
          </p>
        </div>

        <div className="rounded-xl p-4 sm:p-5 min-w-0" style={SUBTLE_STYLE}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ ...DISPLAY, color: 'var(--deep-teal)' }}>
            <Icon name="info" size={13} />
            Is this different from Sapphire Clinics East?
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            <Em>Aura Academy for Learning</Em> is still under <Em>Sapphire Clinics East</Em>, but is not under the <Em>Sapphire Clinics East</Em> brand. Classes are hosted in the clinic premises of <Em>East Branch</Em> and <Em>Greenhills Branch</Em>.
          </p>
        </div>
      </div>

      <DashCard title="What we offer" icon={<Icon name="student" size={16} />}>
        <ul className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm leading-relaxed" style={{ color: 'var(--charcoal)' }}>
          <li className="flex gap-2.5"><Check/><span>Nursery, Kindergarten, and Grades 1–12 in graded classes.</span></li>
          <li className="flex gap-2.5"><Check/><span>DepEd-accredited curriculum — your child stays on track with the national program.</span></li>
          <li className="flex gap-2.5"><Check/><span>Every enrolled student is issued a Learner Reference Number (LRN).</span></li>
          <li className="flex gap-2.5"><Check/><span>Students are issued an official <span className="font-semibold">report card</span> each grading period.</span></li>
          <li className="flex gap-2.5"><Check/><span>Our graded classes are <span className="font-semibold">recognised</span> when your child transfers to another school — completed levels carry over.</span></li>
          <li className="flex gap-2.5"><Check/><span>Small class sizes for individualised attention.</span></li>
          <li className="flex gap-2.5"><Check/><span>Integrated with Sapphire Clinics East&apos;s allied health services when extra support is needed.</span></li>
        </ul>
      </DashCard>

      <DashCard
        title="How enrollment works"
        icon={<Icon name="userPlus" size={16} />}
        description={<>A 7-step process from initial evaluation to your child&apos;s first day in class.</>}
      >
        <ol className="relative space-y-4">
          {ENROLLMENT_STEPS.map((step, i) => (
            <li key={i} className="relative pl-11">
              {i < ENROLLMENT_STEPS.length - 1 && (
                <span aria-hidden className="absolute left-[13px] top-8 bottom-[-1rem] w-[2px]" style={{ background: 'var(--light-gray)' }} />
              )}
              <span
                aria-hidden
                className="absolute left-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0"
                style={{ ...DISPLAY, background: 'var(--deep-teal)', color: '#fff' }}
              >
                {i + 1}
              </span>
              <div className="font-semibold text-sm leading-snug" style={{ ...DISPLAY, color: 'var(--charcoal)' }}>
                {step.titleHighlight ? renderHighlighted(step.title, step.titleHighlight) : step.title}
              </div>
              <div className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                {step.highlight ? renderHighlighted(step.body, step.highlight) : step.body}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <a href="/" className={BTN_PRIMARY} style={PRIMARY_STYLE}>Start enrollment →</a>
        </div>
      </DashCard>

      <DashCard title="Documents to prepare" icon={<Icon name="file" size={16} />}>
        <div className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 mb-4 text-[13px] leading-relaxed" style={{ ...SUBTLE_STYLE, color: 'var(--mid-gray)' }}>
          <Icon name="info" size={15} className="mt-0.5" style={{ color: 'var(--teal)' }} />
          <p className="min-w-0">
            For <Em>Kindergarten</Em>, only the PSA Birth Certificate is required. For <Em>Grades 1&ndash;10</Em>, the full list below applies. Please have <Em>scanned copies</Em> of these available for upload here in the website. Please also bring the <Em>hard copies</Em> when going to the clinic.
          </p>
        </div>

        {/* Column-first on desktop so the numbers read top to bottom. */}
        <ol className="grid gap-x-6 gap-y-2.5 md:grid-flow-col md:grid-rows-5">
          {ENROLLMENT_DOCS.map((doc, i) => {
            const num = i + 1
            const isMandatory = !!doc.mandatory
            return (
              <li key={i} className="flex items-start gap-3 min-w-0">
                <span
                  aria-hidden
                  className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
                  style={{
                    ...DISPLAY,
                    background: isMandatory ? HIGHLIGHT_STYLE.background : 'var(--pale-teal)',
                    color: isMandatory ? HIGHLIGHT_STYLE.color : 'var(--deep-teal)',
                    border: `1px solid ${isMandatory ? '#EBD3B4' : 'var(--light-gray)'}`,
                  }}
                >
                  {num}
                </span>
                <span className={`text-[13px] leading-snug min-w-0 pt-0.5 ${isMandatory ? 'font-semibold' : ''}`} style={{ color: 'var(--charcoal)' }}>
                  {doc.title}
                  {isMandatory && <> <Tag tone="warn">&larr; Mandatory</Tag></>}
                  {doc.note && (
                    <span className="block text-xs font-normal mt-0.5" style={{ color: 'var(--mid-gray)' }}>{doc.note}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </DashCard>

      <DashCard
        title="Other FAQs"
        icon={<Icon name="info" size={16} />}
        description="Quick answers to the questions parents ask most often. Tap any question to expand the answer."
      >
        {/* Native <details>/<summary> for accordion behaviour — no JS, no
            hydration mismatch, fully keyboard-accessible, and works
            identically on every device. Rows follow the hub kit: light-gray
            borders, a subtle fill when open, a chevron that turns. */}
        <ul className="flex flex-col gap-2">
          {FAQS.map((item, i) => (
            <li key={i}>
              <details className="group rounded-lg border border-[color:var(--light-gray)] bg-white overflow-hidden transition-colors hover:border-[color:var(--teal)]/40 open:bg-[#FAF7F1]">
                <summary
                  className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3.5 py-3 sm:px-4 flex items-center justify-between gap-3 text-sm leading-snug font-semibold rounded-lg ${FOCUS}`}
                  style={{ ...DISPLAY, color: 'var(--charcoal)' }}
                >
                  <span className="min-w-0">{item.q}</span>
                  <Icon name="chevronRight" size={16} className="transition-transform group-open:rotate-90" style={{ color: 'var(--teal)' }} />
                </summary>
                <div className="px-3.5 pb-3.5 sm:px-4 sm:pb-4 -mt-0.5 text-[13px] leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
                  {item.a}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </DashCard>

      <DashCard
        title="Questions?"
        icon={<Icon name="users" size={16} />}
        description={<>If you have any questions about admissions, programs, or your child&apos;s enrollment, please reach out to us.</>}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <BranchCard
            name="East Branch"
            address="Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig"
            email="east@sapphireclinicseast.org"
            phones={['+63 917 118 9289', '(02) 5310-4991']}
          />
          <BranchCard
            name="Greenhills Branch"
            address="Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City"
            email="greenhills@sapphireclinicseast.org"
            phones={['+63 917 770 1686', '(02) 8529-1590']}
          />
        </div>
      </DashCard>
    </div>
  )
}

/** One key-fact tile: an icon, a short phrase and an optional second line. */
function FactTile({ icon, sub, children }: { icon: IconName; sub?: ReactNode; children: ReactNode }) {
  return (
    <li className="rounded-xl px-4 py-3.5 flex items-start gap-3 min-w-0" style={CARD_STYLE}>
      <span aria-hidden className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-snug" style={{ ...DISPLAY, color: 'var(--charcoal)' }}>{children}</span>
        {sub && <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{sub}</span>}
      </span>
    </li>
  )
}

function Em({ children }: { children: ReactNode }) {
  return <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{children}</span>
}

function BranchCard({ name, address, email, phones }: { name: string; address: string; email: string; phones: string[] }) {
  return (
    <div className="rounded-xl p-4 sm:p-5 min-w-0" style={SUBTLE_STYLE}>
      <h3 className="flex items-center gap-2 text-[14px] font-bold mb-3 tracking-normal" style={{ ...DISPLAY, color: 'var(--charcoal)' }}>
        <span aria-hidden style={{ color: 'var(--teal)' }}><Icon name="building" size={15} /></span>
        {name}
      </h3>
      <ul className="space-y-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--charcoal)' }}>
        <li className="flex gap-2.5"><Glyph name="pin" /><span className="min-w-0">{address}</span></li>
        <li className="flex gap-2.5"><Glyph name="mail" />
          {/* Wrap on the @ if the card is too narrow for one line —
              `<wbr>` gives the browser a preferred break point so we
              get "east@" / "sapphireclinicseast.org" instead of the
              previous break-all which orphaned the trailing "g".
              break-words is the fallback for very narrow containers. */}
          <a
            href={`mailto:${email}`}
            className={`font-semibold hover:underline break-words min-w-0 rounded-sm ${FOCUS}`}
            style={{ color: 'var(--deep-teal)' }}
          >
            {(() => {
              const at = email.indexOf('@')
              if (at === -1) return email
              return <>{email.slice(0, at + 1)}<wbr />{email.slice(at + 1)}</>
            })()}
          </a>
        </li>
        <li className="flex gap-2.5"><Glyph name="phone" />
          <span className="flex flex-wrap gap-x-2 gap-y-1 min-w-0">
            {phones.map((p, i) => (
              <span key={p} className="whitespace-nowrap">
                <a href={`tel:${p.replace(/[^+\d]/g, '')}`} className={`font-semibold hover:underline rounded-sm ${FOCUS}`} style={{ color: 'var(--deep-teal)' }}>{p}</a>
                {i < phones.length - 1 && <span className="ml-2" style={{ color: 'var(--light-gray)' }}>|</span>}
              </span>
            ))}
          </span>
        </li>
      </ul>
    </div>
  )
}

function Check() {
  return <Icon name="check" size={16} className="mt-[3px]" style={{ color: 'var(--sage)' }} />
}

// Contact glyphs the kit's icon set doesn't carry (map pin, mail, phone).
// Same Feather/Lucide stroke style as <Icon>; decorative only.
const GLYPHS = {
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
} as const

function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0 mt-[3px]" style={{ color: 'var(--teal)' }}>
      {GLYPHS[name]}
    </svg>
  )
}

const FAQS: Array<{ q: string; a: string }> = [
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
]

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

/** Wrap the first occurrence of `phrase` in `text` with a warm
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
      <span className="font-bold px-1 rounded" style={HIGHLIGHT_STYLE}>
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
