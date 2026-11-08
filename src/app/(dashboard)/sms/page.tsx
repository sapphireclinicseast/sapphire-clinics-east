'use client'

import { useEffect, useState } from 'react'
import { branchLabel } from '@/lib/branch-label'
import { FOLLOWUP_GROUPS } from '@/lib/followup-groups'
import { MessageSquare, Send, Trash2, Play, Eye, Clock, Zap, Calendar, CheckCircle2, Plus, FileText, Users, ChevronDown, Loader2 } from 'lucide-react'
import { DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'
import {
  CONTROL, TEXTAREA, CONTROL_SM, CONTROL_STYLE, BTN_PRIMARY, BTN_SECONDARY, TH, MODAL_BACKDROP, SUBTLE_BG,
  PageHeader, PillTabs, Field, Segmented, StatusBadge, Notice, ErrorBanner, TableSkeleton, KpiSkeletonRow, RowAction, fmtDateTime,
} from '../email/campaign-ui'

const MAX_LEN = 160

// Format a Date to "YYYY-MM-DDTHH:MM" for a datetime-local input (local tz).
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const RECIPIENT_GROUPS: Array<{ value: string; label: string; group: 'general' | 'active' | 'followup' }> = [
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
  // Overdue follow-ups, straight from the Patient Relationship rules. Their own
  // optgroup because they are the opposite audience to "actively serviced" —
  // these are the people who have NOT come back.
  ...FOLLOWUP_GROUPS.map(g => ({ value: g.key, label: g.label, group: 'followup' as const })),
]

export default function SmsCampaignsPage() {
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [branchFilter, setBranchFilter] = useState<'BOTH' | 'SBEA' | 'SBGH'>('BOTH')

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Patients & SMS"
        title="SMS Campaigns"
        subtitle="Text reminders and announcements to patients, sent from each branch's clinic phone."
        action={
          <button type="button" onClick={() => setTab('new')} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New campaign
          </button>
        }
      />

      <PillTabs
        label="SMS campaign sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'new', label: 'New Campaign', icon: Send },
          { id: 'history', label: 'Past Campaigns', icon: FileText },
        ]}
      />

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
// 'BOTH' has no branchLabel entry, so it's spelled out rather than passed through.
const branchName = (b: string) => (b === 'BOTH' ? 'Both branches' : branchLabel(b))
const groupName = (v: string) => RECIPIENT_GROUPS.find(g => g.value === v)?.label ?? v

