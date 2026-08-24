'use client'

import { useEffect, useState } from 'react'
import { branchLabel } from '@/lib/branch-label'
import { MessageSquare, Send, Trash2, Play, Eye, Clock, Zap, Calendar, CheckCircle2 } from 'lucide-react'

const MAX_LEN = 160

// Format a Date to "YYYY-MM-DDTHH:MM" for a datetime-local input (local tz).
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const RECIPIENT_GROUPS: Array<{ value: string; label: string; group: 'general' | 'active' }> = [
  { value: 'pediatric', label: 'Pediatric patients',                   group: 'general' },
  { value: 'adult',     label: 'Adult patients',                       group: 'general' },
  { value: 'both',      label: 'Both pediatric + adult',               group: 'general' },
  { value: 'actively-serviced-OT',       label: 'Actively Serviced — OT',       group: 'active' },
  { value: 'actively-serviced-PT',       label: 'Actively Serviced — PT',       group: 'active' },
  { value: 'actively-serviced-SLP',      label: 'Actively Serviced — SLP',      group: 'active' },
  { value: 'actively-serviced-MD',       label: 'Actively Serviced — MD',       group: 'active' },
  { value: 'actively-serviced-SPED',     label: 'Actively Serviced — SPED',     group: 'active' },
  { value: 'actively-serviced-PSYCHOLOGY', label: 'Actively Serviced — Psychology', group: 'active' },
  { value: 'actively-serviced-ORTHOSIS', label: 'Actively Serviced — Orthosis', group: 'active' },
]

