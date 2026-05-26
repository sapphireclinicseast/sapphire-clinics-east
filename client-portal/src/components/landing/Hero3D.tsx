'use client'

// Landing-page hero: dark Narra card with an animated 3D anatomy scene from
// Spline on the right, and the SCEI booking message + status pill on the
// left. Designed to live above the existing "Get started" auth card.
//
// Drop-in URL for the Spline scene — change via:
//   NEXT_PUBLIC_SPLINE_HERO_SCENE=https://prod.spline.design/<id>/scene.splinecode
// in client-portal's runtime env. Default is the public robot scene from
// the 21st.dev demo as a working placeholder. Swap to an anatomy scene
// (e.g. a community human-body model from app.spline.design/community).

import { SplineScene } from '@/components/ui/splite'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'

const DEFAULT_SCENE =
  process.env.NEXT_PUBLIC_SPLINE_HERO_SCENE ??
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

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
          'radial-gradient(800px 360px at 110% -10%, rgba(198,152,73,0.28), transparent 60%),' +
          'radial-gradient(700px 320px at -10% 120%, rgba(168,92,61,0.22), transparent 60%),' +
          'linear-gradient(135deg, #0F1F1D 0%, #194850 55%, #3E6B66 110%)',
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
                'linear-gradient(180deg, #F4ECDD 0%, rgba(245,240,232,0.65) 100%)',
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

        {/* Right content — Spline scene */}
        <div className="flex-1 relative min-h-[260px] md:min-h-[520px]">
          {/* Soft fade between the text column and the 3D canvas on mobile.
              On desktop the columns sit flush. */}
          <div
            className="absolute inset-0 md:hidden pointer-events-none z-10"
            style={{
              background:
                'linear-gradient(180deg, rgba(15,31,29,0.6) 0%, transparent 30%)',
            }}
          />
          <SplineScene scene={DEFAULT_SCENE} className="w-full h-full" />
        </div>
      </div>
    </Card>
  )
}

function Check() {
  return (
    <span className="inline-flex w-4 h-4 rounded-full bg-white/15 items-center justify-center text-[10px]">
      ✓
    </span>
  )
}
