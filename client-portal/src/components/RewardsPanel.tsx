'use client'

// Reward-points card lookup + "where to spend" — shared by the standalone
// /rewards page and the signed-in portal "Reward Points" section.
import { useState } from 'react'
import {
  DashCard, KpiCard, Banner, Icon, CONTROL, CONTROL_STYLE, BTN_PRIMARY, PRIMARY_STYLE, TR_STYLE, SUBTLE_BG, FOCUS,
} from '@/components/hub/ui'

interface WalletInfo {
  card: string
  cardType: 'VIP' | 'PREPAID_CARD'
  vipTier: string | null
  branch: string
  rewardPoints: number
  balance: number
  holderInitials: string
}

// Branch enums come back as SANDBOX_EAST / SANDBOX_GREENHILLS / ALL.
function prettifyBranch(b: string): string {
  if (!b) return '—'
  if (b === 'ALL') return 'All branches'
  return b
    .split('_')
    .filter(Boolean)
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ')
}

export default function RewardsPanel() {
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
    <div className="space-y-5">
      <DashCard
        title="Look up your card"
        description={<>Enter the number on your <strong>VIP Card</strong> (e.g. <code className="font-mono text-[11px]">SCEI-V-148592</code>) or <strong>Prepaid Card</strong>.</>}
        icon={<Icon name="search" size={16} />}
      >
        <form onSubmit={lookup} className="flex gap-2 flex-wrap">
          <input
            required
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="SCEI-V-XXXXXX"
            aria-label="Card number"
            className={`${CONTROL} flex-1 min-w-[180px] font-mono`}
            style={{ ...CONTROL_STYLE, textTransform: 'uppercase', letterSpacing: '0.04em' }}
          />
          <button type="submit" disabled={busy || !card.trim()} className={BTN_PRIMARY} style={PRIMARY_STYLE}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </form>

        {err && <div className="mt-4"><Banner tone="error">{err}</Banner></div>}

        {wallet && (
          <div className="mt-5 animate-fade-up rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
            <div className="px-4 sm:px-5 py-4 text-white" style={{ background: 'var(--deep-teal)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)', color: '#CBDAB5' }}>
                  {wallet.cardType === 'VIP' ? `VIP Card${wallet.vipTier ? ` · ${wallet.vipTier}` : ''}` : 'Prepaid Card'}
                </span>
              </div>
              <div className="font-mono text-[17px] tracking-[0.08em] mt-1 [overflow-wrap:anywhere]">{wallet.card}</div>
              <div className="text-[11.5px] text-white/75 mt-1">
                Holder: {wallet.holderInitials || '—'} · Branch: {prettifyBranch(wallet.branch)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 p-3" style={{ background: SUBTLE_BG }}>
              <KpiCard label="Reward Points" value={wallet.rewardPoints.toLocaleString()} accent="var(--clay)" icon={<Icon name="award" size={16} />} />
              <KpiCard label="Balance" value={`₱${wallet.balance.toLocaleString()}`} icon={<Icon name="wallet" size={16} />} />
            </div>
          </div>
        )}
      </DashCard>

      <DashCard
        title="Where to use your points"
        description="Your reward points are redeemable at three places:"
        icon={<Icon name="tag" size={16} />}
        flush
        footer="Point redemption is processed at the clinic counter / partner checkout — please present your card."
      >
        <ul>
          <UseCard
            first
            title="Clinic seminars"
            body="Attend Aura Health Rehab seminars that accept reward points as payment. Browse upcoming events on our seminars site."
            href="https://institute.sapphireclinicseast.org"
            cta="Visit institute.sapphireclinicseast.org"
            icon={<IconTicket />}
          />
          <UseCard
            title="Verdana Store — therapy toys"
            body="Our partner brand inside the clinic. Shop occupational-therapy toys, sensory tools, and learning aids."
            href="https://verdanarehab.com/"
            cta="Visit verdanarehab.com"
            icon={<IconBag />}
          />
          <UseCard
            title="Clinic merchandise"
            body="Aura Health Rehab–branded merchandise — apparel, mugs, and seasonal items — handpicked by the clinic."
            href="https://verdanarehab.com/collections/merch-resources"
            cta="Shop merchandise"
            icon={<IconShirt />}
          />
        </ul>
      </DashCard>
    </div>
  )
}

function UseCard({ title, body, href, cta, icon, first = false }: { title: string; body: string; href: string; cta: string; icon: React.ReactNode; first?: boolean }) {
  return (
    <li style={first ? undefined : TR_STYLE}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`flex items-start gap-3.5 px-4 sm:px-5 py-4 transition-colors hover:bg-[#F8FAF2] ${FOCUS}`}
      >
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}>
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{title}</span>
          <span className="block text-[13px] mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{body}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--teal)' }}>
            {cta} <Icon name="external" size={12} />
          </span>
        </span>
      </a>
    </li>
  )
}

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
