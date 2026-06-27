'use client'

// Landing-page hero — a tall vertical card for the LEFT column, so the sign-in
// card sits beside it on the right (no scrolling to reach sign-in). Carries the
// Aura Health Rehab brand: dark Narra→Moss gradient with the logo lockup,
// "Care for the whole human." headline, value props, and a compact rotator of
// real, anonymized praise from our client satisfaction surveys.
// Quotes come from /api/booking-proxy/survey-praise.

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'

export function Hero3D() {
  return (
    <Card
      className="w-full h-full min-h-[480px] relative overflow-hidden border-0 rounded-3xl text-white"
      style={{
        background:
          'radial-gradient(800px 360px at 110% -10%, rgba(198,152,73,0.30), transparent 60%),' +
          'radial-gradient(700px 320px at -10% 120%, rgba(207,157,136,0.24), transparent 60%),' +
          'linear-gradient(135deg, #13262B 0%, #244952 55%, #4A8073 110%)',
      }}
    >
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgb(198, 152, 73)" />

      <div className="relative z-10 flex flex-col h-full p-8 md:p-10">
        {/* Aura cream arch mark (no wordmark), centred */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/aura-mark-cream.png"
          alt="Aura Health Rehab"
          className="h-16 w-auto self-center mb-2"
        />

        <h1
          className="mt-6 text-[38px] md:text-[46px] leading-[1.04] tracking-[-0.02em] font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: 'linear-gradient(180deg, #EDF3D9 0%, rgba(237,243,217,0.65) 100%)' }}
        >
          Care for the<br />whole human.
        </h1>

        <p className="mt-5 text-[15px] md:text-[16px] text-white/75 leading-relaxed max-w-md">
          Aura Health Rehab — keep your profile and full session history in one calm place.
        </p>

        <div
          className="mt-7 flex flex-col gap-2 text-[13px] text-white/85 max-w-md"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <div className="flex items-center gap-2"><Check /> View your patient profile at a glance</div>
          <div className="flex items-center gap-2"><Check /> Book a session and pay securely via PayMongo</div>
          <div className="flex items-center gap-2"><Check /> Revisit your full session history anytime</div>
          <div className="flex items-center gap-2"><Check /> Check your Reward Points available</div>
          <div className="flex items-start gap-2"><span className="mt-0.5"><Check /></span> Give feedback and raise concerns that go straight to the HR Department</div>
        </div>

        {/* Compact praise rotator pinned to the bottom of the card */}
        <div className="mt-auto pt-8 max-w-[280px]">
          <PraiseRotator />
        </div>
      </div>

      {/* Waving alpaca mascot in the lower-right, Aura logo on its body */}
      <AlpacaMascot className="hidden md:block absolute right-3 bottom-3 w-[228px] z-[5] pointer-events-none" />
    </Card>
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
          style={{ left: '53%', top: '62%', width: '32%', transform: 'translate(-50%, -50%)' }}
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
    <figure className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
      <figcaption
        className="text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--sun)] mb-2.5 flex items-center gap-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)] animate-pulse-ring"></span>
        From our random client surveys
      </figcaption>
      <blockquote
        className="text-[15px] md:text-[16px] leading-[1.45] text-[#EDF3D9] transition-opacity duration-[600ms] ease-in-out min-h-[3.2em]"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <span className="text-[color:var(--sun)] text-2xl leading-none align-[-0.3em] mr-0.5">“</span>
        {quotes[idx]}
        <span className="text-[color:var(--sun)] text-2xl leading-none align-[-0.3em] ml-0.5">”</span>
      </blockquote>
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