export default function SmsCampaignsPage() {
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [branchFilter, setBranchFilter] = useState<'BOTH' | 'SBEA' | 'SBGH'>('BOTH')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <MessageSquare size={22} style={{ color: 'var(--narra)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>SMS Campaigns</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <button onClick={() => setTab('new')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === 'new' ? 'border-b-2' : ''}`}
          style={tab === 'new'
            ? { color: 'var(--narra)', borderColor: 'var(--narra)' }
            : { color: 'var(--mid-gray)' }}>
          New Campaign
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === 'history' ? 'border-b-2' : ''}`}
          style={tab === 'history'
            ? { color: 'var(--narra)', borderColor: 'var(--narra)' }
            : { color: 'var(--mid-gray)' }}>
          Past Campaigns
        </button>
      </div>

      {tab === 'new'
        ? <NewCampaign branch={branchFilter} setBranch={setBranchFilter} />
        : <CampaignHistory branch={branchFilter} setBranch={setBranchFilter} />}
    </div>
  )
}

// ── New Campaign ────────────────────────────────────────────────────────────
type Branch = 'BOTH' | 'SBEA' | 'SBGH'
// Labels come from the shared branchLabel() so the wording matches every other
// screen; SBEA/SBGH are internal codes and were never meant to reach the UI.
const BRANCH_OPTIONS: { value: Branch; label: string }[] = [
  { value: 'BOTH', label: 'Both branches' },
  { value: 'SBEA', label: branchLabel('SBEA') },
  { value: 'SBGH', label: branchLabel('SBGH') },
]
// Prominent segmented branch selector — controls both the recipient filter and
// which clinic phone the SMS is sent from.
function BranchSelector({ value, onChange }: { value: Branch; onChange: (b: Branch) => void }) {
  return (
    <div className="flex gap-2">
      {BRANCH_OPTIONS.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className="flex-1 px-3 py-2 rounded border text-sm font-semibold transition-colors"
          style={value === o.value
            ? { background: 'var(--narra)', color: '#fff', borderColor: 'var(--narra)' }
            : { background: '#fff', color: 'var(--mid-gray)', borderColor: 'var(--light-gray)' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function NewCampaign({ branch, setBranch }: { branch: Branch; setBranch: (b: Branch) => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [recipientGroup, setRecipientGroup] = useState('pediatric')
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    // Default to tomorrow 09:00 local — matches the SMS tranche send hour.
    const t = new Date()
    t.setDate(t.getDate() + 1)
    t.setHours(9, 0, 0, 0)
    return toDatetimeLocal(t)
  })

  // Live preview of recipient count
  useEffect(() => {
    let cancelled = false
    setCount(null)
    fetch('/api/sms/recipient-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientGroup, branch }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled) setCount(typeof d.count === 'number' ? d.count : 0) })
      .catch(() => { if (!cancelled) setCount(0) })
    return () => { cancelled = true }
  }, [recipientGroup, branch])

  async function handleSend() {
    if (!subject.trim()) { alert('Subject is required (internal label).'); return }
    if (!message.trim()) { alert('Message is required.'); return }
    if (message.length > MAX_LEN) { alert(`Message exceeds ${MAX_LEN} characters.`); return }
    if (!count) { alert('No recipients in the selected group.'); return }

    const scheduling = sendMode === 'schedule'
    if (scheduling) {
      if (!scheduledAt) { alert('Pick a date & time to schedule.'); return }
      if (new Date(scheduledAt).getTime() <= Date.now()) { alert('Scheduled time must be in the future.'); return }
    }
    const when = scheduling
      ? new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
      : null
    const confirmMsg = scheduling
      ? `Schedule "${subject}" to ${count} recipient${count === 1 ? '' : 's'} on ${when}?`
      : `Send "${subject}" to ${count} recipient${count === 1 ? '' : 's'} now?`
    if (!confirm(confirmMsg)) return

    setBusy(true)
    setInfo(null)
    try {
      const payload: Record<string, unknown> = { subject, message, recipientGroup, branch }
      if (scheduling) payload.scheduledAt = new Date(scheduledAt).toISOString()
      const r = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Send failed')
      setInfo(scheduling
        ? `Campaign scheduled for ${when}. It will send automatically${branch === 'BOTH' ? ' from each branch’s own phone' : ''} (capped at 400/day per branch; the system auto-resumes the rest each morning).`
        : `Campaign queued — first batch is sending now (capped at 400/day per branch; the system auto-resumes the rest each morning).`)
      setSubject('')
      setMessage('')
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  const remaining = MAX_LEN - message.length
  const overLimit = remaining < 0

  return (
    <div className="grid gap-5 max-w-2xl">
      {/* Branch — controls recipient filter AND which clinic phone sends */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
          Branch
        </label>
        <BranchSelector value={branch} onChange={setBranch} />
        <p className="mt-1.5 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          {branch === 'BOTH'
            ? 'Sends to both branches — each patient gets the SMS from their own branch’s phone (East SIM / Greenhills SIM).'
            : branch === 'SBEA'
              ? 'Sends only to East Branch patients, from the East phone (+639171189289).'
              : 'Sends only to Greenhills Branch patients, from the Greenhills phone (+639177701686).'}
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
          Subject (internal label, not sent)
        </label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Autism Awareness Month — pedia reminder"
          className="w-full px-3 py-2 rounded border text-sm"
          style={{ borderColor: 'var(--light-gray)', background: '#fff', color: 'var(--ink)' }} />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
          Recipient group
        </label>
        <select value={recipientGroup} onChange={(e) => setRecipientGroup(e.target.value)}
          className="w-full px-3 py-2 rounded border text-sm"
          style={{ borderColor: 'var(--light-gray)', background: '#fff', color: 'var(--ink)' }}>
          <optgroup label="Patient type">
            {RECIPIENT_GROUPS.filter(g => g.group === 'general').map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </optgroup>
          <optgroup label="Actively serviced (currently in Decking + last 30 days of clinic schedule)">
            {RECIPIENT_GROUPS.filter(g => g.group === 'active').map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </optgroup>
        </select>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
          Branch: <strong>{branch === 'BOTH' ? 'Both' : branch}</strong>.
          {count !== null && (
            <> &nbsp;·&nbsp; <strong style={{ color: 'var(--narra)' }}>{count}</strong> patient{count === 1 ? '' : 's'} match this group.</>
          )}
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
          Message <span className={overLimit ? 'text-red-600' : ''}>({remaining} characters left)</span>
        </label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)}
          rows={5} maxLength={MAX_LEN + 50}
          placeholder={`Hi! This is a quick reminder from Sapphire Clinics East...`}
          className="w-full px-3 py-2 rounded border text-sm font-mono"
          style={{
            borderColor: overLimit ? '#dc2626' : 'var(--light-gray)',
            background: '#fff',
            color: 'var(--ink)',
          }} />
        <p className="mt-1 text-[11px]" style={{ color: 'var(--mid-gray)' }}>
          SMS is hard-capped at 160 chars to fit a single message segment.
          Going over splits into multiple billed segments — disabled here on purpose.
        </p>
      </div>

      {/* When to send */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
          When to send
        </label>
        <div className="flex gap-2">
          {(['now', 'schedule'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setSendMode(mode)}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold flex-1 justify-center transition-colors"
              style={{
                border: `1.5px solid ${sendMode === mode ? 'var(--narra)' : 'var(--light-gray)'}`,
                background: sendMode === mode ? 'rgba(155,44,44,0.06)' : 'transparent',
                color: sendMode === mode ? 'var(--narra)' : 'var(--mid-gray)',
              }}>
              {mode === 'now' ? <><Send size={14} /> Send now</> : <><Calendar size={14} /> Schedule</>}
            </button>
          ))}
        </div>
        {sendMode === 'schedule' && (
          <div className="mt-3">
            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
              Scheduled date &amp; time
            </label>
            <input type="datetime-local" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={toDatetimeLocal(new Date(Date.now() + 60000))}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ borderColor: 'var(--light-gray)', background: '#fff', color: 'var(--ink)' }} />
            {scheduledAt && (
              <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--narra)' }}>
                <CheckCircle2 size={11} />
                Will send {new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            )}
          </div>
        )}
      </div>

      {info && (
        <div className="text-xs px-3 py-2 rounded" style={{ background: '#ECFDF5', color: '#065F46' }}>
          {info}
        </div>
      )}

      <div>
        <button onClick={handleSend} disabled={busy || overLimit || !count}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded transition-opacity disabled:opacity-50"
          style={{ background: 'var(--narra)', color: '#fff' }}>
          {sendMode === 'schedule' ? <Calendar size={14} /> : <Send size={14} />}
          {busy
            ? (sendMode === 'schedule' ? 'Scheduling…' : 'Sending…')
            : sendMode === 'schedule'
              ? `Schedule for ${count ?? '…'} recipient${count === 1 ? '' : 's'}`
              : `Send to ${count ?? '…'} recipient${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}

// ── Past Campaigns ──────────────────────────────────────────────────────────
interface SmsRow {
  id: string
  subject: string
  message: string
  recipientGroup: string
  branch: string
  department: string | null
  status: string
  recipientCount: number
  sentCount: number
  nextTrancheAt: string | null
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
}

function CampaignHistory({ branch, setBranch }: { branch: Branch; setBranch: (b: Branch) => void }) {
  const [rows, setRows] = useState<SmsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [preview, setPreview] = useState<SmsRow | null>(null)

  async function load() {
    setLoading(true)
    try {
      const p = new URLSearchParams({ status: statusFilter, branch })
      const r = await fetch('/api/sms/campaigns?' + p.toString())
      const d = await r.json()
      setRows(d.campaigns || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, branch])

  async function resumeCampaign(id: string) {
    if (!confirm('Resume sending this campaign from where it stopped?')) return
    try {
      const r = await fetch('/api/sms/campaigns/' + id + '/resume', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Resume failed')
      alert(d.resuming ? `Resuming from ${d.startFrom}/${d.total}.` : 'Sending started.')
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  async function scheduleNow(id: string) {
    if (!confirm('Fire the next tranche immediately? (otherwise it will run automatically tomorrow morning)')) return
    try {
      const r = await fetch('/api/sms/campaigns/' + id + '/schedule-now', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Schedule failed')
      alert(`Tranche fired — resuming from ${d.startFrom}/${d.total}.`)
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign record? Already-sent messages cannot be recalled.')) return
    try {
      const r = await fetch('/api/sms/campaigns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!r.ok) throw new Error('Delete failed')
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  function statusBadge(row: SmsRow) {
    if (row.status === 'partial') {
      const nextLabel = row.nextTrancheAt
        ? new Date(row.nextTrancheAt).toLocaleString('en-PH', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })
        : null
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#FEF3C7', color: '#92400E' }}>
          Partial ({row.sentCount}/{row.recipientCount})
          {nextLabel ? <span style={{ fontWeight: 500, textTransform: 'none' }}>· next {nextLabel}</span> : null}
        </span>
      )
    }
    if (row.status === 'failed' && row.sentCount > 0 && row.sentCount < row.recipientCount) {
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#FFEDD5', color: '#9A3412' }}>
          Partial ({row.sentCount}/{row.recipientCount})
        </span>
      )
    }
    if (row.status === 'sent' && row.sentCount > 0 && row.sentCount < row.recipientCount) {
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#D1FAE5', color: '#065F46' }}>
          Sent ({row.sentCount}/{row.recipientCount})
        </span>
      )
    }
    const cfg: Record<string, { bg: string; color: string }> = {
      sent:      { bg: '#D1FAE5', color: '#065F46' },
      sending:   { bg: '#FEF3C7', color: '#92400E' },
      scheduled: { bg: '#DBEAFE', color: '#1E40AF' },
      failed:    { bg: '#FEE2E2', color: '#991B1B' },
      draft:     { bg: '#F1F5F9', color: '#475569' },
    }
    const c = cfg[row.status] ?? cfg.draft
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
        style={{ background: c.bg, color: c.color }}>{row.status}</span>
    )
  }

  return (
    <div className="rounded-xl" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
        <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Past Campaigns</h2>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={branch} onChange={(e) => setBranch(e.target.value as Branch)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
            <option value="BOTH">Both branches</option>
            <option value="SBEA">{branchLabel('SBEA')}</option>
            <option value="SBGH">{branchLabel('SBGH')}</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded border"
            style={{ borderColor: 'var(--light-gray)', background: '#fff' }}>
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
            <option value="sending">Sending</option>
            <option value="scheduled">Scheduled</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead style={{ background: '#FAFAF9' }}>
            <tr style={{ color: 'var(--mid-gray)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th className="px-4 py-2 text-left font-semibold">Subject</th>
              <th className="px-4 py-2 text-left font-semibold">Group</th>
              <th className="px-4 py-2 text-left font-semibold">Branch</th>
              <th className="px-4 py-2 text-left font-semibold">Recipients</th>
              <th className="px-4 py-2 text-left font-semibold">Status</th>
              <th className="px-4 py-2 text-left font-semibold">Sent</th>
              <th className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>No campaigns yet.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-3">
                  <button onClick={() => setPreview(r)}
                    className="text-sm font-medium hover:underline text-left"
                    style={{ color: 'var(--ink)' }}>
                    {r.subject || <em style={{ color: 'var(--mid-gray)' }}>(no subject)</em>}
                  </button>
                  <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--mid-gray)' }}>{r.message}</p>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink)' }}>{r.recipientGroup}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink)' }}>{r.branch}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink)' }}>{r.recipientCount}</td>
                <td className="px-4 py-3">{statusBadge(r)}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {r.sentAt ? new Date(r.sentAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                    : r.scheduledAt ? <em>scheduled {new Date(r.scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</em>
                    : new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setPreview(r)} title="View" className="p-1.5 rounded hover:bg-stone-100 inline-block">
                    <Eye size={14} style={{ color: 'var(--mid-gray)' }} />
                  </button>
                  {r.status === 'partial' && (
                    <button onClick={() => scheduleNow(r.id)} title="Fire next tranche now"
                      className="p-1.5 rounded hover:bg-amber-50 inline-block">
                      <Zap size={14} style={{ color: '#92400E' }} />
                    </button>
                  )}
                  {(r.status === 'failed' || r.status === 'partial') && r.sentCount < r.recipientCount && (
                    <button onClick={() => resumeCampaign(r.id)} title="Resume sending"
                      className="p-1.5 rounded hover:bg-emerald-50 inline-block">
                      <Play size={14} style={{ color: '#065F46' }} />
                    </button>
                  )}
                  <button onClick={() => deleteCampaign(r.id)} title="Delete"
                    className="p-1.5 rounded hover:bg-red-50 inline-block">
                    <Trash2 size={14} style={{ color: '#991B1B' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div onClick={(e) => e.stopPropagation()}
            className="rounded-xl max-w-lg w-full"
            style={{ background: '#fff' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{preview.subject}</h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                {preview.recipientGroup} · {preview.branch} · {preview.recipientCount} recipients
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--mid-gray)' }}>Message</p>
              <pre className="text-sm whitespace-pre-wrap font-mono p-3 rounded"
                style={{ background: '#F5F5F4', color: 'var(--ink)' }}>{preview.message}</pre>
            </div>
            <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'var(--light-gray)' }}>
              <button onClick={() => setPreview(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded"
                style={{ background: 'var(--paper)', color: 'var(--ink)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