// Prominent segmented branch selector — controls both the recipient filter and
// which clinic phone the SMS is sent from.
function BranchSelector({ value, onChange }: { value: Branch; onChange: (b: Branch) => void }) {
  return (
    <Segmented
      label="Branch"
      value={value}
      onChange={onChange}
      options={BRANCH_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
    />
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
  const counterColor = overLimit ? '#DC2626' : remaining <= 20 ? '#B45309' : 'var(--mid-gray)'
  const followup = FOLLOWUP_GROUPS.find(g => g.key === recipientGroup)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
      {/* ── Left: audience + message ── */}
      <div className="space-y-5 min-w-0">
        <DashCard
          title="Branch & audience"
          icon={<Users size={16} />}
          description="The branch picks both the patients and the clinic phone the SMS is sent from."
          action={
            count !== null ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={count > 0
                  ? { background: 'var(--pale-teal)', color: 'var(--teal)' }
                  : { background: '#FEF2F2', color: '#B91C1C' }}>
                <Users size={12} />
                {count} patient{count === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                <Loader2 size={12} className="animate-spin" /> Counting…
              </span>
            )
          }
        >
          <div className="space-y-5">
            {/* Branch — controls recipient filter AND which clinic phone sends */}
            <Field
              label="Branch"
              hint={branch === 'BOTH'
                ? 'Sends to both branches — each patient gets the SMS from their own branch’s phone (East SIM / Greenhills SIM).'
                : branch === 'SBEA'
                  ? 'Sends only to East Branch patients, from the East phone (+639171189289).'
                  : 'Sends only to Greenhills Branch patients, from the Greenhills phone (+639177701686).'}
            >
              <BranchSelector value={branch} onChange={setBranch} />
            </Field>

            <Field
              label="Recipient group"
              htmlFor="sms-recipient-group"
              hint={
                <>
                  {/* branchLabel, not the raw code — SBEA/SBGH are internal and were
                      never meant to reach the UI. The selector above this line already
                      says "Greenhills Branch"; this said "SBGH". */}
                  {/* Name the rule for follow-up groups. These go to patients who have
                      NOT been back, so whoever presses send should be able to see which
                      cut-off produced the list without opening another screen. */}
                  {followup ? (
                    <span className="block mb-1 px-2.5 py-1.5 rounded-md" style={{ background: SUBTLE_BG, color: 'var(--teal)' }}>
                      <strong>{followup.rule}</strong> &mdash; counted from each patient&apos;s first consult.
                    </span>
                  ) : null}
                  Branch: <strong style={{ color: 'var(--charcoal)' }}>{branch === 'BOTH' ? 'Both branches' : branchLabel(branch)}</strong>.
                  {count !== null && (
                    <> &nbsp;·&nbsp; <strong style={{ color: 'var(--teal)' }}>{count}</strong> patient{count === 1 ? '' : 's'} match this group.</>
                  )}
                </>
              }
            >
              <div className="relative">
                <select id="sms-recipient-group" value={recipientGroup} onChange={(e) => setRecipientGroup(e.target.value)}
                  className={`${CONTROL} appearance-none pr-8`}
                  style={CONTROL_STYLE}>
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
                  <optgroup label="Overdue follow-ups (Patient Relationship rules)">
                    {RECIPIENT_GROUPS.filter(g => g.group === 'followup').map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
              </div>
            </Field>
          </div>
        </DashCard>

        <DashCard title="Message" icon={<MessageSquare size={16} />} description="One SMS segment, 160 characters max.">
          <div className="space-y-5">
            <Field label="Subject (internal label, not sent)" htmlFor="sms-subject">
              <input id="sms-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Autism Awareness Month — pedia reminder"
                className={CONTROL}
                style={CONTROL_STYLE} />
            </Field>

            <Field
              label="Message"
              htmlFor="sms-message"
              aside={
                <span className="font-semibold" style={{ color: counterColor, fontVariantNumeric: 'tabular-nums' }}>
                  {remaining} characters left
                </span>
              }
              hint={<>SMS is hard-capped at 160 chars to fit a single message segment. Going over splits into multiple billed segments — disabled here on purpose.</>}
            >
              <textarea id="sms-message" value={message} onChange={(e) => setMessage(e.target.value)}
                rows={5} maxLength={MAX_LEN + 50}
                placeholder={`Hi! This is a quick reminder from Sapphire Clinics East...`}
                className={`${TEXTAREA} font-mono resize-y`}
                style={{
                  ...CONTROL_STYLE,
                  borderColor: overLimit ? '#dc2626' : 'var(--light-gray)',
                }} />
              {/* Character meter — display only; the limit itself is enforced in handleSend */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#EEF3F1' }} aria-hidden>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (message.length / MAX_LEN) * 100)}%`, background: overLimit ? '#DC2626' : remaining <= 20 ? '#D97706' : 'var(--teal)' }} />
                </div>
                <span className="text-[11px] font-semibold" style={{ color: counterColor, fontVariantNumeric: 'tabular-nums' }}>
                  {message.length}/{MAX_LEN}
                </span>
              </div>
            </Field>
          </div>
        </DashCard>
      </div>

      {/* ── Right: review + send ── */}
      <aside className="min-w-0 xl:sticky xl:top-0">
        <DashCard title="Review & send" icon={<Send size={16} />}>
          <div className="space-y-5">
            {/* Summary of what's selected — display only */}
            <div className="rounded-xl p-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Recipients</p>
              {count !== null ? (
                <p className="text-3xl font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color: count > 0 ? 'var(--charcoal)' : '#B91C1C', fontVariantNumeric: 'tabular-nums' }}>
                  {count.toLocaleString()}
                </p>
              ) : (
                <Skeleton className="h-8 w-20 mt-1" />
              )}
              <dl className="mt-3 space-y-1.5 text-xs">
                {([
                  ['Group', groupName(recipientGroup)],
                  ['Branch', branchName(branch)],
                  ['When', sendMode === 'schedule' && scheduledAt
                    ? new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Immediately'],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt style={{ color: 'var(--mid-gray)' }}>{k}</dt>
                    <dd className="font-semibold text-right truncate min-w-0" style={{ color: 'var(--charcoal)' }} title={v}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Message preview — display only */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>Preview</p>
              <div className="rounded-2xl p-3" style={{ background: '#F3F4F6' }}>
                <div className="max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words"
                  style={message
                    ? { background: '#fff', color: 'var(--charcoal)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                    : { background: '#fff', color: 'var(--mid-gray)', fontStyle: 'italic' }}>
                  {message || 'Your message will appear here.'}
                </div>
              </div>
            </div>

            {/* When to send */}
            <Field label="When to send">
              <Segmented
                label="When to send"
                value={sendMode}
                onChange={setSendMode}
                options={[
                  { value: 'now', label: 'Send now', icon: Send },
                  { value: 'schedule', label: 'Schedule', icon: Calendar },
                ]}
              />
            </Field>
            {sendMode === 'schedule' && (
              <Field
                label="Scheduled date & time"
                htmlFor="sms-scheduled-at"
                hint={scheduledAt ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                    <CheckCircle2 size={11} className="flex-shrink-0" />
                    Will send {new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'short' })}
                  </span>
                ) : undefined}
              >
                <input id="sms-scheduled-at" type="datetime-local" value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={toDatetimeLocal(new Date(Date.now() + 60000))}
                  className={CONTROL}
                  style={CONTROL_STYLE} />
              </Field>
            )}

            {info && (
              <Notice tone="success" icon={CheckCircle2}>{info}</Notice>
            )}

            <button onClick={handleSend} disabled={busy || overLimit || !count}
              className="w-full inline-flex items-center justify-center gap-2 h-11 text-sm font-bold rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--teal)', color: '#fff', fontFamily: 'var(--font-display)' }}>
              {busy
                ? <Loader2 size={15} className="animate-spin" />
                : sendMode === 'schedule' ? <Calendar size={15} /> : <Send size={15} />}
              {busy
                ? (sendMode === 'schedule' ? 'Scheduling…' : 'Sending…')
                : sendMode === 'schedule'
                  ? `Schedule for ${count ?? '…'} recipient${count === 1 ? '' : 's'}`
                  : `Send to ${count ?? '…'} recipient${count === 1 ? '' : 's'}`}
            </button>
            {(overLimit || count === 0) && (
              <p className="text-[11px] text-center -mt-3" style={{ color: '#B91C1C' }}>
                {overLimit ? `Shorten the message to ${MAX_LEN} characters to send.` : 'No patients match this group and branch.'}
              </p>
            )}
            <p className="text-[11px] text-center -mt-2" style={{ color: 'var(--mid-gray)' }}>
              You&apos;ll be asked to confirm before anything is sent.
            </p>
          </div>
        </DashCard>
      </aside>
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
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const p = new URLSearchParams({ status: statusFilter, branch })
      const r = await fetch('/api/sms/campaigns?' + p.toString())
      const d = await r.json()
      setRows(d.campaigns || [])
      // Surface a failed list load on the page instead of a silent empty table.
      if (!r.ok) setLoadError(d.error || `HTTP ${r.status}`)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error')
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

  // Display-only roll-ups of the rows already loaded for the table.
  const totalSent = rows.reduce((s, r) => s + (r.sentCount || 0), 0)
  const totalRecipients = rows.reduce((s, r) => s + (r.recipientCount || 0), 0)
  const scheduledCount = rows.filter(r => r.status === 'scheduled').length
  const inProgressCount = rows.filter(r => r.status === 'sending' || r.status === 'partial').length
  const failedCount = rows.filter(r => r.status === 'failed').length

  return (
    <div className="space-y-5">
      {loadError && (
        <ErrorBanner title="Couldn't load past campaigns" message={loadError} onRetry={load} />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? <KpiSkeletonRow count={4} /> : (
          <>
            <KpiCard label="Campaigns" icon={<FileText size={16} />}
              value={rows.length.toLocaleString()}
              sub={rows.length >= 50 ? 'Most recent 50 shown' : branchName(branch)} />
            <KpiCard label="Messages sent" icon={<Send size={16} />} accent="var(--bright-teal)"
              value={totalSent.toLocaleString()}
              sub={`of ${totalRecipients.toLocaleString()} recipients`} />
            <KpiCard label="Scheduled" icon={<Calendar size={16} />} accent="#3B82F6"
              value={scheduledCount.toLocaleString()}
              sub="Waiting to send" />
            <KpiCard label="In progress" icon={<Clock size={16} />} accent="#D97706"
              value={inProgressCount.toLocaleString()}
              sub={failedCount > 0
                ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>{failedCount} failed</span>
                : 'None failed'} />
          </>
        )}
      </div>

      <DashCard
        title="Past Campaigns"
        icon={<FileText size={16} />}
        description={loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'record' : 'records'}`}
        flush
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select value={branch} onChange={(e) => setBranch(e.target.value as Branch)}
              aria-label="Filter by branch"
              className={CONTROL_SM}
              style={CONTROL_STYLE}>
              <option value="BOTH">Both branches</option>
              <option value="SBEA">{branchLabel('SBEA')}</option>
              <option value="SBGH">{branchLabel('SBGH')}</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className={CONTROL_SM}
              style={CONTROL_STYLE}>
              <option value="all">All statuses</option>
              <option value="sent">Sent</option>
              <option value="partial">Partial</option>
              <option value="sending">Sending</option>
              <option value="scheduled">Scheduled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={loadError ? 'Nothing to show' : 'No campaigns yet.'}
            hint={statusFilter === 'all' && branch === 'BOTH'
              ? 'Campaigns you send or schedule from New Campaign will appear here.'
              : 'Nothing matches these filters — try “Both branches” and “All statuses”.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <th className={TH}>Campaign</th>
                  <th className={TH}>Group</th>
                  <th className={TH}>Branch</th>
                  <th className={`${TH} text-right`}>Recipients</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Sent</th>
                  <th className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-black/[0.015]" style={{ borderBottom: '1px solid #EEF2F1' }}>
                    <td className="px-4 py-3 align-top">
                      <button type="button" onClick={() => setPreview(r)}
                        className="block text-sm font-semibold hover:underline text-left truncate max-w-[260px]"
                        style={{ color: 'var(--charcoal)' }} title={r.subject}>
                        {r.subject || <em style={{ color: 'var(--mid-gray)' }}>(no subject)</em>}
                      </button>
                      <p className="text-[11px] mt-0.5 truncate max-w-[260px]" style={{ color: 'var(--mid-gray)' }} title={r.message}>{r.message}</p>
                    </td>
                    <td className="px-4 py-3 align-top text-xs" style={{ color: 'var(--charcoal)' }}>
                      <span className="block max-w-[180px] truncate" title={r.recipientGroup}>{groupName(r.recipientGroup)}</span>
                    </td>
                    {/* Same internal-code leak as the compose screen: this column
                        was printing SBEA/SBGH. */}
                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>
                      {branchName(r.branch)}
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{r.recipientCount.toLocaleString()}</div>
                      <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.sentCount.toLocaleString()} sent</div>
                    </td>
                    <td className="px-4 py-3 align-top"><StatusBadge row={r} /></td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {r.sentAt ? (
                        <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{fmtDateTime(r.sentAt)}</div>
                      ) : r.scheduledAt ? (
                        <>
                          <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{fmtDateTime(r.scheduledAt)}</div>
                          <div className="text-[11px]" style={{ color: '#1E40AF' }}>Scheduled</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{fmtDateTime(r.createdAt)}</div>
                          <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Created</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <RowAction title="View" onClick={() => setPreview(r)} hover="hover:bg-stone-100">
                          <Eye size={14} style={{ color: 'var(--mid-gray)' }} />
                        </RowAction>
                        {r.status === 'partial' && (
                          <RowAction title="Fire next tranche now" onClick={() => scheduleNow(r.id)} hover="hover:bg-amber-50">
                            <Zap size={14} style={{ color: '#92400E' }} />
                          </RowAction>
                        )}
                        {(r.status === 'failed' || r.status === 'partial') && r.sentCount < r.recipientCount && (
                          <RowAction title="Resume sending" onClick={() => resumeCampaign(r.id)} hover="hover:bg-emerald-50">
                            <Play size={14} style={{ color: '#065F46' }} />
                          </RowAction>
                        )}
                        <RowAction title="Delete" onClick={() => deleteCampaign(r.id)} hover="hover:bg-red-50">
                          <Trash2 size={14} style={{ color: '#991B1B' }} />
                        </RowAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {preview && (
        <div onClick={() => setPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={MODAL_BACKDROP}>
          <div onClick={(e) => e.stopPropagation()}
            className="rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden"
            style={{ background: '#fff' }}>
            <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="min-w-0">
                <h3 className="text-sm font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>{preview.subject}</h3>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--mid-gray)' }}>
                  {groupName(preview.recipientGroup)} · {branchName(preview.branch)} · {preview.recipientCount} recipients
                </p>
              </div>
              <div className="flex-shrink-0"><StatusBadge row={preview} /></div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--mid-gray)' }}>Message</p>
              <div className="rounded-2xl p-3" style={{ background: '#F3F4F6' }}>
                <pre className="max-w-[90%] text-[13px] leading-snug whitespace-pre-wrap break-words font-mono px-3 py-2 rounded-2xl rounded-bl-md"
                  style={{ background: '#fff', color: 'var(--charcoal)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>{preview.message}</pre>
              </div>
              <p className="text-[11px] mt-1.5 text-right" style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>
                {preview.message.length}/{MAX_LEN} characters
              </p>
            </div>
            <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid var(--light-gray)' }}>
              <button type="button" onClick={() => setPreview(null)}
                className={BTN_SECONDARY}
                style={{ ...CONTROL_STYLE, color: 'var(--charcoal)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
