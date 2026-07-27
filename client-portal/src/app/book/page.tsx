'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'

// At both branches the "Medical Doctor" service is delivered through specific
// sub-specialties — there's no generic-MD tile any more. SBEA splits across
// three (Psychiatry / Developmental Pediatrician / Rehabilitation Medicine);
// SBGH offers two (Psychiatry / Developmental Pediatrician).
const SERVICES_SBEA = [
  'PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY', 'ORTHOSIS',
  'PSYCHIATRY', 'DEVELOPMENTAL_PEDIATRICIAN', 'REHABILITATION_MEDICINE',
] as const
const SERVICES_SBGH = [
  'PT', 'OT', 'SLP', 'SPED', 'PSYCHOLOGY',
  'PSYCHIATRY', 'DEVELOPMENTAL_PEDIATRICIAN',
] as const

// Phase-1 rollout: only the listed services are bookable online today.
// Everything else routes the patient to the front desk via call / Viber /
// SMS / email / Facebook.
// SBEA's old generic "MD" is replaced by its concrete sub-specialties;
// Developmental Pediatrician is still tile-visible but offline-only for
// now (the clinic handles those requests by phone).
const ONLINE_ENABLED_SBEA = new Set<string>(['PT', 'REHABILITATION_MEDICINE', 'OT', 'SLP'])
const ONLINE_ENABLED_SBGH = new Set<string>(['PT', 'OT', 'SLP'])

// Services bookable online but ONLY as teletherapy (no in-clinic slot picker).
const TELETHERAPY_ONLY = new Set<string>(['OT', 'SLP'])

// Departments that are sub-specialties of the Medical Doctor service.
// Used to surface the "Medical Doctor" tag on the upper-right of each tile.
const MD_SUBSPECIALTIES = new Set([
  'PSYCHIATRY',
  'DEVELOPMENTAL_PEDIATRICIAN',
  'REHABILITATION_MEDICINE',
])

const SERVICE_LABELS: Record<string, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  SLP: 'Speech-Language Pathology',
  SPED: 'Special Education',
  MD: 'Medical Doctor',
  PSYCHOLOGY: 'Psychology',
  // Person-noun labels for the MD sub-specialties (more natural on tiles
  // where the patient is choosing who they want to see).
  PSYCHIATRY: 'Psychiatrist',
  DEVELOPMENTAL_PEDIATRICIAN: 'Developmental Pediatrician',
  REHABILITATION_MEDICINE: 'Rehabilitation Medicine',
  ORTHOSIS: 'Orthosis / Prosthesis',
}

const BRANCH_CONTACTS: Record<'SBEA' | 'SBGH', { name: string; phone: string; email: string; facebook: string }> = {
  SBEA: {
    name: 'East Branch',
    phone: '0917 118 9289',
    email: 'east.sandboxclinic@gmail.com',
    facebook: 'https://www.facebook.com/sandboxcliniceast',
  },
  SBGH: {
    name: 'Greenhills Branch',
    phone: '0917 770 1686',
    email: 'greenhills.sandboxclinic@gmail.com',
    facebook: 'https://www.facebook.com/sandboxclinicgreenhills',
  },
}

