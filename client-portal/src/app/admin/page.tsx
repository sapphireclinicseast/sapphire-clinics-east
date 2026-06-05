'use client'

// Admin console for editing Sappy's template responses. Password-gated; all
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
  intro_message: { title: 'Greeting message', hint: 'First thing Sappy says when the chat opens.' },
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
        body: JSON.stringify({ password }),
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

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white rounded-3xl shadow-[0_24px_60px_rgba(46,94,90,0.12)] border border-[color:var(--light-gray)] p-7">
      <h1 className="text-xl font-semibold text-[color:var(--charcoal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
        Sappy Admin
      </h1>
      <p className="text-sm text-[color:var(--mid-gray)] mb-5">Sign in to edit the chatbot responses.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoFocus
          className="w-full px-3 py-2.5 rounded-xl border border-[color:var(--light-gray)] text-sm focus:outline-none focus:border-[color:var(--teal)] focus:ring-2 focus:ring-[color:var(--teal)]/20"
        />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button
          type="submit"
          disabled={busy || !password}
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
      const res = await fetch('/api/admin/sappy')
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
    const res = await fetch(`/api/admin/sappy/${f.id}`, {
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
    const res = await fetch(`/api/admin/sappy/${f.id}`, {
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
    const res = await fetch(`/api/admin/sappy/${f.id}`, { method: 'DELETE' })
    if (res.ok) {
      setFaqs((list) => list.filter((x) => x.id !== f.id))
      flash('Deleted')
    } else flash('Delete failed')
  }

  async function addFaq() {
    const res = await fetch('/api/admin/sappy', {
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
    const res = await fetch('/api/admin/sappy/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (res.ok) flash('Settings saved')
    else flash((await res.json().catch(() => ({}))).error || 'Save failed')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--charcoal)]" style={{ fontFamily: 'var(--font-display)' }}>
            Sappy Assistant — Responses
          </h1>
          <p className="text-sm text-[color:var(--mid-gray)]">Edit the answers Sappy gives patients in the chat widget.</p>
        </div>
        <button onClick={logout} className="text-sm px-3 py-2 rounded-lg border border-[color:var(--light-gray)] text-[color:var(--mid-gray)] hover:bg-[color:var(--off-white)]">
          Log out
        </button>
      </div>

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
