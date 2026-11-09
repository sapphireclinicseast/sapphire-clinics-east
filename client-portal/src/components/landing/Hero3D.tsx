'use client'

// Landing-page brand panel — the LEFT half of the landing's Get-started card,
// in the Class Portal sign-in brand-panel treatment (class-portal/src/app/
// sign-in/page.tsx): dark Narra→Moss gradient, mark + tagline, headline,
// check list, and a quiet footer strip — here the rotator of real, anonymized
// praise from our client satisfaction surveys, with the waving alpaca.
// Quotes come from /api/booking-proxy/survey-praise.

import { useEffect, useState } from 'react'
import { Spotlight } from '@/components/ui/spotlight'
import { Icon } from '@/components/hub/ui'

const POINTS = [
  'View your patient profile at a glance',
  'Book a session and pay securely via PayMongo',
  'Revisit your full session history anytime',
  'Check your Reward Points available',
  'Give feedback and raise concerns that go straight to the HR Department',
]

export function Hero3D() {
  return (
    <aside
      className="h-full w-full min-h-[480px] lg:min-h-[600px] relative overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(800px 360px at 110% -10%, rgba(198,152,73,0.30), transparent 60%),' +
          'radial-gradient(700px 320px at -10% 120%, rgba(207,157,136,0.24), transparent 60%),' +
          'linear-gradient(135deg, #13262B 0%, #244952 55%, #4A8073 110%)',
      }}
    >
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgb(198, 152, 73)" />

      <div className="relative z-10 flex flex-col h-full gap-8 px-6 py-8 sm:px-10 sm:py-10">
        <div>
          {/* Aura cream arch mark on the left, brand tagline on its right */}
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/aura-mark-cream.png" alt="Aura Health Rehab" className="h-12 w-auto shrink-0" />
            <div className="text-[13px] font-semibold leading-[1.35] text-white/90" style={{ fontFamily: 'var(--font-display)' }}>
              <div>Feeling Seen.</div>
              <div>Finding Footing.</div>
              <div>Moving Forward.</div>
            </div>
          </div>

          <h1
            className="mt-9 text-[34px] sm:text-[38px] xl:text-[42px] font-bold leading-[1.06] tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: '#ffffff' }}
          >
            Care for the<br />whole human.
          </h1>

          <p className="mt-4 text-[15px] leading-relaxed text-white/90 max-w-md">
            Aura Health Rehab — keep your profile and full session history in one calm place.
          </p>

          <ul className="mt-7 space-y-3 text-[13.5px] text-white/90 max-w-md">
            {POINTS.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Icon name="check" size={16} className="mt-0.5 text-white/80" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Praise rotator pinned to the bottom, beside the alpaca. */}
        <div className="mt-auto pt-6 border-t border-white/20 md:pr-[190px]">
          <PraiseRotator />
        </div>
      </div>

      {/* Waving alpaca mascot in the lower-right, Aura logo on its body */}
      <AlpacaMascot className="hidden md:block absolute right-3 bottom-3 w-[176px] z-[5] pointer-events-none" />
    </aside>
  )
}

function AlpacaMascot({ className = '' }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {/* Inner wrapper is the positioning context for the logo overlay. */}
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/waving-alpaca.svg"
          alt=""
          className="w-full h-auto block drop-shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
        />
        {/* Aura arch mark centred on the alpaca's belly (no wordmark) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aura-mark.png"
          alt="Aura Health Rehab"
          className="absolute"
          style={{ left: '53%', top: '62%', width: '22%', transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  )
}

// Fallback line shown until/if no survey quotes are available. Not a
// fabricated testimonial — just brand copy.
const PRAISE_FALLBACK = ['Real words from the people we care for.']

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
        if (Array.isArray(d?.quotes)) {
          // Don't feature quotes that mention the old "Sandbox" brand name.
          const filtered = d.quotes.filter(
            (q: unknown): q is string => typeof q === 'string' && !/sandbox/i.test(q),
          )
          if (filtered.length) {
            setQuotes(filtered)
            setIdx(0)
          }
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
    <figure className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 p-4">
      <figcaption
        className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--sun)] mb-2.5 flex items-center gap-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)] animate-pulse-ring"></span>
        From our random client surveys
      </figcaption>
      <blockquote
        className="text-[14px] sm:text-[15px] leading-[1.45] text-[#EDF3D9] transition-opacity duration-[600ms] ease-in-out min-h-[3.2em]"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="text-[color:var(--sun)] text-2xl leading-none align-[-0.3em] mr-0.5">“</span>
        {quotes[idx]}
        <span className="text-[color:var(--sun)] text-2xl leading-none align-[-0.3em] ml-0.5">”</span>
      </blockquote>
    </figure>
  )
}
