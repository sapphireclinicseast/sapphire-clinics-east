'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageSquareHeart, MessageSquareWarning, Gift, ArrowLeft, Search, X } from 'lucide-react'
import CheckoutScreen, { type CheckoutPayload } from './CheckoutScreen'

/**
 * The three things a patient can do while they are at the counter.
 *
 * Built for a shared tablet: large touch targets, no scrolling on the home
 * screen, and every sub-screen returns home on its own so the device is never
 * left showing one person's details to the next in the queue.
 */

interface Invitation { id: string; name: string; clinician: string; time: string; surveyUrl: string }
interface FeedData {
  branch: { slug: string; name: string; shortName: string }
  survey: { count: number; invitations: Invitation[]; error: string | null }
  complaintFormUrl: string
  rewardPointsUrl: string
  /** Set while the till is ringing up a sale at this branch. */
  checkout: CheckoutPayload | null
}

type Screen = 'home' | 'survey' | 'embed'

/** Idle timeout — the tablet returns to the welcome screen by itself. */
const IDLE_MS = 60_000

export default function PatientViewClient({ slug, branchName, shortName }: { slug: string; branchName: string; shortName: string }) {
  const [data, setData] = useState<FeedData | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  // A page from another of our sites, shown inside this one. The tablet is a
  // kiosk: opening tabs it cannot close, or navigating away with no way back,
  // both end with someone having to fix the device by hand.
  const [embed, setEmbed] = useState<{ url: string; title: string } | null>(null)
  const openEmbed = (url: string | undefined, title: string) => {
    if (!url) return
    setEmbed({ url, title })
    setScreen('embed')
  }

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/patient-view/${slug}`, { cache: 'no-store' })
      if (r.ok) setData(await r.json())
    } catch { /* keep whatever is on screen rather than blanking it */ }
  }, [slug])

  useEffect(() => {
    load()
    // Fast enough that the bill appears to follow the cashier, slow enough to
    // be a negligible load: one small request per tablet per two seconds.
    const t = setInterval(load, 2_000)
    return () => clearInterval(t)
  }, [load])

  const checkout = data?.checkout ?? null

  // When the sale finishes, leave the patient on the welcome screen rather than
  // on whatever they had open before their bill appeared.
  useEffect(() => { if (!checkout) setScreen('home') }, [checkout])

  useEffect(() => { if (screen !== 'embed') setEmbed(null) }, [screen])

  // Any sub-screen holds someone's name or points; don't leave it up.
  useEffect(() => {
    if (screen === 'home' || checkout) return
    let timer = setTimeout(() => setScreen('home'), IDLE_MS)
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setScreen('home'), IDLE_MS) }
    window.addEventListener('pointerdown', bump)
    window.addEventListener('keydown', bump)
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump) }
  }, [screen, checkout])

  const surveyCount = data?.survey.count ?? 0

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#f6f9f4 0%,#eef4ef 45%,#e9f1ee 100%)' }}>
      <Header branchName={branchName} shortName={shortName} onHome={() => setScreen('home')} showBack={screen !== 'home' && !checkout} />

      <div className="flex-1 flex items-center justify-center px-6 pb-10">
        {/* A live checkout outranks everything: while the cashier is ringing up
            a sale, that is the only thing this screen should be showing. */}
        {checkout ? (
          <CheckoutScreen slug={slug} data={checkout} />
        ) : (<>
        {screen === 'home' && (
          <div className="w-full max-w-5xl">
            <div className="text-center mb-8">
              {/* The mark, at a size a patient actually registers — this screen
                  is the longest look most of them get at it. */}
              <img
                src="/aura-logo.png"
                alt="Aura Health Rehab"
                className="mx-auto mb-5 h-20 sm:h-24 w-auto"
              />
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: '#1c3f38', fontFamily: 'var(--font-display)' }}>
                Welcome to Aura Health Rehab
              </h1>
              <p className="mt-3 text-base sm:text-lg" style={{ color: '#5b7a72' }}>
                While you are with us, here is what you can do on this tablet.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Card
                tone="teal"
                icon={<MessageSquareHeart size={30} />}
                title="Share your experience"
                body={
                  surveyCount > 0
                    ? `We invited ${surveyCount} ${surveyCount === 1 ? 'patient' : 'patients'} today. Tap to see if you are one of them.`
                    : 'We invite a few patients each day. There are no invitations at the moment.'
                }
                cta={surveyCount > 0 ? 'Find my name' : 'No invitations today'}
                disabled={surveyCount === 0}
                badge={surveyCount > 0 ? `${surveyCount} today` : undefined}
                onClick={() => setScreen('survey')}
              />
              <Card
                tone="amber"
                icon={<MessageSquareWarning size={30} />}
                title="Tell us what went wrong"
                body="Something not right? Tell us directly and privately. Every message is read by our clinic management."
                cta="Open the form"
                onClick={() => openEmbed(data?.complaintFormUrl, 'Tell us what went wrong')}
              />
              <Card
                tone="violet"
                icon={<Gift size={30} />}
                title="Check your reward points"
                body="For VIP and Prepaid Card holders. Check your points balance and what you can redeem."
                cta="Check my points"
                onClick={() => openEmbed(data?.rewardPointsUrl, 'Your reward points')}
              />
            </div>

            {data?.survey.error && (
              <p className="text-center text-xs mt-6" style={{ color: '#9a7b3f' }}>{data.survey.error}</p>
            )}
          </div>
        )}

        {screen === 'survey' && (
          <SurveyScreen
            invitations={data?.survey.invitations ?? []}
            onOpen={(inv) => openEmbed(inv.surveyUrl, 'Share your experience')}
          />
        )}
        {screen === 'embed' && embed && (
          <div className="w-full h-full max-w-5xl flex flex-col" style={{ minHeight: '70vh' }}>
            <div className="flex-1 rounded-3xl overflow-hidden bg-white" style={{ boxShadow: '0 14px 40px rgba(16,52,45,0.09)' }}>
              <iframe
                src={embed.url}
                title={embed.title}
                className="w-full h-full"
                style={{ border: 0, minHeight: '70vh' }}
                // Enough to let our own pages work; not enough for a framed
                // page to navigate the tablet away from the kiosk.
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
              />
            </div>
          </div>
        )}
        </>)}
      </div>

      <footer className="pb-6 text-center text-xs" style={{ color: '#8aa39b' }}>
        Sapphire Clinics East Incorporated · {shortName}
      </footer>
    </main>
  )
}

/* ── Chrome ──────────────────────────────────────────────────────────────── */

function Header({ branchName, shortName, onHome, showBack }: { branchName: string; shortName: string; onHome: () => void; showBack: boolean }) {
  return (
    <header className="flex items-center justify-between px-6 sm:px-10 py-6">
      <div className="flex items-center gap-3">
        {/* Aura arch logomark */}
        <svg width="54" height="29" viewBox="0 0 220 116" role="img" aria-label="Aura Health Rehab" className="shrink-0">
          <path d="M10,110 A100,100 0 0 1 210,110 L188,110 A78,78 0 0 0 32,110 Z" fill="#296354" />
          <path d="M32,110 A78,78 0 0 1 188,110 L182,110 A72,72 0 0 0 38,110 Z" fill="#ffffff" />
          <path d="M38,110 A72,72 0 0 1 182,110 L160,110 A50,50 0 0 0 60,110 Z" fill="#8EAF74" />
          <path d="M60,110 A50,50 0 0 1 160,110 L154,110 A44,44 0 0 0 66,110 Z" fill="#ffffff" />
          <path d="M66,110 A44,44 0 0 1 154,110 L132,110 A22,22 0 0 0 88,110 Z" fill="#6E8E8E" />
          <path d="M88,110 A22,22 0 0 1 132,110 Z" fill="#ffffff" />
        </svg>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: '#1c3f38' }}>{branchName}</p>
          <p className="text-[11px]" style={{ color: '#7d968e' }}>{shortName}</p>
        </div>
      </div>
      {showBack && (
        <button onClick={onHome}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold bg-white shadow-sm"
          style={{ color: '#1c3f38' }}>
          <ArrowLeft size={16} /> Back
        </button>
      )}
    </header>
  )
}

const TONES = {
  teal:   { bg: '#0f766e', soft: '#e6f2ef', ring: '#0f766e' },
  amber:  { bg: '#b45309', soft: '#fdf3e3', ring: '#b45309' },
  violet: { bg: '#6d5192', soft: '#f1ecf7', ring: '#6d5192' },
} as const

function Card({ tone, icon, title, body, cta, badge, disabled, onClick }: {
  tone: keyof typeof TONES
  icon: React.ReactNode
  title: string
  body: string
  cta: string
  badge?: string
  disabled?: boolean
  onClick: () => void
}) {
  const t = TONES[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group text-left rounded-3xl bg-white p-7 flex flex-col shadow-sm transition-transform disabled:opacity-60 disabled:cursor-default enabled:hover:-translate-y-1 enabled:active:translate-y-0"
      style={{ minHeight: 300, boxShadow: '0 10px 30px rgba(16,52,45,0.07)' }}>
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center justify-center rounded-2xl"
          style={{ width: 60, height: 60, background: t.soft, color: t.bg }}>
          {icon}
        </span>
        {badge && (
          <span className="px-3 py-1 rounded-full text-[11px] font-bold" style={{ background: t.soft, color: t.bg }}>
            {badge}
          </span>
        )}
      </div>
      <h2 className="text-xl font-bold mt-5" style={{ color: '#1c3f38' }}>{title}</h2>
      <p className="text-sm mt-2 leading-relaxed flex-1" style={{ color: '#5b7a72' }}>{body}</p>
      <span className="mt-5 inline-flex items-center justify-center px-5 py-3 rounded-2xl text-sm font-semibold text-white"
        style={{ background: disabled ? '#b9c8c3' : t.bg }}>
        {cta}
      </span>
    </button>
  )
}

/* ── Survey ──────────────────────────────────────────────────────────────── */

function SurveyScreen({ invitations, onOpen }: { invitations: Invitation[]; onOpen: (inv: Invitation) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  // Names are only revealed on this screen, never on the welcome screen, and
  // typing narrows the list so the whole day's roster is not left on display.
  const shown = needle ? invitations.filter(i => i.name.toLowerCase().includes(needle)) : invitations

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-3xl font-bold text-center" style={{ color: '#1c3f38' }}>Find your name</h1>
      <p className="text-center mt-2 text-sm" style={{ color: '#5b7a72' }}>
        We invite a few patients each day at random. If your name is here, we would love to hear how today went.
      </p>

      <div className="relative mt-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#8aa39b' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Start typing your name…"
          className="w-full pl-12 pr-11 py-4 rounded-2xl border-0 text-base outline-none bg-white shadow-sm"
          style={{ color: '#1c3f38' }} />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2">
            <X size={16} style={{ color: '#8aa39b' }} />
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2 max-h-[46vh] overflow-auto">
        {shown.length === 0 && (
          <p className="text-center py-10 text-sm" style={{ color: '#8aa39b' }}>
            {invitations.length === 0
              ? 'There are no invitations at the moment.'
              : 'No match — please check the spelling, or ask our front desk.'}
          </p>
        )}
        {shown.map(i => (
          <button key={i.id} onClick={() => onOpen(i)}
            className="w-full text-left flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-white shadow-sm">
            <span>
              <span className="block font-semibold" style={{ color: '#1c3f38' }}>{i.name}</span>
              <span className="block text-xs mt-0.5" style={{ color: '#8aa39b' }}>
                {[i.time, i.clinician].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="px-4 py-2 rounded-xl text-xs font-semibold text-white shrink-0" style={{ background: '#0f766e' }}>
              That&apos;s me
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
