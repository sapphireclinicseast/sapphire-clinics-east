'use client'

// Admin console for editing Aurora's template responses. Password-gated; all
// reads/writes go through /api/admin/* which proxies to the marketing DB.

import { useEffect, useState } from 'react'

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
    return <div className="py-20 text-center text-[color:var(--mid-gray)]">Loading…</div>
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

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20'

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white rounded-3xl shadow-[0_24px_60px_rgba(46,94,90,0.12)] border border-[color:var(--light-gray)] p-7">
      <h1 className="text-xl font-semibold text-[color:var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        Admin Console
      </h1>
      <p className="text-sm text-[color:var(--mid-gray)] mb-5">Sign in to view sessions and manage Aurora.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus
          className={inputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={inputCls}
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          className="w-full py-2.5 rounded-xl text-white font-medium disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function Console({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'sessions' | 'aurora'>('sessions')
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Admin Console
          </h1>
          <p className="text-sm text-[color:var(--mid-gray)]">Consultant sessions and Aurora chatbot management.</p>
        </div>
        <button onClick={logout} className="text-sm px-3 py-2 rounded-lg border border-[color:var(--light-gray)] text-[color:var(--mid-gray)] hover:bg-[color:var(--off-white)]">
          Log out
        </button>
      </div>

      <div className="flex gap-1 mb-6 p-1 bg-[color:var(--off-white)] rounded-xl w-fit">
        {([['sessions', 'Sessions'], ['aurora', 'Aurora Assistant']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? 'bg-white text-[color:var(--deep-teal)] shadow-sm' : 'text-[color:var(--mid-gray)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsView onUnauthorized={onLogout} />}

      {tab === 'aurora' && (
        <>
          {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
          {loading ? (
            <div className="py-20 text-center text-[color:var(--mid-gray)]">Loading templates…</div>
          ) : (
            <div className="space-y-8">
          {/* Settings */}
          <section className="bg-white rounded-2xl border border-[color:var(--light-gray)] p-5">
            <h2 className="font-semibold text-[color:var(--charcoal)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              General messages
            </h2>
            <div className="space-y-4">
              {(Object.keys(SETTING_LABELS) as (keyof Settings)[]).map((k) => (
                <div key={k}>
                  <label className="block text-sm font-medium text-[color:var(--charcoal)]">{SETTING_LABELS[k].title}</label>
                  <p className="text-xs text-[color:var(--mid-gray)] mb-1.5">{SETTING_LABELS[k].hint}</p>
                  <textarea
                    value={settings[k]}
                    onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))}
                    rows={k === 'system_prompt' ? 8 : 3}
                    className="w-full px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm font-mono focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={saveSettings}
              className="mt-4 px-4 py-2 rounded-xl text-white text-sm font-medium"
              style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}
            >
              Save messages
            </button>
          </section>

          {/* FAQ entries */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[color:var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
                Standard questions ({faqs.length})
              </h2>
              <button
                onClick={addFaq}
                className="text-sm px-3 py-2 rounded-lg text-[color:var(--deep-teal)] bg-[color:var(--pale-teal)] hover:opacity-80 font-medium"
              >
                + Add question
              </button>
            </div>
            <div className="space-y-4">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm shadow-lg z-50"
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
    <div className={`bg-white rounded-2xl border p-5 ${faq.enabled ? 'border-[color:var(--light-gray)]' : 'border-dashed border-[color:var(--light-gray)] opacity-70'}`}>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-[color:var(--mid-gray)] mb-1">Quick-reply button label</label>
          <input
            value={faq.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="(leave blank to hide as a button)"
            className="w-full px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--mid-gray)] mb-1">Trigger keywords (comma-separated)</label>
          <input
            value={faq.keywords}
            onChange={(e) => onChange({ keywords: e.target.value })}
            placeholder="book, schedule, appointment"
            className="w-full px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20"
          />
        </div>
      </div>
      <label className="block text-xs font-medium text-[color:var(--mid-gray)] mb-1">Answer</label>
      <textarea
        value={faq.answer}
        onChange={(e) => onChange({ answer: e.target.value })}
        rows={5}
        className="w-full px-3 py-2 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20 whitespace-pre-wrap"
      />
      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-sm text-[color:var(--mid-gray)] cursor-pointer">
          <input type="checkbox" checked={faq.enabled} onChange={onToggle} className="accent-[color:var(--teal)]" />
          {faq.enabled ? 'Active' : 'Disabled'}
        </label>
        <div className="flex gap-2">
          <button onClick={onDelete} className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Delete</button>
          <button
            onClick={onSave}
            className="text-sm px-4 py-1.5 rounded-lg text-white font-medium"
            style={{ background: 'linear-gradient(135deg, var(--teal), var(--deep-teal))' }}
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
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-1 p-1 bg-[color:var(--off-white)] rounded-lg">
          {(
            [
              ['', 'All branches'],
              ['SANDBOX_EAST', 'East'],
              ['SANDBOX_GREENHILLS', 'Greenhills'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setBranch(v)}
              className={`px-3 py-1.5 rounded-md text-sm ${branch === v ? 'bg-white text-[color:var(--deep-teal)] shadow-sm font-medium' : 'text-[color:var(--mid-gray)]'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search consultant…"
          className="px-3 py-2 rounded-lg border border-[color:var(--light-gray)] text-sm flex-1 min-w-[180px] focus:outline-none focus:border-[color:var(--teal)]"
        />
        <span className="text-sm text-[color:var(--mid-gray)]">
          {filtered.length} consultants · {total} sessions
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[color:var(--mid-gray)]">Loading sessions…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-[color:var(--mid-gray)]">No consultants found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const open = openId === c.staffId
            return (
              <div key={c.staffId} className="bg-white rounded-2xl border border-[color:var(--light-gray)] overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : c.staffId)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[color:var(--off-white)]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[color:var(--charcoal)] truncate">{c.name}</div>
                    <div className="text-xs text-[color:var(--mid-gray)] truncate">
                      {[c.department, c.branch].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-[color:var(--mid-gray)]">{c.sessions.length} sessions</span>
                    <span className="text-[color:var(--mid-gray)] text-xs">{open ? '▲' : '▼'}</span>
                  </div>
                </button>
                {open && (
                  <div className="border-t border-[color:var(--light-gray)] overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-[color:var(--mid-gray)] bg-[color:var(--off-white)]">
                          <th className="px-5 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Time</th>
                          <th className="px-3 py-2 font-semibold">Patient</th>
                          <th className="px-3 py-2 font-semibold">Type</th>
                          <th className="px-5 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.sessions.map((s) => (
                          <tr key={s.id} className="border-t border-[color:var(--light-gray)]">
                            <td className="px-5 py-2 whitespace-nowrap">{s.date}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[color:var(--mid-gray)]">{s.startTime}–{s.endTime}</td>
                            <td className="px-3 py-2">{s.patientName}</td>
                            <td className="px-3 py-2 text-[color:var(--mid-gray)]">{s.isTeletherapy ? 'Teletherapy' : 'In-clinic'}</td>
                            <td className="px-5 py-2">{statusLabel(s.status)}</td>
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
