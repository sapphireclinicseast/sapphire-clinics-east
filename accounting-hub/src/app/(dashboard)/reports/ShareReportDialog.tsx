'use client'

// Reports → Share: turn the income statement on screen (year, ticked branches,
// column view) into a view-only link that opens without a login. Links can be
// copied again or turned off from the same window.
import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react'
import { HrNoticeModal, hrBtn } from '@/components/ui/hr-look'
import { sharePath, shareBranchLabel, shareViewLabel, SHARE_EXPIRY_DAYS, type ShareStatus } from '@/lib/reports/share'

interface ShareLink {
  id: string; token: string; label: string | null; year: number; branch: string; view: string
  allowDrill: boolean; hideNames: boolean; expiresAt: string | null; revokedAt: string | null
  viewCount: number; lastViewedAt: string | null; createdByName: string | null; createdAt: string
  status: ShareStatus
}

const shortDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const expiryLabel = (days: number) => (days === 0 ? 'Never' : `In ${days} days`)
const STATUS_PILL: Record<ShareStatus, { bg: string; fg: string; text: string }> = {
  active: { bg: '#dcfce7', fg: '#166534', text: 'Active' },
  expired: { bg: '#f1f5f9', fg: '#475569', text: 'Expired' },
  revoked: { bg: '#fee2e2', fg: '#991b1b', text: 'Turned off' },
}

