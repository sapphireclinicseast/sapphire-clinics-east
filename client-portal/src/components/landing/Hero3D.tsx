'use client'

// Landing-page hero: dark Narra card with the SCEI booking message + status
// pill on the left, and a fade-in/fade-out rotator of real, anonymized
// positive feedback from our client satisfaction surveys on the right.
// Quotes come from /api/booking-proxy/survey-praise (proxied to the marketing
// app's /api/public/survey-praise).

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'

interface Hero3DProps {
  signedInFirstName?: string | null
}

export function Hero3D({ signedInFirstName }: Hero3DProps) {
  return (
    <Card
      className="w-full min-h-[480px] md:min-h-[520px] relative overflow-hidden border-0 rounded-3xl text-white"
      style={{
        // Narra is the brand's deepest green; matches the dark "hero
        // moment" pairing from the brand guide (Narra + Sun).
        background:
          'radial-gradient(800px 360px at 110% -10%, rgba(198,152,73,0.30), transparent 60%),' +
          'radial-gradient(700px 320px at -10% 120%, rgba(207,157,136,0.24), transparent 60%),' +
          'linear-gradient(135deg, #13262B 0%, #244952 55%, #4A8073 110%)',
      }}
    >
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="rgb(198, 152, 73)" // Sun
      />

      <div className="flex flex-col md:flex-row h-full">
        {/* Left content */}
        <div className="flex-1 p-8 md:p-10 relative z-10 flex flex-col justify-center">
          <div
            className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-[11px] uppercase tracking-[0.14em] mb-6 border border-white/10"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)] animate-pulse-ring"></span>
            Online booking
          </div>

          <h1
            className="text-[40px] md:text-[52px] leading-[1.04] tracking-[-0.02em] font-bold bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(180deg, #EDF3D9 0%, rgba(237,243,217,0.65) 100%)',
            }}
          >
            Care for the<br />whole human.
          </h1>

          <p className="mt-5 text-[15px] md:text-[16px] text-white/75 leading-relaxed max-w-md">
            Sapphire Clinics East — pick a clinician, choose your slot, and the
            front desk confirms in a single, calm flow.
          </p>

          {signedInFirstName && (
            <div className="mt-7 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-between gap-3 max-w-md">
              <div>
                <div
                  className="text-[10.5px] uppercase tracking-[0.12em] text-white/60"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Signed in as
                </div>
                <div className="font-semibold">{signedInFirstName}</div>
              </div>
              <a
                href="/book"
                className="inline-flex items-center gap-1.5 bg-[color:var(--clay)] hover:opacity-90 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-opacity"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Continue booking →
              </a>
            </div>
          )}

          <div
            className="mt-7 flex flex-col gap-2 text-[13px] text-white/80 max-w-md"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <div className="flex items-center gap-2"><Check /> Pick from real therapist + doctor schedules</div>
            <div className="flex items-center gap-2"><Check /> Up to 3 preferred slots per request</div>
            <div className="flex items-center gap-2"><Check /> Secure PayMongo downpayment</div>
          </div>
        </div>

        {/* Right content — rotating client praise */}
        <div className="flex-1 relative min-h-[220px] md:min-h-[520px] flex items-center justify-center p-8 md:p-10 z-10">
          <PraiseRotator />
        </div>
      </div>
    </Card>
  )
}

// Fallback line shown until/if no survey quotes are available. Not a
// fabricated testimonial — just brand copy.
const PRAISE_FALLBACK = [
  'Real words from the people we care for.',
]

function PraiseRotator() {
  const [quotes, setQuotes] = useState<string[]>(PRAISE_FALLBACK)
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/booking-proxy/survey-praise')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d?.quotes) && d.quotes.length) {
          setQuotes(d.quotes)
          setIdx(0)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Cross-fade: hold visible, fade out, advance, fade back in.
  useEffect(() => {
    if (quotes.length <= 1) return
    const HOLD = 5200
    const FADE = 600
    let fade: ReturnType<typeof setTimeout>
    const swap = setInterval(() => {
      setVisible(false)
      fade = setTimeout(() => {
        setIdx((i) => (i + 1) % quotes.length)
        setVisible(true)
      }, FADE)
    }, HOLD)
    return () => {
      clearInterval(swap)
      clearTimeout(fade)
    }
  }, [quotes])

  return (
    <figure className="relative max-w-sm w-full text-center">
      <div
        className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--sun)] mb-5 flex items-center justify-center gap-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)] animate-pulse-ring"></span>
        From our randomized client surveys
      </div>
      <div className="min-h-[150px] md:min-h-[200px] flex items-center justify-center">
        <blockquote
          className="text-[18px] md:text-[22px] leading-[1.4] text-[#EDF3D9] transition-opacity duration-[600ms] ease-in-out"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <span className="text-[color:var(--sun)] text-3xl leading-none align-[-0.3em] mr-0.5">“</span>
          {quotes[idx]}
          <span className="text-[color:var(--sun)] text-3xl leading-none align-[-0.3em] ml-0.5">”</span>
        </blockquote>
      </div>
      {quotes.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1.5">
          {quotes.slice(0, 8).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === idx % 8 ? 18 : 6,
                background: i === idx % 8 ? 'var(--sun)' : 'rgba(244,236,221,0.3)',
              }}
            />
          ))}
        </div>
      )}
    </figure>
  )
}

function Check() {
  return (
    <span className="inline-flex w-4 h-4 rounded-full bg-white/15 items-center justify-center text-[10px]">
      ✓
    </span>
  )
}
