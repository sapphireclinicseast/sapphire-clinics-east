'use client'

import RewardsPanel from '@/components/RewardsPanel'
import { PAGE, PageHeader, DashCard, Icon, TH, TH_STYLE, TD } from '@/components/hub/ui'

export default function RewardsPage() {
  return (
    <div className={`${PAGE} animate-fade-up`}>
      <PageHeader
        size="lg"
        eyebrow="Reward Points"
        title="Your VIP or Prepaid Card."
        description="Check your points and unlock member perks with an Aura Health Rehab card."
      />

      <div className="grid md:grid-cols-5 gap-5 items-start">
      {/* Card guide */}
      <section className="md:col-span-2 space-y-5 min-w-0">
        {/* VIP Membership Card */}
        <DashCard title="VIP Membership Card" icon={<Icon name="award" size={16} />}>
          <div className="rounded-xl border border-black/5 bg-white shadow-md p-4">
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

          <p className="text-[13px] text-[color:var(--mid-gray)] leading-relaxed mt-4">
            An exclusive, tiered membership. Members enjoy service discounts that grow with their tier — plus reward points on every visit.
          </p>
          <div className="mt-3 rounded-lg overflow-x-auto" style={{ border: '1px solid var(--light-gray)' }}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th scope="col" className={TH} style={TH_STYLE}>Tier</th>
                  <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Therapy</th>
                  <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>MD · Psych</th>
                </tr>
              </thead>
              <tbody>
                {[['Silver', '25%', '5%'], ['Gold', 'up to 30%', 'up to 10%'], ['Platinum', 'up to 50%', 'up to 15%']].map((r) => (
                  <tr key={r[0]} style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <td className={`${TD} !py-2 font-semibold`} style={{ color: 'var(--charcoal)' }}>{r[0]}</td>
                    <td className={`${TD} !py-2 text-right whitespace-nowrap`}>{r[1]}</td>
                    <td className={`${TD} !py-2 text-right whitespace-nowrap`}>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[color:var(--mid-gray)] mt-2">Therapy = OT · PT · SLP · SPED. Exact discount depends on your card level.</p>
        </DashCard>

        {/* Reloadable Prepaid Card */}
        <DashCard title="Reloadable Prepaid Card" icon={<Icon name="wallet" size={16} />}>
          <div className="rounded-xl border border-black/5 bg-white shadow-md p-4">
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

          <p className="text-[13px] text-[color:var(--mid-gray)] leading-relaxed mt-4">
            A reloadable stored-value card. Load it in <strong className="text-[color:var(--narra)]">₱500</strong> increments to pay for services and products — and earn <strong className="text-[color:var(--narra)]">1 reward point for every ₱100</strong> you spend, redeemable for exclusive rewards and merchandise.
          </p>
        </DashCard>
      </section>

      {/* Lookup + result + where to spend */}
      <section className="md:col-span-3 min-w-0 animate-fade-up stagger-2">
        <RewardsPanel />
      </section>
      </div>
    </div>
  )
}
