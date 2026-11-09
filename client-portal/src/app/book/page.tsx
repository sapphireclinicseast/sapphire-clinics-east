'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'
import { branchLabel } from '@/lib/branch-label'
import { BookingSteps } from '@/components/booking/BookingSteps'
import {
  PAGE, PageHeader, DashCard, GroupLabel, PillTabs, Tag, Icon as KitIcon,
  BTN_PRIMARY, PRIMARY_STYLE, LABEL, LABEL_STYLE, SUBTLE_BG, FOCUS,
} from '@/components/hub/ui'

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

const BRANCH_CONTACTS: Record<'SBEA' | 'SBGH', { name: string; phone: string; email: string; facebook: string; messenger: string }> = {
  SBEA: {
    name: 'East Branch',
    phone: '0917 118 9289',
    email: 'east@sapphireclinicseast.org',
    facebook: 'https://www.facebook.com/aurahealthrehabeast',
    messenger: 'https://m.me/aurahealthrehabeast',
  },
  SBGH: {
    name: 'Greenhills Branch',
    phone: '0917 770 1686',
    email: 'greenhills@sapphireclinicseast.org',
    facebook: 'https://www.facebook.com/aurahealthrehabgh',
    messenger: 'https://m.me/aurahealthrehabgh',
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
    <div className={`${PAGE} animate-fade-up`}>
      <BookingSteps steps={['Service', 'Slot', 'Confirm']} active={1} />

      <PageHeader
        eyebrow="Book an appointment"
        title="Pick a service"
        description="Start by choosing a branch and the service you need."
      />

      <DashCard
        title="Branch and service"
        description="Services on the left book online. For the rest, our front desk will set you up."
        icon={<KitIcon name="calendar" size={16} />}
      >
        <div className="mb-6">
          <div className={LABEL} style={LABEL_STYLE} id="book-branch-label">Branch</div>
          <PillTabs
            label="Branch"
            value={branch}
            onChange={(id) => { setBranch(id as 'SBEA' | 'SBGH'); setService(null) }}
            tabs={(['SBEA', 'SBGH'] as const).map((b) => ({ id: b, label: branchLabel(b) }))}
          />
        </div>

        {/* Two columns: enabled services on the left, "contact clinic" on
            the right. On phones the columns stack. */}
        {(() => {
          const enabledList = services.filter((s) => isEnabled(s))
          const disabledList = services.filter((s) => !isEnabled(s))
          return (
            <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="min-w-0">
                <div className="mb-2">
                  <GroupLabel hint={`${enabledList.length} available`}>Book online</GroupLabel>
                </div>
                <div className="flex flex-col gap-2">
                  {enabledList.length === 0 && (
                    <div className="text-xs px-1 py-2" style={{ color: 'var(--mid-gray)' }}>
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

              <section className="min-w-0">
                <div className="mb-2">
                  <GroupLabel hint={`${disabledList.length} services`}>Contact the clinic</GroupLabel>
                </div>
                <div className="flex flex-col gap-2">
                  {disabledList.length === 0 && (
                    <div className="text-xs px-1 py-2" style={{ color: 'var(--mid-gray)' }}>
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
            <BranchQuickContact branch={branch} />
            </>
          )
        })()}

        {/* Contact panel for disabled services */}
        {service && !selectedIsEnabled && (
          <ContactPanel branch={branch} serviceLabel={SERVICE_LABELS[service] ?? service} />
        )}

        <div className="flex justify-end mt-6 pt-4" style={{ borderTop: '1px solid var(--light-gray)' }}>
          <button
            type="button"
            disabled={!service || !selectedIsEnabled}
            onClick={next}
            className={`${BTN_PRIMARY} max-sm:w-full max-sm:h-11`}
            style={PRIMARY_STYLE}
          >
            {selectedIsTele ? 'Continue — Choose a service' : 'Continue — Pick a slot'}
            <KitIcon name="chevronRight" size={16} />
          </button>
        </div>
      </DashCard>
    </div>
  )
}

function BranchQuickContact({ branch }: { branch: 'SBEA' | 'SBGH' }) {
  const c = BRANCH_CONTACTS[branch]
  const phoneClean = c.phone.replace(/\s+/g, '')
  const viber = `viber://chat?number=${encodeURIComponent('+63' + phoneClean.replace(/^0/, ''))}`
  // Messenger / Viber keep their own brand colours so they read at a glance.
  const pill = `inline-flex items-center gap-1.5 h-9 rounded-lg px-3.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity ${FOCUS}`
  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--light-gray)' }}>
      <p className="text-xs mb-2.5" style={{ color: 'var(--mid-gray)' }}>Prefer to message us? Contact {c.name} directly — our front desk will help you book.</p>
      <div className="flex flex-wrap gap-2">
        <a href={c.messenger} target="_blank" rel="noreferrer" className={pill} style={{ background: '#0A7CFF' }} aria-label={`Message ${c.name} on Messenger`}>
          <IconMessengerSolid /> Messenger
        </a>
        <a href={viber} className={pill} style={{ background: '#7360F2' }} aria-label={`Chat with ${c.name} on Viber`}>
          <IconViberSolid /> Viber
        </a>
      </div>
    </div>
  )
}

function ContactPanel({ branch, serviceLabel }: { branch: 'SBEA' | 'SBGH'; serviceLabel: string }) {
  const c = BRANCH_CONTACTS[branch]
  const phoneClean = c.phone.replace(/\s+/g, '')
  return (
    <div role="status" className="mt-6 rounded-xl p-4 sm:p-5 animate-slide-down" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FBF3E8', color: '#7A4E21' }}>
          <IconInfo />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-tight tracking-normal" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {serviceLabel} isn&apos;t bookable online yet
          </h3>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--mid-gray)' }}>
            We&apos;re still rolling out online booking for this service. For now, please reach out to <strong style={{ color: 'var(--charcoal)' }}>{c.name}</strong> through any of the channels below — our front desk will set you up.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
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
          value={c.facebook.replace(/^https?:\/\/(www\.)?/, '')}
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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white transition-colors hover:bg-[color:var(--paper)] min-w-0 ${FOCUS}`}
      style={{ border: '1px solid var(--light-gray)' }}
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`${LABEL} !mb-0`} style={LABEL_STYLE}>{label}</span>
        <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--charcoal)' }}>{value}</span>
      </span>
    </a>
  )
}

// Single service tile — used in both the "Book online" and "Contact the
// clinic" columns on /book. Same choice-tile treatment as the Class Portal's
// enrollment picker: a radio mark plus a heavier teal border when selected,
// and a dashed border for services that are booked through the clinic.
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
  const style: React.CSSProperties = active
    ? { background: 'var(--moss-tint)', border: '1.5px solid var(--teal)' }
    : online
    ? { background: '#fff', border: '1.5px solid var(--light-gray)' }
    : { background: SUBTLE_BG, border: '1.5px dashed var(--light-gray)' }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl p-3 transition-colors animate-fade-up stagger-${Math.min(i + 1, 7)} min-w-0 ${active ? '' : 'hover:bg-[color:var(--paper)]'} ${FOCUS}`}
      style={style}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={online
            ? { background: active ? 'var(--deep-teal)' : 'var(--pale-teal)', color: active ? '#fff' : 'var(--deep-teal)' }
            : { background: '#fff', color: 'var(--mid-gray)', border: '1px solid var(--light-gray)' }}
        >
          <Icon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="block text-sm font-semibold leading-snug" style={{ fontFamily: 'var(--font-display)', color: active ? 'var(--deep-teal)' : 'var(--charcoal)' }}>
              {SERVICE_LABELS[s] ?? s}
            </span>
            <span aria-hidden className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ border: `1.5px solid ${active ? 'var(--deep-teal)' : 'var(--light-gray)'}`, background: '#fff' }}>
              {active && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--deep-teal)' }} />}
            </span>
          </span>
          <span className="block text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            {/* Department code with underscores → spaces (e.g.
                DEVELOPMENTAL PEDIATRICIAN). */}
            {s.replace(/_/g, ' ')}
          </span>
          {(showTeleTag || showMdTag || !online) && (
            <span className="flex flex-wrap gap-1 mt-1.5">
              {showTeleTag && <Tag tone="brand">Teletherapy</Tag>}
              {showMdTag && <Tag>Medical Doctor</Tag>}
              {!online && <Tag tone="warn">Contact clinic</Tag>}
            </span>
          )}
          {showTeleTag && (
            <span className="block text-[11px] mt-1.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>
              Online sessions are teletherapy. For face-to-face sessions, please contact the clinic branch.
            </span>
          )}
        </span>
      </div>
    </button>
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
function IconMessengerSolid() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="16" height="16"><path d="M12 2C6.5 2 2 6.13 2 11.2c0 2.9 1.44 5.48 3.7 7.17V22l3.38-1.85c.9.25 1.86.39 2.92.39 5.5 0 10-4.13 10-9.2S17.5 2 12 2zm.98 12.39l-2.54-2.71-4.96 2.71 5.45-5.79 2.6 2.71 4.9-2.71-5.45 5.79z"/></svg> }
function IconViberSolid() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="16" height="16"><path d="M12 2C6.7 2 2.4 5.9 2.4 10.7c0 2 .8 3.9 2.1 5.4-.1 1.1-.5 2.5-1.3 3.5 1.5-.2 2.8-.8 3.7-1.4 1.4.6 2.9.9 4.5.9 5.3 0 9.6-3.9 9.6-8.7S17.3 2 12 2zm4.7 12.2c-.3.7-1.5 1.3-2.3 1.2-.6-.1-1.5-.3-3.3-1.1-2.6-1.1-4.2-3.8-4.4-4-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.7 1.8.1.1.1.3 0 .4l-.3.5c-.1.2-.3.3-.1.6.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1.2-.2.6-.7.8-.9.1-.2.3-.2.5-.1.2.1 1.3.6 1.5.8.2.1.4.2.4.3.1.1.1.6-.1 1.2z"/></svg> }
