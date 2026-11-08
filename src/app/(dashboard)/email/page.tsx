'use client'

import { useState, useEffect, useRef } from 'react'
import { Mail, Sparkles, Send, Users, ChevronDown, Clock, Calendar, CheckCircle2, CheckSquare, Square, FileText, Trash2, Eye, X, RotateCw, Zap, Code, Monitor, FlaskConical, Check, Plus, Info, Loader2, ImageIcon } from 'lucide-react'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, DashCard, KpiCard, Skeleton, EmptyState } from '../patients/dashboard/ui'
import {
  CONTROL, TEXTAREA, CONTROL_SM, CONTROL_STYLE, BTN_PRIMARY, BTN_SECONDARY, TH, MODAL_BACKDROP, SUBTLE_BG,
  PageHeader, PillTabs, Field, Segmented, StatusBadge, Notice, ErrorBanner, TableSkeleton, KpiSkeletonRow, RowAction, fmtDateTime,
} from './campaign-ui'

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
      // A proxy timeout or gateway error replies with an HTML page, not JSON.
      // Parsing it blind produced «Unexpected token '<', "<html>...», which tells
      // the operator nothing and looks like nothing was sent — the one reading
      // that makes them press Send again and mail the whole list twice.
      const raw = await res.text()
      let data: { error?: string; scheduled?: boolean } = {}
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        throw new Error(
          `The server did not respond in time (HTTP ${res.status}). The send may still be running — ` +
          `check Campaign History below before sending again, or you may email everyone twice.`,
        )
      }
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
      <div className="max-w-xl mx-auto pt-6">
        <div className="rounded-2xl px-8 py-12 flex flex-col items-center text-center" style={CARD_STYLE}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--pale-teal)' }}>
            {scheduled ? <Clock size={30} style={{ color: 'var(--teal)' }} /> : <Mail size={30} style={{ color: 'var(--teal)' }} />}
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            {scheduled ? 'Email Campaign Scheduled!' : 'Email Campaign Queued!'}
          </h2>
          <p className="text-sm max-w-sm" style={{ color: 'var(--mid-gray)' }}>
            {scheduled
              ? `Your email will be sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''} on ${new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.`
              : `Your email is being sent to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}.`}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--mid-gray)' }}>
            Track its progress under Past Campaigns.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            <button type="button" onClick={() => { resetForm(); setView('history') }}
              className={`${BTN_SECONDARY} h-9 text-sm`} style={{ ...CONTROL_STYLE, color: 'var(--charcoal)' }}>
              <FileText size={14} /> View past campaigns
            </button>
            <button onClick={resetForm} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
              <Send size={14} /> Send Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  const groupLabel = RECIPIENT_GROUPS.find(g => g.value === recipientGroup)?.label ?? recipientGroup
  const branchSummary = branchFilter.size > 0
    ? Array.from(branchFilter).map(b => BRANCH_FILTERS.find(f => f.value === b)?.label ?? b).join(', ')
    : 'All branches'
  const sender = gmailAccounts.find(a => a.id === selectedGmailId)
  const canSend = !!subject && !!body

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Patients & Email"
        title="Email Campaigns"
        subtitle="Send newsletters or targeted emails to patients via Google Workspace."
        action={
          <button type="button" onClick={() => setView('compose')} className={BTN_PRIMARY} style={{ background: 'var(--teal)' }}>
            <Plus size={15} /> New campaign
          </button>
        }
      />

      <PillTabs
        label="Email campaign sections"
        value={view}
        onChange={setView}
        tabs={[
          { id: 'compose', label: 'New Campaign', icon: Send },
          { id: 'history', label: 'Past Campaigns', icon: FileText },
        ]}
      />

      {view === 'history' && <CampaignHistory />}

      {view === 'compose' && (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        {/* ── Left: audience + message ── */}
        <div className="space-y-5 min-w-0">
          <DashCard
            title="Audience"
            icon={<Users size={16} />}
            description="Choose the sending account and who receives this campaign."
            action={
              recipientCount !== null ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                  <Users size={12} />
                  {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} selected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  <Loader2 size={12} className="animate-spin" /> Counting…
                </span>
              )
            }
          >
            <div className="space-y-5">
              {/* Sender account selector */}
              {gmailAccounts.length > 0 && (
                <Field label="Send From" htmlFor="email-send-from">
                  <div className="relative">
                    <select
                      id="email-send-from"
                      value={selectedGmailId}
                      onChange={(e) => setSelectedGmailId(e.target.value)}
                      className={`${CONTROL} appearance-none pr-8`}
                      style={CONTROL_STYLE}
                    >
                      {gmailAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName && a.displayName !== a.email ? `${a.displayName} (${a.email})` : a.email}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
                  </div>
                </Field>
              )}

              {/* Recipient group */}
              <Field label="Recipients">
                <div className="grid sm:grid-cols-2 gap-2">
                  {RECIPIENT_GROUPS.map((g) => {
                    const active = recipientGroup === g.value
                    return (
                      <label
                        key={g.value}
                        className="flex gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-black/[0.02]"
                        style={{
                          border: `1px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                          background: active ? 'var(--pale-teal)' : '#fff',
                          boxShadow: active ? '0 0 0 1px var(--teal) inset' : undefined,
                        }}
                      >
                        <input
                          type="radio"
                          name="recipientGroup"
                          value={g.value}
                          checked={active}
                          onChange={() => setRecipientGroup(g.value)}
                          className="mt-0.5 accent-[var(--teal)]"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{g.label}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>{g.desc}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </Field>

              {/* Branch filter */}
              <Field
                label="Filter by Branch"
                aside={<span style={{ color: 'var(--mid-gray)' }}>Optional</span>}
                hint="Leave all unchecked to include every branch."
              >
                <div className="flex flex-wrap gap-2">
                  {BRANCH_FILTERS.map((b) => {
                    const active = branchFilter.has(b.value)
                    return (
                      <button
                        key={b.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setBranchFilter((prev) => {
                          const next = new Set(prev)
                          next.has(b.value) ? next.delete(b.value) : next.add(b.value)
                          return next
                        })}
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold transition-colors"
                        style={{
                          border:     `1px solid ${active ? 'var(--teal)' : 'var(--light-gray)'}`,
                          background: active ? 'var(--pale-teal)' : '#fff',
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
              </Field>
            </div>
          </DashCard>

          <DashCard
            title="Message"
            icon={<Mail size={16} />}
            description="Plain text becomes paragraphs; HTML is embedded as-is inside the branded email template."
          >
            <div className="space-y-5">
              {/* Subject */}
              <Field label="Subject Line" htmlFor="email-subject">
                <input
                  id="email-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. A message from Sapphire Clinics East"
                  className={CONTROL}
                  style={CONTROL_STYLE}
                />
              </Field>

              {/* AI generation */}
              <div className="rounded-xl p-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <p className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--teal)' }}>
                  <Sparkles size={13} />
                  Generate with AI
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. 'monthly wellness tips' or 'holiday greeting'"
                    className={`${CONTROL} sm:flex-1`}
                    style={CONTROL_STYLE}
                    onKeyDown={(e) => e.key === 'Enter' && generateEmail()}
                  />
                  <button
                    type="button"
                    onClick={generateEmail}
                    disabled={generating}
                    className={`${BTN_PRIMARY} h-10`}
                    style={{ background: 'var(--teal)' }}
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </div>

              {/* Email body */}
              <Field
                label="Email Body"
                htmlFor="email-body"
                aside={body ? <span style={{ color: 'var(--mid-gray)', fontVariantNumeric: 'tabular-nums' }}>{body.length.toLocaleString()} chars</span> : undefined}
                hint={
                  <span className="inline-flex items-center gap-1.5" style={{ color: pasteUploading ? '#1d4ed8' : undefined }}>
                    {pasteUploading
                      ? <><Loader2 size={12} className="animate-spin" /> Uploading pasted image…</>
                      : <><ImageIcon size={12} /> Tip: Paste images directly with Ctrl+V — they&apos;ll be uploaded and embedded as HTML in the email.</>}
                  </span>
                }
              >
                <textarea
                  id="email-body"
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onPaste={handleBodyPaste}
                  rows={10}
                  placeholder="Write your email content here, or generate with AI above… You can paste (Ctrl+V) images to embed them."
                  className={`${TEXTAREA} resize-y`}
                  style={{ ...CONTROL_STYLE, minHeight: 200 }}
                />
              </Field>

              {/* Copy HTML / Send test / Preview toggle */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={copyAsHtml}
                  disabled={!body}
                  className={BTN_SECONDARY}
                  style={htmlCopied
                    ? { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }
                    : { ...CONTROL_STYLE, color: 'var(--charcoal)' }}
                >
                  {htmlCopied ? <Check size={12} /> : <Code size={12} />}
                  {htmlCopied ? 'HTML Copied!' : 'Copy as HTML Email'}
                </button>
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={!body || testSending}
                  className={BTN_SECONDARY}
                  style={testSent
                    ? { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }
                    : { background: '#F5F3FF', border: '1px solid #DDD6FE', color: '#6D28D9' }}
                >
                  {testSending ? <Loader2 size={12} className="animate-spin" /> : testSent ? <Check size={12} /> : <FlaskConical size={12} />}
                  {testSending ? 'Sending…' : testSent ? 'Test sent to marketing@!' : 'Send Test Email'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(p => !p)}
                  disabled={!body}
                  aria-pressed={showPreview}
                  className={BTN_SECONDARY}
                  style={showPreview
                    ? { background: 'var(--pale-teal)', border: '1px solid var(--teal)', color: 'var(--teal)' }
                    : { ...CONTROL_STYLE, color: 'var(--charcoal)' }}
                >
                  <Monitor size={12} />
                  {showPreview ? 'Hide Preview' : 'Preview Email'}
                </button>
                {body && (
                  <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                    Copy the HTML, then paste into any email client&apos;s HTML source editor.
                  </span>
                )}
              </div>

              {/* Live email preview iframe */}
              {showPreview && body && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--light-gray)' }}>
                  <div
                    className="px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
                    style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)' }}
                  >
                    <Monitor size={13} style={{ color: 'var(--teal)' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>Email Preview</span>
                    <span className="text-xs" style={{ color: 'var(--mid-gray)' }}>— exactly how recipients will see it</span>
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
          </DashCard>
        </div>

        {/* ── Right: summary + delivery + send ── */}
        <aside className="min-w-0 xl:sticky xl:top-0">
          <DashCard title="Review & send" icon={<Send size={16} />}>
            <div className="space-y-5">
              {/* Summary of what's selected above — display only */}
              <div className="rounded-xl p-4" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Recipients</p>
                {recipientCount !== null ? (
                  <p className="text-3xl font-bold leading-tight mt-0.5" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                    {recipientCount.toLocaleString()}
                  </p>
                ) : (
                  <Skeleton className="h-8 w-20 mt-1" />
                )}
                <dl className="mt-3 space-y-1.5 text-xs">
                  {([
                    ['Group', groupLabel],
                    ['Branches', branchSummary],
                    ...(sender ? [['From', sender.email] as [string, string]] : []),
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

              {/* Send mode toggle */}
              <Field label="When to Send">
                <Segmented
                  label="When to send"
                  value={sendMode}
                  onChange={setSendMode}
                  options={[
                    { value: 'now', label: 'Send Now', icon: Send },
                    { value: 'schedule', label: 'Schedule', icon: Calendar },
                  ]}
                />
              </Field>

              {sendMode === 'schedule' && (
                <Field
                  label="Scheduled Date & Time"
                  htmlFor="email-scheduled-at"
                  hint={scheduledAt ? (
                    <span className="flex items-center gap-1" style={{ color: 'var(--teal)' }}>
                      <CheckCircle2 size={11} className="flex-shrink-0" />
                      Scheduled for {new Date(scheduledAt).toLocaleString('en-PH', { dateStyle: 'full', timeStyle: 'short' })}
                    </span>
                  ) : undefined}
                >
                  <input
                    id="email-scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={toDatetimeLocal(new Date(Date.now() + 60000))}
                    className={CONTROL}
                    style={CONTROL_STYLE}
                  />
                </Field>
              )}

              {/* Copy me — one copy of the campaign, not a per-recipient Cc header */}
              <Field
                label="Send me a copy"
                htmlFor="email-cc"
                aside={<span style={{ color: 'var(--mid-gray)' }}>Optional</span>}
                hint={<>Gets <strong>one</strong> copy of this campaign when it starts sending — not one per recipient. Patients never see this address. Separate multiple addresses with commas.</>}
              >
                <input
                  id="email-cc"
                  type="text"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="you@sapphireclinicseast.org"
                  className={CONTROL}
                  style={CONTROL_STYLE}
                />
              </Field>

              {/* Google Workspace notice */}
              <Notice tone="warn" icon={Info}>
                <strong>Note:</strong> Emails are sent via your Google Workspace account. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured in your environment.
              </Notice>

              <button
                onClick={sendEmail}
                disabled={sending || !subject || !body}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed"
                style={{
                  background: canSend ? 'var(--teal)' : 'var(--light-gray)',
                  color: canSend ? '#fff' : 'var(--mid-gray)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {sending
                  ? <Loader2 size={15} className="animate-spin" />
                  : sendMode === 'schedule' ? <Calendar size={15} /> : <Send size={15} />}
                {sending
                  ? (sendMode === 'schedule' ? 'Scheduling…' : 'Sending…')
                  : sendMode === 'schedule'
                    ? `Schedule for ${recipientCount ?? '…'} Recipients`
                    : `Send to ${recipientCount ?? '…'} Recipients`}
              </button>
              {!canSend && (
                <p className="text-[11px] text-center -mt-3" style={{ color: 'var(--mid-gray)' }}>
                  Add a subject and body to enable sending.
                </p>
              )}
            </div>
          </DashCard>
        </aside>
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
  const [loadError, setLoadError] = useState<string | null>(null)

  function copyPreviewHtml() {
    if (!preview) return
    navigator.clipboard.writeText(buildEmailHtml(preview.subject, preview.body))
    setHistoryCopied(true)
    setTimeout(() => setHistoryCopied(false), 2500)
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const p = new URLSearchParams({ status: statusFilter })
      const r = await fetch('/api/email/campaigns?' + p.toString())
      const d = await r.json()
      setRows(d.campaigns || [])
      // Surface a failed list load on the page instead of a silent empty table.
      if (!r.ok) setLoadError(d.error || `HTTP ${r.status}`)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error')
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
              sub={rows.length >= 50 ? 'Most recent 50 shown' : statusFilter === 'all' ? 'All statuses' : `Status: ${statusFilter}`} />
            <KpiCard label="Emails sent" icon={<Send size={16} />} accent="var(--bright-teal)"
              value={totalSent.toLocaleString()}
              sub={`of ${totalRecipients.toLocaleString()} recipients`} />
            <KpiCard label="Scheduled" icon={<Calendar size={16} />} accent="#3B82F6"
              value={scheduledCount.toLocaleString()}
              sub="Waiting to send" />
            <KpiCard label="In progress" icon={<RotateCw size={16} />} accent="#D97706"
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className={CONTROL_SM}
            style={CONTROL_STYLE}
          >
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="scheduled">Scheduled</option>
            <option value="sending">Sending</option>
            <option value="failed">Failed</option>
            <option value="draft">Draft</option>
          </select>
        }
      >
        {loading ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={loadError ? 'Nothing to show' : 'No campaigns yet.'}
            hint={statusFilter === 'all'
              ? 'Campaigns you send or schedule from New Campaign will appear here.'
              : 'No campaigns with this status — try “All statuses”.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr style={{ background: SUBTLE_BG, borderBottom: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                  <th className={TH}>Campaign</th>
                  <th className={`${TH} text-right`}>Recipients</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Sent / Scheduled</th>
                  <th className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-black/[0.015]" style={{ borderBottom: '1px solid #EEF2F1' }}>
                    <td className="px-4 py-3 align-top">
                      <button type="button" onClick={() => openPreview(r.id)}
                        className="block font-semibold text-sm truncate max-w-[340px] text-left hover:underline"
                        style={{ color: 'var(--charcoal)' }} title={r.subject}>
                        {r.subject || '(no subject)'}
                      </button>
                      <div className="text-[11px] mt-0.5 truncate max-w-[340px]" style={{ color: 'var(--mid-gray)' }}>{formatRecipientGroup(r.recipientGroup)}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <div className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>{r.recipientCount.toLocaleString()}</div>
                      <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{r.sentCount.toLocaleString()} sent</div>
                    </td>
                    <td className="px-4 py-3 align-top"><StatusBadge row={r} /></td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {r.sentAt ? (
                        <>
                          <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{fmtDateTime(r.sentAt)}</div>
                          <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Sent</div>
                        </>
                      ) : r.scheduledAt ? (
                        <>
                          <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{fmtDateTime(r.scheduledAt)}</div>
                          <div className="text-[11px]" style={{ color: '#1E40AF' }}>Scheduled</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs" style={{ color: 'var(--charcoal)' }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                          <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Created</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <RowAction title="Preview" onClick={() => openPreview(r.id)} hover="hover:bg-gray-100">
                          <Eye size={14} style={{ color: 'var(--mid-gray)' }} />
                        </RowAction>
                        {(r.status === 'partial') && (
                          <>
                            <RowAction title="Fire next tranche now" onClick={() => scheduleNow(r.id)} hover="hover:bg-amber-50">
                              <Zap size={14} style={{ color: '#92400E' }} />
                            </RowAction>
                            <RowAction title="Resume sending" onClick={() => resumeCampaign(r.id)} hover="hover:bg-emerald-50">
                              <RotateCw size={14} style={{ color: '#059669' }} />
                            </RowAction>
                          </>
                        )}
                        {(r.status === 'failed' && r.sentCount < r.recipientCount) && (
                          <RowAction title="Resume sending" onClick={() => resumeCampaign(r.id)} hover="hover:bg-emerald-50">
                            <RotateCw size={14} style={{ color: '#059669' }} />
                          </RowAction>
                        )}
                        <RowAction title="Delete record" onClick={() => deleteCampaign(r.id)} hover="hover:bg-red-50">
                          <Trash2 size={14} style={{ color: '#DC2626' }} />
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

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={MODAL_BACKDROP}
          onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--light-gray)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mid-gray)' }}>Subject</p>
                <p className="text-sm font-bold truncate" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }} title={preview.subject}>{preview.subject}</p>
              </div>
              <button
                type="button"
                onClick={copyPreviewHtml}
                className={`${BTN_SECONDARY} flex-shrink-0`}
                style={historyCopied
                  ? { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }
                  : { ...CONTROL_STYLE, color: 'var(--charcoal)' }}
              >
                {historyCopied ? <Check size={12} /> : <Code size={12} />}
                {historyCopied ? 'Copied!' : 'Copy HTML'}
              </button>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close preview"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 flex-shrink-0" style={{ color: 'var(--mid-gray)' }}>
                <X size={18} />
              </button>
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
