'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { CreditCard, Loader2, ExternalLink, RefreshCw } from 'lucide-react'

const ACCESS = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN', 'SBEA_FRONTDESK', 'SBGH_FRONTDESK', 'PAYROLL_OFFICER']
const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Txn { id: string; referenceCode: string | null; description: string | null; branch: string | null; amount: number; status: string; checkoutUrl: string | null; fee: number | null; netAmount: number | null; paidAt: string | null; livemode: boolean; createdAt: string }

export default function PaymongoPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role
  const [cfg, setCfg] = useState<{ configured: boolean; livemode: boolean } | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastUrl, setLastUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/pos/paymongo/checkout'); const j = r.ok ? await r.json() : null; if (j) { setCfg({ configured: j.configured, livemode: j.livemode }); setTxns(j.recent || []) } }
    catch { /* ignore */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && !ACCESS.includes(role as string)) {
    return <div className="p-8 text-center text-gray-500">PayMongo is restricted to admin, accountant, bookkeeper, branch admin, and front desk.</div>
  }

  const createLink = async () => {
    const amt = Number(amount)
    if (!(amt > 0)) { alert('Enter a positive amount.'); return }
    setBusy(true); setLastUrl('')
    try {
      const r = await fetch('/api/pos/paymongo/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPhp: amt, description }) })
      const j = await r.json()
      if (!r.ok) { alert(j.error || 'Failed to create link'); return }
      setLastUrl(j.checkoutUrl); setAmount(''); setDescription(''); load()
    } finally { setBusy(false) }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; c: string }> = { PAID: { bg: '#dcfce7', c: '#166534' }, PENDING: { bg: '#fef9c3', c: '#854d0e' }, FAILED: { bg: '#fee2e2', c: '#b91c1c' }, EXPIRED: { bg: '#f1f5f9', c: '#64748b' } }
    const st = map[s] || map.PENDING
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: st.bg, color: st.c }}>{s}</span>
  }

  const inp = 'w-full px-3 py-2 rounded-xl border text-sm'; const bc = { borderColor: 'var(--light-gray)' }

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <CreditCard size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">PayMongo</h1>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><RefreshCw size={13} /> Refresh</button>
      </div>

      {cfg && !cfg.configured && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: '#fed7aa', background: '#fff7ed', color: '#9a3412' }}>
          PayMongo isn&apos;t configured yet. Set <code>PAYMONGO_SECRET_KEY</code> and <code>PAYMONGO_WEBHOOK_SECRET</code> on the server, then register the webhook <code>/api/pos/paymongo/webhook</code> in the PayMongo dashboard.
        </div>
      )}
      {cfg?.configured && (
        <div className="rounded-xl border p-3 text-sm flex items-center gap-2" style={{ borderColor: cfg.livemode ? '#fecaca' : 'var(--light-gray)', background: cfg.livemode ? '#fef2f2' : 'var(--off-white)' }}>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cfg.livemode ? '#b91c1c' : '#0d9488', color: '#fff' }}>{cfg.livemode ? 'LIVE MODE' : 'TEST MODE'}</span>
          <span style={{ color: 'var(--mid-gray)' }}>Create a payment link below; it flips to <strong>Paid</strong> automatically when the customer pays (via webhook), with the PayMongo fee and net recorded.</span>
        </div>
      )}

      {/* Create payment link */}
      <div className="rounded-2xl border p-4 bg-white space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
        <p className="text-sm font-semibold text-gray-700">Create a payment link</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Amount (PHP)</label><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={inp + ' font-mono'} style={bc} /></div>
          <div className="sm:col-span-2"><label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Description</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. PT session — Juan Dela Cruz" className={inp} style={bc} /></div>
        </div>
        <button onClick={createLink} disabled={busy || !cfg?.configured} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-2" style={{ background: 'var(--teal)' }}>{busy && <Loader2 size={15} className="animate-spin" />} Create payment link</button>
        {lastUrl && (
          <div className="rounded-xl border p-3 text-sm flex items-center justify-between gap-3" style={{ borderColor: 'var(--teal)', background: 'var(--pale-teal)' }}>
            <span className="font-mono text-xs truncate" style={{ color: 'var(--deep-teal)' }}>{lastUrl}</span>
            <a href={lastUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><ExternalLink size={13} /> Open / show QR</a>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="rounded-2xl border overflow-auto bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-xs"><thead><tr className="text-left" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
          {['Date', 'Reference', 'Description', 'Amount', 'Fee', 'Net', 'Status', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={8} className="text-center py-10 text-gray-400"><Loader2 size={16} className="inline animate-spin" /></td></tr>
            : txns.map(t => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>{new Date(t.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-3 py-2 font-mono">{t.referenceCode || '—'}</td>
                <td className="px-3 py-2">{t.description || '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{peso(t.amount)}</td>
                <td className="px-3 py-2 text-right font-mono" style={{ color: '#d97706' }}>{t.fee != null ? peso(t.fee) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--deep-teal)' }}>{t.netAmount != null ? peso(t.netAmount) : '—'}</td>
                <td className="px-3 py-2">{statusBadge(t.status)}{t.livemode ? '' : <span className="ml-1 text-[9px]" style={{ color: 'var(--mid-gray)' }}>test</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{t.status === 'PENDING' && t.checkoutUrl && <a href={t.checkoutUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold" style={{ color: 'var(--teal)' }}>Open →</a>}</td>
              </tr>
            ))}
          {!loading && txns.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">No PayMongo transactions yet.</td></tr>}
        </tbody></table>
      </div>
    </div>
  )
}