export default function ShareReportDialog({ year, branch, view, onClose }: {
  year: number; branch: string; view: 'annual' | 'quarterly' | 'monthly'; onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [allowDrill, setAllowDrill] = useState(true)
  const [hideNames, setHideNames] = useState(true)
  const [expiresInDays, setExpiresInDays] = useState<number>(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ShareLink | null>(null)
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState<string | null>(null)

  const urlOf = (token: string) => `${window.location.origin}${sharePath(token)}`
  const summary = `Income Statement · ${year} · ${shareViewLabel(view)} · ${shareBranchLabel(branch)}`

  const loadLinks = () =>
    fetch('/api/reports/share')
      .then(async r => (r.ok ? setLinks((await r.json()).links) : setLinks([])))
      .catch(() => setLinks([]))
  useEffect(() => { loadLinks() }, [])

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlOf(token))
      setCopied(token)
      setTimeout(() => setCopied(c => (c === token ? null : c)), 1800)
    } catch {
      setError('Copy failed — select the link and copy it by hand.')
    }
  }

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/reports/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, branch, view, label, allowDrill, hideNames: allowDrill ? hideNames : true, expiresInDays }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Could not create the link'); return }
      setCreated(j.link)
      loadLinks()
    } catch {
      setError('Could not create the link')
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async (id: string) => {
    setConfirmOff(null)
    const r = await fetch(`/api/reports/share/${id}`, { method: 'DELETE' })
    if (!r.ok) { setError('Could not turn the link off'); return }
    if (created?.id === id) setCreated(null)
    loadLinks()
  }

  const footer = created ? (
    <>
      <button className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)' }} onClick={() => setCreated(null)}>Make another</button>
      <button className={`${hrBtn.primary} ml-auto`} style={{ background: 'var(--teal)' }} onClick={onClose}>Done</button>
    </>
  ) : (
    <>
      <button className={hrBtn.outline} style={{ borderColor: 'var(--light-gray)' }} onClick={onClose}>Cancel</button>
      <button className={`${hrBtn.primary} ml-auto`} style={{ background: 'var(--teal)' }} onClick={create} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Create link
      </button>
    </>
  )

  return (
    <HrNoticeModal
      icon={<Link2 size={18} />} tone="green" title="Share this view"
      subtitle="Anyone with the link can open it — no login needed. They can't change anything."
      onClose={onClose} footer={footer}
    >
      <div className="rounded-lg px-3 py-2.5 text-[13px] font-semibold" style={{ background: 'var(--hr-head)', border: '1px solid var(--hr-line)', fontFamily: 'var(--font-display)' }}>
        {summary}
      </div>

      {created ? (
        <div className="space-y-2 pt-1">
          <p className="text-[13px] font-semibold" style={{ color: '#166534' }}>Link ready — send it to the person you&apos;re sharing with.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={urlOf(created.token)} onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-0 h-9 px-3 rounded-lg border text-[12px] font-mono bg-white"
              style={{ borderColor: 'var(--light-gray)' }} aria-label="Share link" />
            <button className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }} onClick={() => copy(created.token)}>
              {copied === created.token ? <Check size={13} /> : <Copy size={13} />} {copied === created.token ? 'Copied' : 'Copy'}
            </button>
            <a className={hrBtn.ghost} style={{ borderColor: 'var(--light-gray)' }} href={sharePath(created.token)} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} /> Open
            </a>
          </div>
          <p className="text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
            {created.expiresAt ? `Works until ${shortDate(created.expiresAt)}.` : 'Never expires.'}{' '}
            Figures stay live, so they update as the books do. Turn it off below at any time.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <label className="block">
            <span className="text-[11.5px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Who is it for? <span className="normal-case font-normal">(only you see this)</span></span>
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Verdana partner review"
              className="mt-1 w-full h-9 px-3 rounded-lg border text-[13px] bg-white" style={{ borderColor: 'var(--light-gray)' }} />
          </label>

          <label className="flex items-start gap-2 text-[13px] cursor-pointer select-none">
            <input type="checkbox" className="mt-0.5" checked={allowDrill} onChange={e => setAllowDrill(e.target.checked)} />
            <span>Let them click an amount to see the entries that make it up</span>
          </label>
          <label className={`flex items-start gap-2 text-[13px] select-none pl-6 ${allowDrill ? 'cursor-pointer' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-0.5" disabled={!allowDrill} checked={hideNames} onChange={e => setHideNames(e.target.checked)} />
            <span>
              Hide the descriptions of those entries
              <span className="block text-[11.5px]" style={{ color: 'var(--mid-gray)' }}>
                Descriptions can name patients, customers, suppliers and staff. With this on they see each entry&apos;s source, month and amount, and its reference number where it has one.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-[11.5px] font-semibold uppercase tracking-[.4px]" style={{ color: 'var(--mid-gray)' }}>Link expires</span>
            <select value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))}
              className="h-8 px-2 rounded-lg border text-[13px] bg-white" style={{ borderColor: 'var(--light-gray)' }}>
              {SHARE_EXPIRY_DAYS.map(d => <option key={d} value={d}>{expiryLabel(d)}</option>)}
            </select>
          </label>
        </div>
      )}

      {error && <p className="text-[12px]" style={{ color: '#b91c1c' }}>{error}</p>}

      {/* ── Links already shared ──────────────────────────────── */}
      <div className="pt-3 mt-1 border-t" style={{ borderColor: 'var(--hr-line)' }}>
        <p className="text-[11.5px] font-semibold uppercase tracking-[.4px] mb-2" style={{ color: 'var(--mid-gray)' }}>Shared links</p>
        {links === null && <div className="h-10 rounded-lg hr-shimmer" />}
        {links && links.length === 0 && <p className="text-[12px]" style={{ color: 'var(--hr-faint)' }}>None yet.</p>}
        <div className="space-y-1.5">
          {links?.map(l => {
            const pill = STATUS_PILL[l.status]
            return (
              <div key={l.id} className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: 'var(--hr-line)', boxShadow: `inset 3px 0 0 ${l.status === 'active' ? '#4A8073' : '#DDE6CC'}` }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold truncate pl-1" style={{ color: l.status === 'active' ? 'var(--charcoal)' : 'var(--hr-faint)' }}>
                    {l.label || `${shareBranchLabel(l.branch)} · ${l.year}`}
                  </p>
                  <span className="flex-none inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: pill.bg, color: pill.fg }}>{pill.text}</span>
                </div>
                <p className="text-[11px] pl-1 truncate" style={{ color: 'var(--mid-gray)' }}>
                  Income Statement {l.year} · {shareViewLabel(l.view)} · {shareBranchLabel(l.branch)}
                  {l.allowDrill ? (l.hideNames ? ' · entries, descriptions hidden' : ' · entries with full descriptions') : ' · totals only'}
                </p>
                <div className="flex items-center justify-between gap-2 pl-1 mt-1">
                  <p className="text-[11px]" style={{ color: 'var(--hr-faint)' }}>
                    <span className="font-mono">{l.viewCount}</span> {l.viewCount === 1 ? 'view' : 'views'}
                    {l.lastViewedAt ? ` · last ${shortDate(l.lastViewedAt)}` : ''}
                    {' · '}{l.status === 'revoked' && l.revokedAt ? `off since ${shortDate(l.revokedAt)}` : l.expiresAt ? `${l.status === 'expired' ? 'expired' : 'until'} ${shortDate(l.expiresAt)}` : 'no expiry'}
                  </p>
                  {l.status === 'active' && (
                    <div className="flex items-center gap-1.5 flex-none">
                      <button className={`${hrBtn.ghost} !h-7`} style={{ borderColor: 'var(--light-gray)' }} onClick={() => copy(l.token)}>
                        {copied === l.token ? <Check size={12} /> : <Copy size={12} />} {copied === l.token ? 'Copied' : 'Copy'}
                      </button>
                      {confirmOff === l.id ? (
                        <button className={`${hrBtn.ghost} !h-7`} style={{ borderColor: '#fecaca', color: '#b91c1c' }} onClick={() => turnOff(l.id)}>
                          Confirm turn off
                        </button>
                      ) : (
                        <button className={`${hrBtn.ghost} !h-7`} style={{ borderColor: 'var(--light-gray)' }} onClick={() => setConfirmOff(l.id)}>
                          Turn off
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </HrNoticeModal>
  )
}