export default function BookStep1Page() {
  const router = useRouter()
  const [branch, setBranch] = useState<'SBEA' | 'SBGH'>('SBEA')
  const [service, setService] = useState<string | null>(null)

  useEffect(() => { if (!getSession()) router.push('/') }, [router])

  const services = branch === 'SBEA' ? SERVICES_SBEA : SERVICES_SBGH
  const enabled = branch === 'SBEA' ? ONLINE_ENABLED_SBEA : ONLINE_ENABLED_SBGH
  const isEnabled = (s: string) => enabled.has(s)

  // If the user picked a disabled service, we still let them "select" it so
  // we can render the contact-the-clinic panel. Continue button stays
  // disabled in that case.
  const selectedIsEnabled = service ? isEnabled(service) : false

  // OT & SLP are online as teletherapy only: instead of the in-clinic slot
  // picker they go to a service-type catalog (single session / evaluation /
  // packages) and pay via a per-service PayMongo checkout.
  const selectedIsTele = service ? TELETHERAPY_ONLY.has(service) : false

  function next() {
    if (!service || !selectedIsEnabled) return
    const qs = new URLSearchParams({ branch, department: service }).toString()
    router.push(selectedIsTele ? `/book/teletherapy?${qs}` : `/book/slots?${qs}`)
  }

  return (
    <div className="animate-fade-up">
      <StepHeader active={1} />

      <div className="card-static">
        <h1 className="text-[28px] leading-tight">Pick a service</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-7">Start by choosing a branch and the service you need.</p>

        <div className="mb-7">
          <div className="label">Branch</div>
          <div className="flex gap-2 flex-wrap">
            {(['SBEA', 'SBGH'] as const).map((b) => (
              <button
                key={b}
                onClick={() => { setBranch(b); setService(null) }}
                className={`pill ${branch === b ? 'pill-active' : ''}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
                {b === 'SBEA' ? 'East Branch' : 'Greenhills Branch'}
              </button>
            ))}
          </div>
        </div>

        {/* Two columns: enabled services on the left, "contact clinic" on
            the right. Previously every service was rendered into one grid
            and the visual mix of online/offline tiles was confusing.
            On phones the columns stack. */}
        {(() => {
          const enabledList = services.filter((s) => isEnabled(s))
          const disabledList = services.filter((s) => !isEnabled(s))
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="label !mb-0">Book Online</div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--moss)]">
                    {enabledList.length} available
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {enabledList.length === 0 && (
                    <div className="text-xs italic text-[color:var(--mid-gray)] px-1 py-2">
                      No services bookable online for this branch yet.
                    </div>
                  )}
                  {enabledList.map((s, i) => (
                    <ServiceTile
                      key={s}
                      s={s}
                      i={i}
                      online
                      active={service === s}
                      onClick={() => setService(s)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="label !mb-0">Contact the Clinic</div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--clay)]">
                    {disabledList.length} services
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {disabledList.length === 0 && (
                    <div className="text-xs italic text-[color:var(--mid-gray)] px-1 py-2">
                      All services at this branch are bookable online.
                    </div>
                  )}
                  {disabledList.map((s, i) => (
                    <ServiceTile
                      key={s}
                      s={s}
                      i={i}
                      online={false}
                      active={service === s}
                      onClick={() => setService(s)}
                    />
                  ))}
                </div>
              </section>
            </div>
          )
        })()}

        {/* Contact panel for disabled services */}
        {service && !selectedIsEnabled && (
          <ContactPanel branch={branch} serviceLabel={SERVICE_LABELS[service] ?? service} />
        )}

        <div className="flex justify-end mt-8">
          <button
            disabled={!service || !selectedIsEnabled}
            onClick={next}
            className="btn-cta"
          >
            {selectedIsTele ? 'Continue → Choose a service' : 'Continue → Pick a slot'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContactPanel({ branch, serviceLabel }: { branch: 'SBEA' | 'SBGH'; serviceLabel: string }) {
  const c = BRANCH_CONTACTS[branch]
  const phoneClean = c.phone.replace(/\s+/g, '')
  return (
    <div className="mt-6 rounded-2xl border border-[color:var(--paper-3)] bg-gradient-to-br from-[color:var(--paper-2)] to-white p-5 animate-slide-down">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-[color:var(--sun-tint)] text-[color:var(--clay)] flex items-center justify-center shrink-0">
          <IconInfo />
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-[color:var(--narra)]">
            {serviceLabel} isn&apos;t bookable online yet
          </h3>
          <p className="text-[13px] text-[color:var(--mid-gray)] mt-0.5">
            We&apos;re still rolling out online booking for this service. For now, please reach out to <strong className="text-[color:var(--narra)]">{c.name}</strong> through any of the channels below — our front desk will set you up.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-4" style={{ fontFamily: 'var(--font-display)' }}>
        <ContactRow
          icon={<IconPhone />}
          label="Call or SMS"
          value={c.phone}
          href={`tel:${phoneClean}`}
        />
        <ContactRow
          icon={<IconViber />}
          label="Viber"
          value={c.phone}
          href={`viber://chat?number=${encodeURIComponent('+63' + phoneClean.replace(/^0/, ''))}`}
        />
        <ContactRow
          icon={<IconMail />}
          label="Email"
          value={c.email}
          href={`mailto:${c.email}`}
        />
        <ContactRow
          icon={<IconFacebook />}
          label="Facebook"
          value="facebook.com/sandboxclinic…"
          href={c.facebook}
          external
        />
      </div>
    </div>
  )
}

function ContactRow({ icon, label, value, href, external }: { icon: React.ReactNode; label: string; value: string; href: string; external?: boolean }) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-[color:var(--paper-3)] hover:border-[color:var(--sage)] hover:shadow-[0_4px_12px_rgba(27,63,56,0.06)] transition-all"
    >
      <span className="w-9 h-9 rounded-lg bg-[color:var(--paper-2)] text-[color:var(--narra)] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--mid-gray)]">{label}</span>
        <span className="block text-[13px] font-semibold text-[color:var(--narra)] truncate">{value}</span>
      </span>
    </a>
  )
}

// Single service tile — used in both the "Book Online" and "Contact Clinic"
// columns on /book. The visual treatment changes based on the `online` flag
// (solid white card vs dashed paper-tinted card) and the selected state.
function ServiceTile({
  s, i, online, active, onClick,
}: {
  s: string
  i: number
  online: boolean
  active: boolean
  onClick: () => void
}) {
  const Icon = SERVICE_ICONS[s] ?? IconSparkle
  const showMdTag = MD_SUBSPECIALTIES.has(s)
  const showTeleTag = TELETHERAPY_ONLY.has(s)
  return (
    <button
      onClick={onClick}
      className={`text-left group rounded-2xl border-[1.5px] p-3.5 transition-all animate-fade-up stagger-${Math.min(i + 1, 7)} relative ${
        active
          ? online
            ? 'bg-[color:var(--narra)] border-transparent text-white shadow-[0_8px_20px_rgba(27,63,56,0.25)]'
            : 'bg-[color:var(--paper-2)] border-[color:var(--paper-3)] text-[color:var(--narra)]'
          : online
            ? 'bg-white border-[color:var(--paper-3)] hover:border-[color:var(--sage)] hover:shadow-[0_4px_14px_rgba(27,63,56,0.08)]'
            : 'bg-[color:var(--paper-2)]/60 border-dashed border-[color:var(--paper-3)] hover:bg-[color:var(--paper-2)]'
      }`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            active
              ? online ? 'bg-white/15 text-white' : 'bg-white/60 text-[color:var(--moss)]'
              : online ? 'bg-[color:var(--paper-2)] text-[color:var(--narra)]' : 'bg-white/60 text-[color:var(--mid-gray)]'
          }`}
        >
          <Icon />
        </div>
        <div className="flex flex-col items-end gap-1">
          {showTeleTag && (
            <span
              className={`text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${
                active && online
                  ? 'bg-white/20 text-white'
                  : 'bg-[color:var(--pale-teal)] text-[color:var(--teal)]'
              }`}
            >
              Teletherapy
            </span>
          )}
          {showMdTag && (
            <span
              className={`text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded ${
                active && online
                  ? 'bg-white/20 text-white'
                  : 'bg-[color:var(--paper-3)] text-[color:var(--mid-gray)]'
              }`}
            >
              Medical Doctor
            </span>
          )}
          {!online && (
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded bg-[color:var(--clay-tint)] text-[color:var(--clay)]">
              Contact clinic
            </span>
          )}
        </div>
      </div>
      <div className={`text-[13.5px] font-semibold leading-tight ${active && online ? 'text-white' : 'text-[color:var(--narra)]'}`}>
        {SERVICE_LABELS[s] ?? s}
      </div>
      <div className={`text-[11px] mt-0.5 ${active && online ? 'text-white/70' : 'text-[color:var(--mid-gray)]'}`}>
        {/* Department code with underscores → spaces (e.g.
            DEVELOPMENTAL PEDIATRICIAN). */}
        {s.replace(/_/g, ' ')}
      </div>
    </button>
  )
}

function StepHeader({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['Service', 'Slot', 'Confirm']
  return (
    <div className="flex items-center gap-3 mb-6" style={{ fontFamily: 'var(--font-display)' }}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const state = n === active ? 'active' : n < active ? 'done' : 'todo'
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`step-dot ${state === 'active' ? 'step-dot-active' : state === 'done' ? 'step-dot-done' : ''}`}></span>
              <span className={`text-[11.5px] uppercase tracking-[0.12em] ${state === 'active' ? 'text-[color:var(--clay)] font-semibold' : state === 'done' ? 'text-[color:var(--moss)]' : 'text-[color:var(--mid-gray)]'}`}>
                {n}. {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className="w-6 h-px bg-[color:var(--paper-3)]"></span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Mono-color SVG icons (24x24, stroke uses currentColor) ─────────────────

function SvgWrap({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

const SERVICE_ICONS: Record<string, () => React.JSX.Element> = {
  PT: IconActivity,
  OT: IconHand,
  SLP: IconMessage,
  SPED: IconBook,
  MD: IconStethoscope,
  PSYCHOLOGY: IconBrain,
  PSYCHIATRY: IconPill,
  ORTHOSIS: IconBone,
  DEVELOPMENTAL_PEDIATRICIAN: IconBaby,
  REHABILITATION_MEDICINE: IconAccessibility,
}

// PT — activity line (rehab / motion)
function IconActivity() { return <SvgWrap><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></SvgWrap> }
// OT — open hand
function IconHand() { return <SvgWrap><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-1.2-5.8-3l-3.2-5c-.5-.8-.5-2 0-3 .8-1.2 2.5-1.2 3.2 0L8 13"/></SvgWrap> }
// SLP — speech bubble with sound waves
function IconMessage() { return <SvgWrap><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h.01M12 9h.01M16 9h.01"/></SvgWrap> }
// SPED — open book
function IconBook() { return <SvgWrap><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></SvgWrap> }
// MD — stethoscope
function IconStethoscope() { return <SvgWrap><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></SvgWrap> }
// Psychology — brain
function IconBrain() { return <SvgWrap><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></SvgWrap> }
// Psychiatry — pill
function IconPill() { return <SvgWrap><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></SvgWrap> }
// Orthosis — bone
function IconBone() { return <SvgWrap><path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z"/></SvgWrap> }
// DevPed — baby
function IconBaby() { return <SvgWrap><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></SvgWrap> }
// Rehabilitation Medicine — accessibility figure (Lucide "accessibility")
function IconAccessibility() { return <SvgWrap><circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-5.87.94"/><path d="m5 8 3-3 5.5 3-2.21 3.1"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/></SvgWrap> }
// Fallback
function IconSparkle() { return <SvgWrap><path d="M12 3l1.6 4.8L18 9l-4.4 1.2L12 15l-1.6-4.8L6 9l4.4-1.2z"/></SvgWrap> }

// Contact-panel icons
function IconInfo() { return <SvgWrap><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></SvgWrap> }
function IconPhone() { return <SvgWrap><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></SvgWrap> }
function IconViber() { return <SvgWrap><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 11a4 4 0 0 1 8 0"/><path d="M11 11a1 1 0 0 1 2 0"/></SvgWrap> }
function IconMail() { return <SvgWrap><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></SvgWrap> }
function IconFacebook() { return <SvgWrap><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></SvgWrap> }
