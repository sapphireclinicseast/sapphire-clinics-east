'use client'

import { useState, useEffect } from 'react'
import { Mail, Sparkles, Send, Users, ChevronDown, Clock, Calendar, CheckCircle2, CheckSquare, Square } from 'lucide-react'

const BRANCH_FILTERS = [
  { value: 'SANDBOX_EAST',       label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
  { value: 'VERDANA_STORE',      label: 'Verdana Store' },
]

const RECIPIENT_GROUPS = [
  { value: 'all', label: 'All Patients', desc: 'Send to all patients in your database' },
  { value: 'pediatric', label: 'Pediatric Patients', desc: 'Patients under 18 years old' },
  { value: 'adult', label: 'Adult Patients', desc: 'Patients 18 years and older' },
  { value: 'birthday-month', label: 'Birthday This Month', desc: 'Patients with birthdays this calendar month' },
]

// Format a Date to "YYYY-MM-DDTHH:MM" for datetime-local input
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EmailPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [recipientGroup, setRecipientGroup] = useState('all')
  const [branchFilter, setBranchFilter] = useState<Set<string>>(new Set())  // empty = no filter
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [sent, setSent] = useState(false)
  const [scheduled, setScheduled] = useState(false)
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string; displayName?: string }[]>([])
  const [selectedGmailId, setSelectedGmailId] = useState<string>('')

  // Scheduling
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setHours(9, 0, 0, 0)
  const [scheduledAt, setScheduledAt] = useState<string>(toDatetimeLocal(tomorrow))

  useEffect(() => {
    fetch('/api/gmail-accounts')
      .then((r) => r.json())
      .then((d) => {
        const accts = d.accounts || []
        setGmailAccounts(accts)
        if (accts.length > 0) setSelectedGmailId(accts[0].id)
      })
  }, [])

  useEffect(() => { fetchCount() }, [recipientGroup, branchFilter])

  async function fetchCount() {
    const params = new URLSearchParams()
    if (recipientGroup === 'pediatric') params.set('type', 'PEDIATRIC')
    if (recipientGroup === 'adult')     params.set('type', 'ADULT')
    // Pass branches as comma-separated if any selected
    if (branchFilter.size > 0) params.set('branches', Array.from(branchFilter).join(','))
    const res = await fetch(`/api/patients?${params}`)
    const data = await res.json()
    // Count only patients who have an email
    const withEmail = (data.patients ?? []).filter((p: any) => !!p.email).length
    setRecipientCount(withEmail)
  }

  async function generateEmail() {
    if (!aiPrompt.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `Email newsletter for patients: ${aiPrompt}. Write in HTML-compatible plain text, warm and professional.` }),
      })
      const data = await res.json()
      if (data.caption) {
        setBody(data.caption)
        if (!subject) setSubject(`From Sapphire Clinics East: ${aiPrompt.slice(0, 50)}`)
      }
    } catch {
      alert('AI generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  async function sendEmail() {
    if (!subject || !body) return alert('Fill in subject and body.')
    setSending(true)
    try {
      const payload: any = {
        subject,
        body,
        recipientGroup,
        gmailAccountId: selectedGmailId || undefined,
        branches: branchFilter.size > 0 ? Array.from(branchFilter) : undefined,
      }
      if (sendMode === 'schedule' && scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (data.scheduled) setScheduled(true)
      else setSent(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send. Check Google Workspace integration.')
    } finally {
      setSending(false)
    }
  }

  function resetForm() {
    setSent(false)
    setScheduled(false)
    setSubject('')
    setBody('')
    setAiPrompt('')
    setSendMode('now')
  }

  if (sent || scheduled) {
    return (
      <div className="max-w-xl flex flex-col items-center text-center py-16">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--pale-teal)' }}>
          {scheduled ? <Clock size={36} style={{ color: 'var(--teal)' }} /> : <Mail size={36} style={{ color: 'var(--teal)' }} />}
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          {scheduled ? 'Email Campaign Scheduled!' : 'Email Campaign Queued!'}
        </h2>
        <p className="text-sm mb-2" style={{ color: 'var(--mid-gray)' }}>
          {scheduled
            ? `Your email will be sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''} on ${new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : `Your email is being sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}.`}
        </p>
        <button
          onClick={resetForm}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold mt-4"
          style={{ background: 'var(--teal)', color: '#fff' }}
        >
          Send Another
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
          Patients & Email
        </p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Email Campaigns
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
          Send newsletters or targeted emails to patients via Google Workspace.
        </p>
      </div>

      <div className="rounded-xl p-6 space-y-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>

        {/* Sender account selector */}
        {gmailAccounts.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
              Send From
            </label>
            <div className="relative">
              <select
                value={selectedGmailId}
                onChange={(e) => setSelectedGmailId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none appearance-none pr-8"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              >
                {gmailAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName && a.displayName !== a.email ? `${a.displayName} (${a.email})` : a.email}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            </div>
          </div>
        )}

        {/* Recipient group */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--mid-gray)' }}>
            Recipients
          </label>
          <div className="grid grid-cols-2 gap-2">
            {RECIPIENT_GROUPS.map((g) => (
              <label
                key={g.value}
                className="flex gap-3 p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  border: `1.5px solid ${recipientGroup === g.value ? 'var(--teal)' : 'var(--light-gray)'}`,
                  background: recipientGroup === g.value ? 'var(--pale-teal)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="recipientGroup"
                  value={g.value}
                  checked={recipientGroup === g.value}
                  onChange={() => setRecipientGroup(g.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{g.label}</p>
                  <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{g.desc}</p>
                </div>
              </label>
            ))}
          </div>
          {recipientCount !== null && (
            <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--teal)' }}>
              <Users size={12} />
              {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Branch filter */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
            Filter by Branch
            <span className="ml-1 normal-case font-normal">(optional — leave unchecked to include all branches)</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {BRANCH_FILTERS.map((b) => {
              const active = branchFilter.has(b.value)
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBranchFilter((prev) => {
                    const next = new Set(prev)
                    next.has(b.value) ? next.delete(b.value) : next.add(b.value)
                    return next
                  })}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    border:     `1.5px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                    background: active ? 'var(--pale-teal)' : 'transparent',
                    color:      active ? 'var(--teal)'     : 'var(--mid-gray)',
                  }}
                >
                  {active
                    ? <CheckSquare size={14} style={{ color: 'var(--teal)' }} />
                    : <Square size={14} />}
                  {b.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
            Subject Line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. A message from Sapphire Clinics East"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
          />
        </div>

        {/* AI generation */}
        <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--pale-teal)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>
            <Sparkles size={12} className="inline mr-1" />
            Generate with AI
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. 'monthly wellness tips' or 'holiday greeting'"
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: '1px solid rgba(46,94,90,0.3)', background: '#fff' }}
              onKeyDown={(e) => e.key === 'Enter' && generateEmail()}
            />
            <button
              onClick={generateEmail}
              disabled={generating}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--teal)', color: '#fff' }}
            >
              {generating ? '…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Email body */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
            Email Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Write your email content here, or generate with AI above…"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
            style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
          />
        </div>

        {/* Send mode toggle */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--mid-gray)' }}>
            When to Send
          </label>
          <div className="flex gap-2">
            {(['now', 'schedule'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSendMode(mode)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold flex-1 justify-center"
                style={{
                  border: `1.5px solid ${sendMode === mode ? 'var(--teal)' : 'var(--light-gray)'}`,
                  background: sendMode === mode ? 'var(--pale-teal)' : 'transparent',
                  color: sendMode === mode ? 'var(--teal)' : 'var(--mid-gray)',
                }}
              >
                {mode === 'now' ? <><Send size={14} /> Send Now</> : <><Calendar size={14} /> Schedule</>}
              </button>
            ))}
          </div>

          {sendMode === 'schedule' && (
            <div className="mt-3">
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--mid-gray)' }}>
                Scheduled Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={toDatetimeLocal(new Date(Date.now() + 60000))}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
              />
              {scheduledAt && (
                <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                  <CheckCircle2 size={11} />
                  Scheduled for {new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'short' })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Google Workspace notice */}
        <div
          className="text-xs px-4 py-3 rounded-lg"
          style={{ background: '#FFF9EC', border: '1px solid rgba(201,162,39,0.3)', color: 'var(--gold)' }}
        >
          <strong>Note:</strong> Emails are sent via your Google Workspace account. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured in your environment.
        </div>

        <button
          onClick={sendEmail}
          disabled={sending || !subject || !body}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
          style={{
            background: subject && body ? 'var(--teal)' : 'var(--light-gray)',
            color: subject && body ? '#fff' : 'var(--mid-gray)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {sendMode === 'schedule' ? <Calendar size={15} /> : <Send size={15} />}
          {sending
            ? (sendMode === 'schedule' ? 'Scheduling…' : 'Sending…')
            : sendMode === 'schedule'
              ? `Schedule for ${recipientCount ?? '…'} Recipients`
              : `Send to ${recipientCount ?? '…'} Recipients`}
        </button>
      </div>
    </div>
  )
}
