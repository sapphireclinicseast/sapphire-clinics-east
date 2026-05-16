'use client'

import { useState } from 'react'

interface WalletInfo {
  card: string
  cardType: 'VIP' | 'PREPAID_CARD'
  vipTier: string | null
  branch: string
  rewardPoints: number
  balance: number
  holderInitials: string
}

export default function RewardsPage() {
  const [card, setCard] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)

  async function lookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = card.trim().toUpperCase()
    if (!trimmed) return
    setBusy(true); setErr(null); setWallet(null)
    try {
      const r = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: trimmed }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error ?? 'Lookup failed')
      setWallet(data as WalletInfo)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

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

      {/* Lookup + result */}
      <section className="md:col-span-3 space-y-5 animate-fade-up stagger-2">
        <div className="card-static">
          <h2 className="text-[22px] leading-tight">Look up your card</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-5">
            Enter the number on your <strong>VIP Card</strong> (e.g. <code className="font-mono text-[12px]">SCEI-V-148592</code>) or <strong>Prepaid Card</strong>.
          </p>

          <form onSubmit={lookup} className="flex gap-2 flex-wrap">
            <input
              required
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder="SCEI-V-XXXXXX"
              className="input flex-1 min-w-[200px] font-mono"
              style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
            />
            <button type="submit" disabled={busy || !card.trim()} className="btn-primary">
              {busy ? 'Checking…' : 'Check'}
            </button>
          </form>

          {err && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-800 animate-fade-in">
              {err}
            </div>
          )}

          {wallet && (
            <div className="mt-5 animate-fade-up">
              <div className="rounded-2xl overflow-hidden border border-[color:var(--paper-3)]">
                {/* Card header */}
                <div
                  className="px-5 py-4 text-white relative"
                  style={{
                    background:
                      wallet.cardType === 'VIP'
                        ? 'linear-gradient(135deg, var(--narra), var(--moss))'
                        : 'linear-gradient(135deg, var(--moss), var(--sage))',
                  }}
                >
                  <div className="text-[10.5px] uppercase tracking-[0.16em] opacity-80" style={{ fontFamily: 'var(--font-display)' }}>
                    {wallet.cardType === 'VIP' ? `VIP Card${wallet.vipTier ? ` · ${wallet.vipTier}` : ''}` : 'Prepaid Card'}
                  </div>
                  <div className="font-mono text-[18px] tracking-[0.08em] mt-0.5">{wallet.card}</div>
                  <div className="text-[11.5px] opacity-80 mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                    Holder: {wallet.holderInitials || '—'} · Branch: {wallet.branch}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 divide-x divide-[color:var(--paper-3)] bg-white">
                  <div className="p-5 text-center">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                      Reward Points
                    </div>
                    <div className="text-[34px] font-semibold text-[color:var(--clay)] leading-tight mt-1">
                      {wallet.rewardPoints.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-5 text-center">
                    <div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--mid-gray)]" style={{ fontFamily: 'var(--font-display)' }}>
                      Balance
                    </div>
                    <div className="text-[34px] font-semibold text-[color:var(--narra)] leading-tight mt-1">
                      ₱{wallet.balance.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Where to spend */}
        <div className="card-static">
          <h2 className="text-[22px] leading-tight">Where to use your points</h2>
          <p className="text-sm text-[color:var(--mid-gray)] mt-1 mb-5">
            Your reward points are redeemable at three places:
          </p>

          <div className="space-y-3">
            <UseCard
              title="Clinic seminars"
              body="Attend Sapphire Clinics East seminars that accept reward points as payment. Browse upcoming events on our seminars site."
              href="https://seminars.sapphireclinicseast.org"
              cta="Visit seminars.sapphireclinicseast.org →"
              icon={<IconTicket />}
            />
            <UseCard
              title="Verdana Store — therapy toys"
              body="Our partner brand inside the clinic. Shop occupational-therapy toys, sensory tools, and learning aids."
              href="https://verdanarehab.com/"
              cta="Visit verdanarehab.com →"
              icon={<IconBag />}
            />
            <UseCard
              title="Clinic merchandise"
              body="SCEI / Sandbox-branded merchandise — apparel, mugs, and seasonal items — handpicked by the clinic."
              href="https://verdanarehab.com/collections/merchandise"
              cta="Shop merchandise →"
              icon={<IconShirt />}
            />
          </div>

          <p className="text-[11.5px] text-[color:var(--mid-gray)] mt-5" style={{ fontFamily: 'var(--font-display)' }}>
            Point redemption is processed at the clinic counter / partner checkout — please present your card.
          </p>
        </div>
      </section>
    </div>
  )
}

function UseCard({ title, body, href, cta, icon }: { title: string; body: string; href: string; cta: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-4 p-4 rounded-2xl border border-[color:var(--paper-3)] bg-white hover:border-[color:var(--sage)] hover:shadow-[0_6px_20px_rgba(27,63,56,0.08)] transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-[color:var(--paper-2)] text-[color:var(--narra)] flex items-center justify-center shrink-0 group-hover:bg-[color:var(--sage-tint)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px] text-[color:var(--narra)]">{title}</div>
        <p className="text-[13px] text-[color:var(--mid-gray)] mt-0.5">{body}</p>
        <div className="text-[12px] font-semibold text-[color:var(--clay)] mt-2" style={{ fontFamily: 'var(--font-display)' }}>{cta}</div>
      </div>
    </a>
  )
}

// Inline mono-color SVG icons (24px stroke icons, currentColor).
function IconTicket() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v2a2 2 0 0 0 0 4v2a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2a2 2 0 0 0 0-4z"/>
      <path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>
    </svg>
  )
}
function IconBag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}
function IconShirt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.4 14.5 16 10V4M3.6 14.5 8 10V4M8 4l4 3 4-3M8 4H6L2 8l3 3"/><path d="M16 4h2l4 4-3 3"/><path d="M9 21h6"/><path d="M9 14v7"/><path d="M15 14v7"/>
    </svg>
  )
}
