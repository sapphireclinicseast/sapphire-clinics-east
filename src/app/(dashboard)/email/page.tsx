'use client'

import { useState, useEffect, useRef } from 'react'
import { Mail, Sparkles, Send, Users, ChevronDown, Clock, Calendar, CheckCircle2, CheckSquare, Square, FileText, Trash2, Eye, X, RotateCw, Zap, Code, Monitor, FlaskConical, Check } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'

const BRANCH_FILTERS = [
  { value: 'SANDBOX_EAST',       label: branchLabel('SANDBOX_EAST') },
  { value: 'SANDBOX_GREENHILLS', label: branchLabel('SANDBOX_GREENHILLS') },
  { value: 'VERDANA_STORE',      label: branchLabel('VERDANA_STORE') },
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

// Wrap body content in a branded HTML email template with inline styles.
// Mirrors what recipients actually see — plain text becomes paragraphs,
// existing HTML is embedded as-is inside the branded wrapper.
function buildEmailHtml(subject: string, body: string): string {
  const isHtml = /<[a-z][\s\S]*>/i.test(body)
  const bodyHtml = isHtml
    ? body
    : body
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 16px;line-height:1.75;color:#1a1a1a;">${p.replace(/\n/g, '<br>')}</p>`)
        .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject.replace(/</g, '&lt;')}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f5;padding:28px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:#1a7b8a;padding:26px 36px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.3px;">Sapphire Clinics East</p>
          <p style="margin:5px 0 0;color:rgba(255,255,255,0.72);font-size:12px;font-family:Arial,Helvetica,sans-serif;">Aura Health Rehab Clinic</p>
        </td>
      </tr>

      <!-- Subject banner -->
      <tr>
        <td style="padding:20px 36px 0;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#0f2d35;font-family:Arial,Helvetica,sans-serif;line-height:1.3;">${subject.replace(/</g, '&lt;')}</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:20px 36px 32px;font-size:15px;line-height:1.75;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;">
          ${bodyHtml}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:18px 36px 24px;border-top:1px solid #e5e7eb;background:#fafafa;">
          <p style="margin:0;font-size:11px;color:#9ca3af;font-family:Arial,Helvetica,sans-serif;line-height:1.7;">
            You are receiving this email because you are a patient of Sapphire Clinics East — Aura Health Rehab Clinic.<br>
            To update your contact preferences, please reach us at our clinic directly.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

export default function EmailPage() {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pasteUploading, setPasteUploading] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)
  const [recipientGroup, setRecipientGroup] = useState('all')
  // Address(es) that get a single copy of the campaign. Pre-filled from the
  // most recent campaign that used one (see the load effect below).
  const [ccEmails, setCcEmails] = useState('')
  const [branchFilter, setBranchFilter] = useState<Set<string>>(new Set())  // empty = no filter
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [htmlCopied, setHtmlCopied] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [sent, setSent] = useState(false)
  const [scheduled, setScheduled] = useState(false)
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string; displayName?: string }[]>([])
  const [selectedGmailId, setSelectedGmailId] = useState<string>('')

  // ── View toggle: "compose" (new) or "history" (past campaigns) ──
  const [view, setView] = useState<'compose' | 'history'>('compose')

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

  // Pre-fill the "send me a copy" box with the address used on the most recent
  // campaign that had one, so it doesn't have to be retyped every send. Still
  // fully editable/clearable per campaign.
  useEffect(() => {
    fetch('/api/email/campaigns?status=all')
      .then(r => r.ok ? r.json() : null)
      .then((d: { campaigns?: { ccEmails?: string | null }[] } | null) => {
        const last = d?.campaigns?.find(c => c.ccEmails && c.ccEmails.trim())
        if (last?.ccEmails) setCcEmails(last.ccEmails)
      })
      .catch(() => { /* pre-fill is a convenience; never block composing */ })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchCount(controller.signal)
    return () => controller.abort()
  }, [recipientGroup, branchFilter])

  async function fetchCount(signal?: AbortSignal) {
    setRecipientCount(null)
    const params = new URLSearchParams()
    if (recipientGroup === 'pediatric') params.set('type', 'PEDIATRIC')
    if (recipientGroup === 'adult')     params.set('type', 'ADULT')
    if (branchFilter.size > 0) params.set('branches', Array.from(branchFilter).join(','))
    try {
      const res = await fetch(`/api/patients?${params}`, { signal })
      if (!res.ok) return
      const data = await res.json()
      const withEmail = (data.patients ?? []).filter((p: any) => !!p.email).length
      setRecipientCount(withEmail)
    } catch (e: any) {
      if (e?.name !== 'AbortError') throw e
    }
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


  // Handle paste: if it contains an image, upload it and insert <img> tag at
  // the cursor. Plain text falls through to default browser behavior.
  async function handleBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageItems: File[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) imageItems.push(f)
      }
    }
    if (imageItems.length === 0) return // let default paste happen
    e.preventDefault()
    setPasteUploading(true)
    try {
      const ta = bodyRef.current
      const cursorStart = ta?.selectionStart ?? body.length
      const cursorEnd   = ta?.selectionEnd   ?? body.length
      const before = body.slice(0, cursorStart)
      const after  = body.slice(cursorEnd)
      const inserts: string[] = []
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      for (const file of imageItems) {
        const fd = new FormData()
        fd.append('file', file, file.name || 'pasted.png')
        fd.append('folder', 'email-images')
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Upload failed')
        }
        const data = await res.json() as { url: string }
        const absoluteUrl = data.url.startsWith('http') ? data.url : origin + data.url
        inserts.push(`<img src="${absoluteUrl}" alt="" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`)
      }
      const insertText = inserts.join('\n')
      const newBody = before + insertText + after
      setBody(newBody)
      // Restore cursor position after the inserted text
      setTimeout(() => {
        if (ta) {
          const pos = cursorStart + insertText.length
          ta.focus()
          ta.setSelectionRange(pos, pos)
        }
      }, 0)
    } catch (err) {
      alert('Image paste failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPasteUploading(false)
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
        ccEmails: ccEmails.trim() || undefined,
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

  function copyAsHtml() {
    navigator.clipboard.writeText(buildEmailHtml(subject, body))
    setHtmlCopied(true)
    setTimeout(() => setHtmlCopied(false), 2500)
  }

  async function sendTestEmail() {
    if (!subject || !body) return alert('Fill in subject and body first.')
    setTestSending(true)
    setTestSent(false)
    try {
      const res = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `[TEST] ${subject}`,
          body: buildEmailHtml(subject, body),
          gmailAccountId: selectedGmailId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTestSent(true)
      setTimeout(() => setTestSent(false), 4000)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send test email.')
    } finally {
      setTestSending(false)
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

      {/* Tab switcher: Compose / History */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#f1f5f9', maxWidth: 340 }}>
        {([
          { id: 'compose' as const, label: 'New Campaign', icon: Send },
          { id: 'history' as const, label: 'Past Campaigns', icon: FileText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all flex-1 justify-center"
            style={view === id
              ? { background: '#fff', color: 'var(--teal)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
              : { background: 'transparent', color: 'var(--mid-gray)' }
            }
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {view === 'history' && <CampaignHistory />}

      {view === 'compose' && (
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

        {/* Copy me — one copy of the campaign, not a per-recipient Cc header */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--mid-gray)' }}>
            Send me a copy (optional)
          </label>
          <input
            type="text"
            value={ccEmails}
            onChange={(e) => setCcEmails(e.target.value)}
            placeholder="you@sapphireclinicseast.org"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
          />
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>
            Gets <strong>one</strong> copy of this campaign when it starts sending — not one per recipient.
            Patients never see this address. Separate multiple addresses with commas.
          </p>
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
              style={{ border: '1px solid rgba(26,123,138,0.3)', background: '#fff' }}
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
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handleBodyPaste}
            rows={10}
            placeholder="Write your email content here, or generate with AI above… You can paste (Ctrl+V) images to embed them."
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
            style={{ border: '1.5px solid var(--light-gray)', color: 'var(--charcoal)' }}
          />
          <p className="text-[11px] mt-1.5" style={{ color: pasteUploading ? '#1d4ed8' : 'var(--mid-gray)' }}>
            {pasteUploading
              ? '⏳ Uploading pasted image…'
              : '💡 Tip: Paste images directly with Ctrl+V — they\'ll be uploaded and embedded as HTML in the email.'}
          </p>

          {/* Copy HTML + Preview toggle */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={copyAsHtml}
              disabled={!body}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: body ? (htmlCopied ? '#059669' : 'var(--charcoal)') : 'var(--light-gray)',
                color: body ? '#fff' : 'var(--mid-gray)',
              }}
            >
              {htmlCopied ? <Check size={12} /> : <Code size={12} />}
              {htmlCopied ? 'HTML Copied!' : 'Copy as HTML Email'}
            </button>
            <button
              type="button"
              onClick={sendTestEmail}
              disabled={!body || testSending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: !body ? 'var(--light-gray)' : testSent ? '#059669' : '#7C3AED',
                color: !body ? 'var(--mid-gray)' : '#fff',
              }}
            >
              {testSent ? <Check size={12} /> : <FlaskConical size={12} />}
              {testSending ? 'Sending…' : testSent ? 'Test sent to marketing@!' : 'Send Test Email'}
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(p => !p)}
              disabled={!body}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                border: `1.5px solid ${showPreview ? 'var(--teal)' : 'var(--light-gray)'}`,
                background: showPreview ? 'var(--pale-teal)' : 'transparent',
                color: showPreview ? 'var(--teal)' : 'var(--mid-gray)',
              }}
            >
              <Monitor size={12} />
              {showPreview ? 'Hide Preview' : 'Preview Email'}
            </button>
            {body && (
              <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                Copy the HTML, then paste into any email client's HTML source editor.
              </span>
            )}
          </div>

          {/* Live email preview iframe */}
          {showPreview && body && (
            <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--teal)' }}>
              <div
                className="px-4 py-2 flex items-center gap-2"
                style={{ background: 'var(--pale-teal)', borderBottom: '1px solid rgba(26,123,138,0.2)' }}
              >
                <Monitor size={13} style={{ color: 'var(--teal)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>Email Preview</span>
                <span className="text-xs ml-1" style={{ color: 'var(--mid-gray)' }}>— exactly how recipients will see it</span>
              </div>
              <iframe
                key={body + subject}
                srcDoc={buildEmailHtml(subject || '(no subject)', body)}
                title="Email preview"
                sandbox="allow-same-origin"
                style={{ width: '100%', height: '560px', border: 'none', display: 'block', background: '#fff' }}
              />
            </div>
          )}
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
    )}
    </div>
  )
}

// ── Campaign History ─────────────────────────────────────────────────────────

// recipientGroup is stored as the raw internal encoding (e.g.
// "all|SANDBOX_EAST,VERDANA_STORE" — see /api/email/send's storedGroup).
// Render it through the same friendly labels used in the compose form
// above, instead of the raw group/branch codes.
function formatRecipientGroup(raw: string): string {
  const [groupKey, branchPart] = raw.split('|')
  const groupLabel = RECIPIENT_GROUPS.find(g => g.value === groupKey)?.label ?? groupKey
  if (!branchPart) return groupLabel
  const branchLabels = branchPart.split(',').map(b => BRANCH_FILTERS.find(f => f.value === b)?.label ?? b)
  return `${groupLabel} — ${branchLabels.join(', ')}`
}

interface HistoryRow {
  id: string
  subject: string
  recipientGroup: string
  recipientCount: number
  sentCount: number
  status: string
  scheduledAt: string | null
  sentAt: string | null
  nextTrancheAt: string | null
  createdAt: string
}

function CampaignHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [preview, setPreview] = useState<{ id: string; subject: string; body: string } | null>(null)
  const [historyCopied, setHistoryCopied] = useState(false)

  function copyPreviewHtml() {
    if (!preview) return
    navigator.clipboard.writeText(buildEmailHtml(preview.subject, preview.body))
    setHistoryCopied(true)
    setTimeout(() => setHistoryCopied(false), 2500)
  }

  async function load() {
    setLoading(true)
    try {
      const p = new URLSearchParams({ status: statusFilter })
      const r = await fetch('/api/email/campaigns?' + p.toString())
      const d = await r.json()
      setRows(d.campaigns || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter])

  async function openPreview(id: string) {
    try {
      const r = await fetch('/api/email/campaigns/' + id)
      const d = await r.json()
      if (d.campaign) setPreview({ id: d.campaign.id, subject: d.campaign.subject, body: d.campaign.body })
    } catch (e) {
      alert('Failed to load campaign')
    }
  }


  async function resumeCampaign(id: string) {
    if (!confirm('Resume sending this campaign from where it stopped?')) return
    try {
      const r = await fetch('/api/email/campaigns/' + id + '/resume', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Resume failed')
      const msg = d.resuming
        ? 'Resuming from ' + d.startFrom + '/' + d.total + ' — refresh in a few minutes to see updated progress.'
        : 'Sending started.'
      alert(msg)
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  async function scheduleNow(id: string) {
    if (!confirm('Fire the next tranche immediately? (otherwise it will run automatically tomorrow morning)')) return
    try {
      const r = await fetch('/api/email/campaigns/' + id + '/schedule-now', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Schedule failed')
      alert('Tranche fired — resuming from ' + d.startFrom + '/' + d.total + '.')
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  async function deleteCampaign(id: string) {
    if (!confirm('Delete this campaign record? The email that was already sent cannot be recalled.')) return
    try {
      const r = await fetch('/api/email/campaigns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!r.ok) throw new Error('Delete failed')
      await load()
    } catch (e) { alert((e as Error).message) }
  }

  function statusBadge(row: HistoryRow) {
    // New 'partial' status: send-loop hit the daily cap or a transient rate-limit
    // and auto-scheduled the next tranche. Show progress + next-batch ETA.
    if (row.status === 'partial') {
      const nextLabel = row.nextTrancheAt
        ? new Date(row.nextTrancheAt).toLocaleString('en-PH', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })
        : null
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#FEF3C7', color: '#92400E' }}
          title={nextLabel ? 'Next batch fires automatically — no action needed' : ''}>
          Partial ({row.sentCount}/{row.recipientCount})
          {nextLabel ? <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· next batch {nextLabel}</span> : null}
        </span>
      )
    }
    // Legacy: 'failed' with sentCount > 0 — older partials before the auto-tranche feature
    if (row.status === 'failed' && row.sentCount > 0 && row.sentCount < row.recipientCount) {
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#FFEDD5', color: '#9A3412' }}>
          Partial ({row.sentCount}/{row.recipientCount})
        </span>
      )
    }
    // Sent but with a sentCount < total (edge case — e.g. some had no email)
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
        <h2 className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Past Campaigns</h2>
        <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="scheduled">Scheduled</option>
            <option value="sending">Sending</option>
            <option value="failed">Failed</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No campaigns yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--light-gray)' }}>
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Subject</th>
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Recipients</th>
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Status</th>
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Sent / Scheduled</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-xs truncate max-w-[300px]" style={{ color: 'var(--charcoal)' }} title={r.subject}>{r.subject || '(no subject)'}</div>
                    <div className="text-[10px]" style={{ color: 'var(--mid-gray)' }}>{formatRecipientGroup(r.recipientGroup)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>{r.recipientCount}</td>
                  <td className="px-4 py-3">{statusBadge(r)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>
                    {r.sentAt
                      ? new Date(r.sentAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                      : r.scheduledAt
                        ? 'Scheduled ' + new Date(r.scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                        : new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openPreview(r.id)} title="Preview" className="p-1.5 rounded hover:bg-gray-100 inline-block">
                      <Eye size={13} style={{ color: 'var(--mid-gray)' }} />
                    </button>
                    {(r.status === 'partial') && (
                      <>
                        <button onClick={() => scheduleNow(r.id)} title="Fire next tranche now" className="p-1.5 rounded hover:bg-amber-50 inline-block">
                          <Zap size={13} style={{ color: '#92400E' }} />
                        </button>
                        <button onClick={() => resumeCampaign(r.id)} title="Resume sending" className="p-1.5 rounded hover:bg-emerald-50 inline-block">
                          <RotateCw size={13} style={{ color: '#059669' }} />
                        </button>
                      </>
                    )}
                    {(r.status === 'failed' && r.sentCount < r.recipientCount) && (
                      <button onClick={() => resumeCampaign(r.id)} title="Resume sending" className="p-1.5 rounded hover:bg-emerald-50 inline-block">
                        <RotateCw size={13} style={{ color: '#059669' }} />
                      </button>
                    )}
                    <button onClick={() => deleteCampaign(r.id)} title="Delete record" className="p-1.5 rounded hover:bg-red-50 inline-block">
                      <Trash2 size={13} style={{ color: '#DC2626' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: 'var(--light-gray)' }}>
              <div className="truncate flex-1">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Subject</p>
                <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>{preview.subject}</p>
              </div>
              <button
                onClick={copyPreviewHtml}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
                style={{
                  background: historyCopied ? '#059669' : 'var(--charcoal)',
                  color: '#fff',
                }}
              >
                {historyCopied ? <Check size={12} /> : <Code size={12} />}
                {historyCopied ? 'Copied!' : 'Copy HTML'}
              </button>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div
                className="text-sm"
                style={{ color: 'var(--charcoal)', lineHeight: 1.6, whiteSpace: /<[a-z][\s\S]*>/i.test(preview.body) ? 'normal' : 'pre-wrap' }}
                dangerouslySetInnerHTML={/<[a-z][\s\S]*>/i.test(preview.body) ? { __html: preview.body } : undefined as unknown as { __html: string }}
              >
                {!/<[a-z][\s\S]*>/i.test(preview.body) ? preview.body : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

