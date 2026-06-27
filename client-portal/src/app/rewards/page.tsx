'use client'

import RewardsPanel from '@/components/RewardsPanel'

export default function RewardsPage() {
  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start animate-fade-up">
      {/* Hero */}
      <section className="md:col-span-2 md:sticky md:top-24">
        <div className="hero-gradient rounded-3xl p-8 md:p-9 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)]"></span>
              Reward Points
            </div>
            <h1 className="text-[36px] md:text-[40px] leading-[1.05] mb-4">
              Your VIP or Prepaid Card.
            </h1>
            <p className="text-white/80 text-[15px] leading-relaxed">
              Check how many reward points you have, and where you can spend them.
            </p>
          </div>
        </div>
      </section>

      {/* Lookup + result + where to spend */}
      <section className="md:col-span-3 animate-fade-up stagger-2">
        <RewardsPanel />
      </section>
    </div>
  )
}
