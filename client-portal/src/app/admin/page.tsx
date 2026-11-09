'use client'

// Admin console for editing Aurora's template responses. Password-gated; all
// reads/writes go through /api/admin/* which proxies to the marketing DB.

import { useEffect, useState } from 'react'
import HomecareView from '@/components/HomecareAdmin'
import {
  PAGE, PageHeader, DashCard, KpiCard, GroupLabel, PillTabs, StatusPill, Tag, Banner, EmptyState, ErrorCard,
  RowsSkeleton, Icon, type Tone,
  CONTROL, CONTROL_STYLE, TEXTAREA, LABEL, LABEL_STYLE,
  BTN_PRIMARY, BTN_SECONDARY, BTN_SM, BTN_DANGER_GHOST, PRIMARY_STYLE, SECONDARY_STYLE, DANGER,
  TH, TH_STYLE, TD, TR, TR_STYLE, CARD_STYLE, SUBTLE_BG,
} from '@/components/hub/ui'

interface Faq {
  id: string
  label: string
  keywords: string
  answer: string
  enabled: boolean
  sortOrder: number
}

interface Settings {
  intro_message: string
  system_prompt: string
  fallback_message: string
}

const SETTING_LABELS: Record<keyof Settings, { title: string; hint: string }> = {
  intro_message: { title: 'Greeting message', hint: 'First thing Aurora says when the chat opens.' },
  fallback_message: { title: 'No-answer fallback', hint: "Shown when nothing matches and the AI is unavailable." },
  system_prompt: { title: 'AI system prompt', hint: 'Instructions the AI follows for free-form questions. Advanced.' },
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/admin/login')
      .then((r) => r.json())
      .then((d) => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) {
    return <div role="status" className="py-20 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</div>
  }
  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />
  return <Console onLogout={() => setAuthed(false)} />
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) onSuccess()
      else {
        const d = await res.json().catch(() => ({}))
        setErr(d.error || 'Login failed.')
      }
    } catch {
      setErr('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const inputCls = `${CONTROL} w-full !h-11 !rounded-xl`

  return (
    <div
      className="max-w-sm mx-auto mt-8 sm:mt-16 rounded-[18px] px-5 py-8 sm:px-8"
      style={{ background: '#fff', border: '1px solid var(--light-gray)', boxShadow: '0 2px 12px rgba(25,72,80,0.06)' }}
    >
      <div className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--teal)' }}>
          Internal
        </div>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--deep-teal)' }}>
          Admin Console
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--mid-gray)' }}>Sign in to view sessions and manage Aurora.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="admin-username" className={LABEL} style={LABEL_STYLE}>Username</label>
          <input
            id="admin-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            className={inputCls}
            style={CONTROL_STYLE}
          />
        </div>
        <div>
          <label htmlFor="admin-password" className={LABEL} style={LABEL_STYLE}>Password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={inputCls}
            style={CONTROL_STYLE}
          />
        </div>
        {err && <Banner tone="error">{err}</Banner>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className={`${BTN_PRIMARY} w-full !h-11 !rounded-xl`}
          style={PRIMARY_STYLE}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function Console({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'sessions' | 'payments' | 'users' | 'tickets' | 'aurora' | 'homecare'>('sessions')
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [settings, setSettings] = useState<Settings>({ intro_message: '', system_prompt: '', fallback_message: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/aurora')
      if (res.status === 401) return onLogout()
      const d = await res.json()
      setFaqs(d.faqs ?? [])
      setSettings({
        intro_message: d.settings?.intro_message ?? '',
        system_prompt: d.settings?.system_prompt ?? '',
        fallback_message: d.settings?.fallback_message ?? '',
      })
    } catch {
      setError('Could not load templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => {})
    onLogout()
  }

  function patchLocal(id: string, patch: Partial<Faq>) {
    setFaqs((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function saveFaq(f: Faq) {
    const res = await fetch(`/api/admin/aurora/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: f.label, keywords: f.keywords, answer: f.answer, enabled: f.enabled }),
    })
    if (res.ok) flash('Saved')
    else flash((await res.json().catch(() => ({}))).error || 'Save failed')
  }

  async function toggleFaq(f: Faq) {
    const next = !f.enabled
    patchLocal(f.id, { enabled: next })
    const res = await fetch(`/api/admin/aurora/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    if (res.ok) flash(next ? 'Enabled' : 'Disabled')
    else {
      patchLocal(f.id, { enabled: f.enabled })
      flash('Update failed')
    }
  }

  async function deleteFaq(f: Faq) {
    if (!confirm(`Delete "${f.label || f.keywords}"? This can't be undone.`)) return
    const res = await fetch(`/api/admin/aurora/${f.id}`, { method: 'DELETE' })
    if (res.ok) {
      setFaqs((list) => list.filter((x) => x.id !== f.id))
      flash('Deleted')
    } else flash('Delete failed')
  }

  async function addFaq() {
    const res = await fetch('/api/admin/aurora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'New question', keywords: 'keyword', answer: 'Type the answer here.' }),
    })
    if (res.ok) {
      const d = await res.json()
      setFaqs((list) => [...list, d.faq])
      flash('Added')
    } else flash('Could not add')
  }

  async function saveSettings() {
    const res = await fetch('/api/admin/aurora/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (res.ok) flash('Settings saved')
    else flash((await res.json().catch(() => ({}))).error || 'Save failed')
  }

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Aura Health · Internal"
        title="Admin Console"
        description="Consultant sessions and Aurora chatbot management."
        actions={
          <button type="button" onClick={logout} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
            Log out
          </button>
        }
      />

      <PillTabs
        label="Admin sections"
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={([['sessions', 'Sessions'], ['payments', 'Payment History'], ['users', 'Users'], ['tickets', 'Tickets'], ['homecare', 'Homecare'], ['aurora', 'Aurora Assistant']] as const).map(([k, label]) => ({ id: k, label }))}
      />

      {tab === 'sessions' && <SessionsView onUnauthorized={onLogout} />}

      {tab === 'payments' && <PaymentsView onUnauthorized={onLogout} />}

      {tab === 'users' && <UsersView onUnauthorized={onLogout} />}

      {tab === 'tickets' && <TicketsView onUnauthorized={onLogout} />}

      {tab === 'homecare' && <HomecareView />}

      {tab === 'aurora' && (
        <>
          {error && <Banner tone="error">{error}</Banner>}
          {loading ? (
            <div className="rounded-xl overflow-hidden" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading templates" /></div>
          ) : (
            <div className="space-y-5">
          {/* Settings */}
          <DashCard
            title="General messages"
            description="What Aurora says when the chat opens, when nothing matches, and how the AI behaves."
            icon={<Icon name="edit" size={16} />}
          >
            <div className="space-y-4">
              {(Object.keys(SETTING_LABELS) as (keyof Settings)[]).map((k) => (
                <div key={k}>
                  <label htmlFor={`setting-${k}`} className={LABEL} style={LABEL_STYLE}>{SETTING_LABELS[k].title}</label>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--mid-gray)' }}>{SETTING_LABELS[k].hint}</p>
                  <textarea
                    id={`setting-${k}`}
                    value={settings[k]}
                    onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))}
                    rows={k === 'system_prompt' ? 8 : 3}
                    className={`${TEXTAREA} font-mono`}
                    style={CONTROL_STYLE}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={saveSettings}
              className={`${BTN_PRIMARY} mt-4`}
              style={PRIMARY_STYLE}
            >
              Save messages
            </button>
          </DashCard>

          {/* FAQ entries */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <GroupLabel hint={`${faqs.length}`}>Standard questions</GroupLabel>
              <button
                type="button"
                onClick={addFaq}
                className={BTN_SECONDARY}
                style={SECONDARY_STYLE}
              >
                <Icon name="plus" size={14} /> Add question
              </button>
            </div>
            <div className="space-y-3">
              {faqs.map((f) => (
                <FaqCard
                  key={f.id}
                  faq={f}
                  onChange={(p) => patchLocal(f.id, p)}
                  onSave={() => saveFaq(f)}
                  onToggle={() => toggleFaq(f)}
                  onDelete={() => deleteFaq(f)}
                />
              ))}
            </div>
          </section>
            </div>
          )}
        </>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-lg z-50"
          style={{ background: 'var(--deep-teal)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

function FaqCard({
  faq, onChange, onSave, onToggle, onDelete,
}: {
  faq: Faq
  onChange: (p: Partial<Faq>) => void
  onSave: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-xl p-4 sm:p-5 min-w-0"
      style={faq.enabled ? CARD_STYLE : { background: SUBTLE_BG, border: '1px dashed var(--light-gray)' }}>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="min-w-0">
          <label htmlFor={`faq-label-${faq.id}`} className={LABEL} style={LABEL_STYLE}>Quick-reply button label</label>
          <input
            id={`faq-label-${faq.id}`}
            value={faq.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="(leave blank to hide as a button)"
            className={`${CONTROL} w-full`}
            style={CONTROL_STYLE}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`faq-keywords-${faq.id}`} className={LABEL} style={LABEL_STYLE}>Trigger keywords (comma-separated)</label>
          <input
            id={`faq-keywords-${faq.id}`}
            value={faq.keywords}
            onChange={(e) => onChange({ keywords: e.target.value })}
            placeholder="book, schedule, appointment"
            className={`${CONTROL} w-full`}
            style={CONTROL_STYLE}
          />
        </div>
      </div>
      <label htmlFor={`faq-answer-${faq.id}`} className={LABEL} style={LABEL_STYLE}>Answer</label>
      <textarea
        id={`faq-answer-${faq.id}`}
        value={faq.answer}
        onChange={(e) => onChange({ answer: e.target.value })}
        rows={5}
        className={`${TEXTAREA} whitespace-pre-wrap`}
        style={CONTROL_STYLE}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--mid-gray)' }}>
          <input type="checkbox" checked={faq.enabled} onChange={onToggle} className="w-4 h-4 accent-[color:var(--teal)]" />
          <StatusPill tone={faq.enabled ? 'success' : 'neutral'}>{faq.enabled ? 'Active' : 'Disabled'}</StatusPill>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onDelete} className={`${BTN_DANGER_GHOST} !h-9 !text-sm`} style={{ color: DANGER }}>
            <Icon name="trash" size={14} /> Delete
          </button>
          <button
            type="button"
            onClick={onSave}
            className={BTN_PRIMARY}
            style={PRIMARY_STYLE}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sessions: all consultants' session history ───────────────────────────────

interface AdminSession {
  id: string
  date: string
  startTime: string
  endTime: string
  patientName: string
  status: string
  isTeletherapy: boolean
}
interface Consultant {
  staffId: string
  name: string
  department: string
  branch: string
  sessions: AdminSession[]
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// Session status → StatusPill tone. Display only; unknown values read neutral.
function sessionTone(s: string): Tone {
  const v = s.toUpperCase()
  if (/COMPLETE|DONE|ATTENDED/.test(v)) return 'success'
  if (/NO_?SHOW|ABSENT|LATE/.test(v)) return 'warn'
  if (/CANCEL/.test(v)) return 'neutral'
  if (/SCHEDULED|CONFIRMED|BOOKED|PENDING/.test(v)) return 'info'
  return 'neutral'
}

/** Count / summary text that sits beside a toolbar's filters. */
function ToolbarCount({ children }: { children: React.ReactNode }) {
  return <span className="text-sm tabular-nums" style={{ color: 'var(--mid-gray)' }}>{children}</span>
}

/** Search box: kit control with a leading magnifier. */
function SearchBox({ value, onChange, placeholder, minWidth }: { value: string; onChange: (v: string) => void; placeholder: string; minWidth: number }) {
  return (
    <div className="relative flex-1" style={{ minWidth: Math.min(minWidth, 240) }}>
      <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${CONTROL} w-full pl-8`}
        style={CONTROL_STYLE}
      />
    </div>
  )
}

// ── Payment History: PayMongo booking-downpayment payments ───────────────────

interface AdminPayment {
  id: string
  date: string
  patientName: string
  branch: string
  department: string
  gross: number
  fee: number | null
  net: number | null
  status: string
  remittance: string | null
  ref: string | null
}

function peso(n: number | null): string {
  return n == null
    ? '—'
    : `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function PaymentsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [branch, setBranch] = useState('')
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [totals, setTotals] = useState({ paidCount: 0, gross: 0, fee: 0, net: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    fetch(`/api/admin/data/payments${branch ? `?branch=${branch}` : ''}`)
      .then(async (r) => {
        if (r.status === 401) { onUnauthorized(); return null }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setPayments(d.payments ?? [])
        setTotals(d.totals ?? { paidCount: 0, gross: 0, fee: 0, net: 0 })
      })
      .catch(() => { if (!cancelled) setError('Could not load payments.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branch, onUnauthorized])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <PillTabs
          label="Branch"
          value={branch}
          onChange={(id) => setBranch(id)}
          tabs={([
            ['', 'All branches'],
            ['SBEA', 'East'],
            ['SBGH', 'Greenhills'],
          ] as const).map(([v, l]) => ({ id: v, label: l }))}
        />
        <ToolbarCount>
          {payments.length} payments · {totals.paidCount} paid
        </ToolbarCount>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Gross charged" value={peso(totals.gross)} icon={<Icon name="wallet" size={16} />} />
        <KpiCard label="PayMongo fees" value={peso(totals.fee)} accent="var(--clay)" icon={<Icon name="tag" size={16} />} />
        <KpiCard label="Net" value={peso(totals.net)} icon={<Icon name="check" size={16} />} />
      </div>

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading payments" /></div>
      ) : error ? (
        <ErrorCard title={error} />
      ) : payments.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}><EmptyState icon="wallet" title="No payments yet." /></div>
      ) : (
        <DashCard
          title="Booking downpayments"
          description="PayMongo payments for booking downpayments."
          icon={<Icon name="wallet" size={16} />}
          flush
          footer={<>
            &ldquo;For Clearing&rdquo; = the payment cleared on PayMongo but isn&rsquo;t yet reconciled to a bank payout. Live
            &ldquo;Remitted to Bank&rdquo; tracking (PayMongo Payouts API) is the next phase.
          </>}
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={`${TH} !pl-4 sm:!pl-5`} style={TH_STYLE}>Date</th>
                <th scope="col" className={TH} style={TH_STYLE}>Patient</th>
                <th scope="col" className={TH} style={TH_STYLE}>Branch</th>
                <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Amount</th>
                <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Fee</th>
                <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Net</th>
                <th scope="col" className={`${TH} !pr-4 sm:!pr-5`} style={TH_STYLE}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className={TR} style={TR_STYLE}>
                  <td className={`${TD} !pl-4 sm:!pl-5 whitespace-nowrap`}>
                    {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className={TD} style={{ color: 'var(--charcoal)' }}>
                    {p.patientName}
                    {p.department && <div className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>{p.department}</div>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`} style={{ color: 'var(--mid-gray)' }}>{p.branch || '—'}</td>
                  <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>{peso(p.gross)}</td>
                  <td className={`${TD} text-right whitespace-nowrap tabular-nums`} style={{ color: 'var(--clay)' }}>
                    {p.fee == null ? '—' : `−${peso(p.fee)}`}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap tabular-nums font-semibold`} style={{ color: 'var(--charcoal)' }}>{peso(p.net)}</td>
                  <td className={`${TD} !pr-4 sm:!pr-5 whitespace-nowrap`}>
                    {p.status === 'Paid' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <StatusPill tone="success">Paid</StatusPill>
                        {p.remittance && <Tag tone="warn">{p.remittance}</Tag>}
                      </span>
                    ) : (
                      <StatusPill tone="neutral">Pending</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </DashCard>
      )}
    </div>
  )
}

// ── Users: patients who have a portal account, grouped by branch ─────────────

interface AccountUser {
  id: string
  name: string
  email: string | null
  username: string | null
  createdAt: string
  lastSession: string | null
  sessionCount: number
}
interface UserBranchGroup {
  branch: string
  branchLabel: string
  users: AccountUser[]
}

// ── Tickets: patient-submitted portal concerns ──────────────────────────────

interface AdminTicket {
  id: string
  subject: string
  description: string
  screenshot: string | null
  status: string
  adminResponse: string | null
  resolvedAt: string | null
  createdAt: string
  patientName: string
  patientEmail: string | null
  branch: string
}

function TicketsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    fetch('/api/admin/data/tickets')
      .then(async (r) => { if (r.status === 401) { onUnauthorized(); return null } return r.json() })
      .then((d) => { if (!d) return; setTickets(d.tickets ?? []); setOpenCount(d.openCount ?? 0) })
      .catch(() => setError('Could not load tickets.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [onUnauthorized])

  async function act(id: string, body: object) {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/tickets/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      if (r.status === 401) return onUnauthorized()
      if (!r.ok) throw new Error()
      setReplyFor(null); setReplyText(''); load()
    } catch { setError('Update failed.') } finally { setBusy(false) }
  }

  const shown = tickets.filter((t) => (filter === 'open' ? t.status !== 'RESOLVED' : true))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <PillTabs
          label="Ticket filter"
          value={filter}
          onChange={(id) => setFilter(id as 'open' | 'all')}
          tabs={([['open', 'Open'], ['all', 'All']] as const).map(([v, l]) => ({ id: v, label: l }))}
        />
        <ToolbarCount>{openCount} open · {tickets.length} total</ToolbarCount>
      </div>

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}><RowsSkeleton rows={3} label="Loading tickets" /></div>
      ) : error ? (
        <ErrorCard title={error} />
      ) : shown.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}><EmptyState icon="check" title={`No ${filter === 'open' ? 'open ' : ''}tickets.`} /></div>
      ) : (
        <div className="space-y-3">
          {shown.map((t) => {
            const resolved = t.status === 'RESOLVED'
            return (
              <div key={t.id} className="rounded-xl p-4 sm:p-5 min-w-0" style={CARD_STYLE}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold leading-snug" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{t.subject}</div>
                    <div className="text-xs mt-0.5 break-words" style={{ color: 'var(--mid-gray)' }}>
                      {t.patientName}{t.patientEmail ? ` · ${t.patientEmail}` : ''} · {t.branch} · {new Date(t.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                  <StatusPill tone={resolved ? 'success' : 'warn'}>{resolved ? 'Resolved' : 'Open'}</StatusPill>
                </div>

                <p className="text-sm mt-2 whitespace-pre-wrap break-words" style={{ color: 'var(--charcoal)' }}>{t.description}</p>

                {t.screenshot && (
                  <a href={t.screenshot} target="_blank" rel="noreferrer" className="inline-block mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.screenshot} alt="Screenshot" className="max-h-40 rounded-lg" style={{ border: '1px solid var(--light-gray)' }} />
                  </a>
                )}

                {resolved && t.adminResponse && (
                  <div className="mt-2.5 rounded-lg px-3 py-2" style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)' }}>
                    <div className={`${LABEL} !mb-0`} style={{ ...LABEL_STYLE, color: 'var(--teal)' }}>Your response</div>
                    <div className="text-[13px] mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--charcoal)' }}>{t.adminResponse}</div>
                  </div>
                )}

                <div className="mt-3">
                  {resolved ? (
                    <button type="button" onClick={() => act(t.id, { reopen: true })} disabled={busy} className={BTN_SECONDARY} style={SECONDARY_STYLE}>
                      Reopen
                    </button>
                  ) : replyFor === t.id ? (
                    <div className="space-y-2">
                      <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2}
                        placeholder="Optional reply shown to the patient…"
                        aria-label="Reply to the patient"
                        className={TEXTAREA} style={CONTROL_STYLE} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => act(t.id, { response: replyText })} disabled={busy}
                          className={BTN_PRIMARY} style={PRIMARY_STYLE}>
                          {busy ? 'Saving…' : 'Mark resolved'}
                        </button>
                        <button type="button" onClick={() => { setReplyFor(null); setReplyText('') }} className={BTN_SECONDARY} style={SECONDARY_STYLE}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => { setReplyFor(t.id); setReplyText('') }}
                      className={BTN_SECONDARY} style={{ ...SECONDARY_STYLE, color: 'var(--deep-teal)' }}>
                      <Icon name="check" size={14} /> Resolve…
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UsersView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [groups, setGroups] = useState<UserBranchGroup[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    fetch('/api/admin/data/users')
      .then(async (r) => {
        if (r.status === 401) { onUnauthorized(); return null }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setGroups(d.branches ?? [])
        setTotal(d.totalUsers ?? 0)
      })
      .catch(() => { if (!cancelled) setError('Could not load users.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [onUnauthorized])

  const needle = q.trim().toLowerCase()
  const filteredGroups = groups
    .map((g) => ({
      ...g,
      users: needle
        ? g.users.filter((u) =>
            [u.name, u.email ?? '', u.username ?? ''].some((v) => v.toLowerCase().includes(needle)),
          )
        : g.users,
    }))
    .filter((g) => g.users.length > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, email, or username…" minWidth={200} />
        <ToolbarCount>{total} accounts</ToolbarCount>
      </div>

      <Banner tone="warn">
        Passwords are stored encrypted (one-way hashed) and cannot be displayed — not even here. To give a
        patient a known password, reset it from their record. Contact the developer to enable a reset button here.
      </Banner>

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}><RowsSkeleton rows={4} label="Loading users" /></div>
      ) : error ? (
        <ErrorCard title={error} />
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}><EmptyState icon="users" title="No accounts found." /></div>
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((g) => (
            <DashCard key={g.branch} title={g.branchLabel} icon={<Icon name="building" size={16} />} action={<Tag>{g.users.length} accounts</Tag>} flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={`${TH} !pl-4 sm:!pl-5`} style={TH_STYLE}>Patient</th>
                      <th scope="col" className={TH} style={TH_STYLE}>Username</th>
                      <th scope="col" className={TH} style={TH_STYLE}>Email</th>
                      <th scope="col" className={`${TH} !text-right`} style={TH_STYLE}>Sessions</th>
                      <th scope="col" className={TH} style={TH_STYLE}>Last session</th>
                      <th scope="col" className={TH} style={TH_STYLE}>Registered</th>
                      <th scope="col" className={`${TH} !text-right !pr-4 sm:!pr-5`} style={TH_STYLE}>Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.users.map((u) => (
                      <tr key={u.id} className={TR} style={TR_STYLE}>
                        <td className={`${TD} !pl-4 sm:!pl-5 font-semibold whitespace-nowrap`} style={{ color: 'var(--charcoal)' }}>{u.name}</td>
                        <td className={`${TD} whitespace-nowrap`}>{u.username || <span style={{ color: 'var(--mid-gray)' }}>—</span>}</td>
                        <td className={TD} style={{ color: 'var(--mid-gray)' }}>{u.email || '—'}</td>
                        <td className={`${TD} text-right whitespace-nowrap tabular-nums`}>{u.sessionCount}</td>
                        <td className={`${TD} whitespace-nowrap`} style={{ color: 'var(--mid-gray)' }}>{u.lastSession || '—'}</td>
                        <td className={`${TD} whitespace-nowrap`} style={{ color: 'var(--mid-gray)' }}>{u.createdAt}</td>
                        <td className={`${TD} !pr-4 sm:!pr-5 text-right whitespace-nowrap`}>
                          <a
                            href={`/impersonate/${u.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open this patient's portal exactly as they see it (new tab)"
                            className={BTN_SM}
                            style={{ background: 'var(--pale-teal)', color: 'var(--deep-teal)' }}
                          >
                            Open portal <Icon name="external" size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashCard>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionsView({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [branch, setBranch] = useState('')
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    fetch(`/api/admin/data/sessions${branch ? `?branch=${branch}` : ''}`)
      .then(async (r) => {
        if (r.status === 401) { onUnauthorized(); return null }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setConsultants(d.consultants ?? [])
        setTotal(d.totalSessions ?? 0)
      })
      .catch(() => { if (!cancelled) setError('Could not load sessions.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [branch, onUnauthorized])

  const filtered = consultants.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <PillTabs
          label="Branch"
          value={branch}
          onChange={(id) => setBranch(id)}
          tabs={([
            ['', 'All branches'],
            ['SANDBOX_EAST', 'East'],
            ['SANDBOX_GREENHILLS', 'Greenhills'],
          ] as const).map(([v, l]) => ({ id: v, label: l }))}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search consultant…" minWidth={180} />
        <ToolbarCount>
          {filtered.length} consultants · {total} sessions
        </ToolbarCount>
      </div>

      {loading ? (
        <div className="rounded-xl overflow-hidden" style={CARD_STYLE}><RowsSkeleton rows={5} label="Loading sessions" /></div>
      ) : error ? (
        <ErrorCard title={error} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl" style={CARD_STYLE}><EmptyState icon="users" title="No consultants found." /></div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => {
            const open = openId === c.staffId
            return (
              <div key={c.staffId} className="rounded-xl overflow-hidden min-w-0" style={CARD_STYLE}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : c.staffId)}
                  className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left transition-colors hover:bg-[#F8FAF2] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--teal)]"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{c.name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--mid-gray)' }}>
                      {[c.department, c.branch].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Tag>{c.sessions.length} sessions</Tag>
                    <Icon name="chevronRight" size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--mid-gray)' }} />
                  </div>
                </button>
                {open && (
                  <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--light-gray)' }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th scope="col" className={`${TH} !pl-4 sm:!pl-5`} style={TH_STYLE}>Date</th>
                          <th scope="col" className={TH} style={TH_STYLE}>Time</th>
                          <th scope="col" className={TH} style={TH_STYLE}>Patient</th>
                          <th scope="col" className={TH} style={TH_STYLE}>Type</th>
                          <th scope="col" className={`${TH} !pr-4 sm:!pr-5`} style={TH_STYLE}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.sessions.map((s) => (
                          <tr key={s.id} className={TR} style={TR_STYLE}>
                            <td className={`${TD} !pl-4 sm:!pl-5 whitespace-nowrap tabular-nums`}>{s.date}</td>
                            <td className={`${TD} whitespace-nowrap tabular-nums`} style={{ color: 'var(--mid-gray)' }}>{s.startTime}–{s.endTime}</td>
                            <td className={TD} style={{ color: 'var(--charcoal)' }}>{s.patientName}</td>
                            <td className={TD}>{s.isTeletherapy ? <Tag tone="brand">Teletherapy</Tag> : <span style={{ color: 'var(--mid-gray)' }}>In-clinic</span>}</td>
                            <td className={`${TD} !pr-4 sm:!pr-5 whitespace-nowrap`}><StatusPill tone={sessionTone(s.status)}>{statusLabel(s.status)}</StatusPill></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
