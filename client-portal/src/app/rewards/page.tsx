'use client'

import RewardsPanel from '@/components/RewardsPanel'

export default function RewardsPage() {
  return (
    <div className="grid md:grid-cols-5 gap-8 md:gap-10 items-start animate-fade-up">
      {/* Hero + card guide */}
      <section className="md:col-span-2 space-y-5">
        <div className="hero-gradient rounded-3xl p-7 md:p-8 relative">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] uppercase tracking-[0.12em] mb-5" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--sun)]"></span>
              Reward Points
            </div>
            <h1 className="text-[32px] md:text-[38px] leading-[1.05] mb-3">
              Your VIP or Prepaid Card.
            </h1>
            <p className="text-white/80 text-[14.5px] leading-relaxed">
              Check your points and unlock member perks with an Aura Health Rehab card.
            </p>
          </div>
        </div>

        {/* VIP Membership Card */}
        <div className="card-static">
          <div className="rounded-2xl border border-black/5 bg-white shadow-md p-4">
            <div className="flex items-start justify-between">
              <svg viewBox="-100 -100 200 200" width="24" height="24" aria-hidden="true">
                <polygon fill="none" stroke="#244952" strokeWidth="6" points="0,-88 88,0 0,88 -88,0" />
                <polygon fill="none" stroke="#244952" strokeWidth="5" points="44,-44 44,44 -44,44 -44,-44" />
                <polygon fill="#244952" points="0,-16 16,0 0,16 -16,0" />
              </svg>
              <span className="text-[10px] font-bold tracking-[0.22em]" style={{ color: '#b8892f', fontFamily: 'var(--font-display)' }}>GOLD</span>
            </div>
            <div className="text-center py-2">
              <div className="text-[8px] tracking-[0.35em] font-bold" style={{ color: '#b8892f' }}>EXCLUSIVE</div>
              <div className="text-[24px] font-black tracking-[0.14em] leading-none text-[#1a1a1a]">VIP</div>
              <div className="text-[7.5px] tracking-[0.3em] font-bold text-slate-500 mt-0.5">MEMBER CARD</div>
            </div>
            <div className="font-mono text-[12px] tracking-[0.14em] text-slate-600">SCEI V123 456</div>
            <div className="flex items-end justify-between mt-0.5">
              <div className="text-[11px] font-bold" style={{ color: '#b8892f' }}>JUAN DELA CRUZ</div>
              <div className="text-right leading-none">
                <div className="text-[6.5px] tracking-[0.2em] text-slate-400 font-semibold">EXP</div>
                <div className="text-[10px] font-bold text-slate-600">08/29</div>
              </div>
            </div>
          </div>

          <h3 className="text-[18px] leading-tight mt-4">VIP Membership Card</h3>
          <p className="text-[13px] text-[color:var(--mid-gray)] leading-relaxed mt-1.5">
            An exclusive, tiered membership. Members enjoy service discounts that grow with their tier — plus reward points on every visit.
          </p>
          <div className="mt-3 rounded-xl overflow-hidden border border-[color:var(--paper-3)] text-[12px]">
            <div className="grid grid-cols-[1fr_auto_auto] bg-[color:var(--paper-2)] text-[10px] uppercase tracking-wide text-[color:var(--mid-gray)] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              <div className="px-3 py-1.5">Tier</div>
              <div className="px-3 py-1.5 text-right whitespace-nowrap">Therapy</div>
              <div className="px-3 py-1.5 text-right whitespace-nowrap">MD · Psych</div>
            </div>
            {[['Silver', '25%', '5%'], ['Gold', 'up to 30%', 'up to 10%'], ['Platinum', 'up to 50%', 'up to 15%']].map((r) => (
              <div key={r[0]} className="grid grid-cols-[1fr_auto_auto] border-t border-[color:var(--paper-3)]">
                <div className="px-3 py-1.5 font-semibold text-[color:var(--narra)]">{r[0]}</div>
                <div className="px-3 py-1.5 text-right whitespace-nowrap">{r[1]}</div>
                <div className="px-3 py-1.5 text-right whitespace-nowrap">{r[2]}</div>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-[color:var(--mid-gray)] mt-2">Therapy = OT · PT · SLP · SPED. Exact discount depends on your card level.</p>
        </div>

        {/* Reloadable Prepaid Card */}
        <div className="card-static">
          <div className="rounded-2xl border border-black/5 bg-white shadow-md p-4">
            <div className="flex items-start justify-between">
              <svg viewBox="0 0 104 56" width="42" height="23" aria-hidden="true">
                <path d="M6 52 A46 46 0 0 1 98 52" fill="none" stroke="#2c5545" strokeWidth="11" />
                <path d="M25 52 A27 27 0 0 1 79 52" fill="none" stroke="#8fb573" strokeWidth="11" />
                <path d="M43 52 A9 9 0 0 1 61 52" fill="none" stroke="#6f8a86" strokeWidth="11" />
              </svg>
              <div className="text-right leading-none">
                <div className="text-[7.5px] font-bold tracking-[0.14em] text-slate-600">RELOADABLE</div>
                <div className="text-[14px] font-black tracking-tight leading-none mt-0.5" style={{ color: '#b8892f' }}>PREPAID CARD</div>
              </div>
            </div>
            <div className="font-mono text-[13px] tracking-[0.16em] mt-4" style={{ color: '#244952' }}>SCEI R123 456</div>
            <div className="flex items-end justify-between mt-1">
              <div className="leading-none">
                <div className="text-[6.5px] tracking-[0.2em] text-slate-400 font-semibold">CARDHOLDER</div>
                <div className="text-[11px] font-bold mt-0.5" style={{ color: '#244952' }}>MARIA SANTOS</div>
              </div>
              <div className="text-right leading-none">
                <div className="text-[6.5px] tracking-[0.2em] text-slate-400 font-semibold">VALID THRU</div>
                <div className="text-[10px] font-bold mt-0.5" style={{ color: '#244952' }}>04/29</div>
              </div>
            </div>
          </div>

          <h3 className="text-[18px] leading-tight mt-4">Reloadable Prepaid Card</h3>
          <p className="text-[13px] text-[color:var(--mid-gray)] leading-relaxed mt-1.5">
            A reloadable stored-value card. Load it in <strong className="text-[color:var(--narra)]">₱500</strong> increments to pay for services and products — and earn <strong className="text-[color:var(--narra)]">1 reward point for every ₱100</strong> you spend, redeemable for exclusive rewards and merchandise.
          </p>
        </div>
      </section>

      {/* Lookup + result + where to spend */}
      <section className="md:col-span-3 animate-fade-up stagger-2">
        <RewardsPanel />
      </section>
    </div>
  )
}
