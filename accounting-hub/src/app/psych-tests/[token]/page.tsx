'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

/**
 * The psych heads' external editor for the Psych Tests register.
 *
 * No hub login: the token in the URL is the credential, issued from
 * Inventory → Psych Tests. Both branches are shown and editable; every save
 * is stamped with the editor's name so the hub shows who last touched a row.
 * Styled inline like the other public pages (/pay, /m) — no dashboard shell.
 */

interface Test {
  id: string
  branch: string
  name: string
  format: string
  quantity: number | null
  supplier: string | null
  acquiredDate: string | null
  remarks: string | null
  updatedByName: string | null
  updatedAt: string
}

const BRANCHES = [
  { value: 'SANDBOX_EAST', label: 'East Branch' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills Branch' },
]
const BRANCH_LABELS: Record<string, string> = Object.fromEntries(BRANCHES.map(b => [b.value, b.label]))

const TEAL = '#0f766e'
const CHARCOAL = '#1f2d2a'
const GRAY = '#6b7f7a'
const LIGHT = '#e2ece8'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${LIGHT}`,
  fontSize: 14, color: CHARCOAL, outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: GRAY, marginBottom: 4 }

const emptyForm = { id: '', branch: 'SANDBOX_EAST', name: '', format: 'HARD_COPY', quantity: '', supplier: '', acquiredDate: '', remarks: '' }

export default function PsychTestsPublicPage() {
  const { token } = useParams<{ token: string }>()
  const [tests, setTests] = useState<Test[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [editor, setEditor] = useState('')
  const [form, setForm] = useState({ ...emptyForm })
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    try { const n = localStorage.getItem('psych-tests-editor'); if (n) setEditor(n) } catch { /* optional */ }
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/public/psych-tests/${token}`, { cache: 'no-store' })
      if (r.status === 404) { setNotFound(true); return }
      const d = await r.json()
      if (r.ok) setTests(d.tests || [])
    } catch { /* keep whatever is shown */ }
  }, [token])

  useEffect(() => { load() }, [load])

  const rememberEditor = (v: string) => {
    setEditor(v)
    try { localStorage.setItem('psych-tests-editor', v) } catch { /* optional */ }
  }

  const openAdd = (branch: string) => { setForm({ ...emptyForm, branch }); setShowForm(true); setError('') }
  const openEdit = (t: Test) => {
    setForm({
      id: t.id, branch: t.branch, name: t.name, format: t.format,
      quantity: t.quantity == null ? '' : String(t.quantity),
      supplier: t.supplier || '', acquiredDate: t.acquiredDate ? t.acquiredDate.slice(0, 10) : '',
      remarks: t.remarks || '',
    })
    setShowForm(true)
    setError('')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editor.trim()) { setError('Please enter your name at the top first.'); return }
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/public/psych-tests/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, editorName: editor.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Could not save.'); return }
      setShowForm(false)
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 2000)
      load()
    } catch {
      setError('Could not save — please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (t: Test) => {
    if (!editor.trim()) { setError('Please enter your name at the top first.'); return }
    if (!window.confirm(`Remove "${t.name}" (${BRANCH_LABELS[t.branch]})?`)) return
    setBusy(true)
    try {
      await fetch(`/api/public/psych-tests/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: t.id, editorName: editor.trim() }),
      })
      load()
    } finally {
      setBusy(false)
    }
  }

  if (notFound) {
    return (
      <main style={{ minHeight: '100vh', background: '#f8f7f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 420, textAlign: 'center', boxShadow: '0 10px 30px rgba(16,52,45,0.08)' }}>
          <h1 style={{ fontSize: 18, color: CHARCOAL, margin: 0 }}>This link is not available</h1>
          <p style={{ fontSize: 14, color: GRAY, marginTop: 8 }}>
            The edit link may have been replaced. Please ask the accounting office for the current one.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8f7f4', padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, margin: 0 }}>
            Aura Health Rehab · Inventory
          </p>
          <h1 style={{ fontSize: 24, color: CHARCOAL, margin: '4px 0 2px' }}>Psych Tests Register</h1>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Keep the list of psychological tests up to date for both branches, and mark each one hard copy or online.
            Changes save straight to the Accounting Hub.
          </p>
        </header>

        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 18, boxShadow: '0 6px 18px rgba(16,52,45,0.06)' }}>
          <label style={labelStyle}>Your name (stamped on every change)</label>
          <input value={editor} onChange={e => rememberEditor(e.target.value)} placeholder="e.g. Albert Go / Frednick Asistion"
            style={{ ...inputStyle, maxWidth: 340 }} />
        </div>

        {savedTick && (
          <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            Saved — the Accounting Hub list is updated.
          </div>
        )}
        {error && !showForm && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}

        {tests === null && <p style={{ color: GRAY, fontSize: 14 }}>Loading…</p>}

        {tests !== null && BRANCHES.map(b => {
          const rows = tests.filter(t => t.branch === b.value)
          return (
            <section key={b.value} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, color: CHARCOAL, margin: 0 }}>{b.label}</h2>
                <button onClick={() => openAdd(b.value)} disabled={busy}
                  style={{ background: TEAL, color: '#fff', border: 0, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  + Add test
                </button>
              </div>
              <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 6px 18px rgba(16,52,45,0.06)' }}>
                {rows.length === 0 && (
                  <p style={{ padding: '18px 16px', fontSize: 13, color: GRAY, margin: 0 }}>No tests recorded for this branch yet.</p>
                )}
                {rows.map((t, i) => (
                  <div key={t.id} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${LIGHT}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: CHARCOAL }}>{t.name}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: GRAY }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11,
                          background: t.format === 'ONLINE' ? '#f1ecf7' : '#e6f2ef',
                          color: t.format === 'ONLINE' ? '#6d5192' : TEAL,
                          marginRight: 8,
                        }}>
                          {t.format === 'ONLINE' ? 'Online' : 'Hard copy'}
                        </span>
                        {t.quantity != null && <>Qty {t.quantity} · </>}
                        {t.supplier && <>{t.supplier} · </>}
                        {t.remarks && <>{t.remarks} · </>}
                        {t.updatedByName && <>last by {t.updatedByName}</>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => openEdit(t)} disabled={busy}
                        style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => remove(t)} disabled={busy}
                        style={{ background: '#fff', color: '#b91c1c', border: '1px solid #f3c6c6', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,32,28,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
            <form onSubmit={save} style={{ background: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, color: CHARCOAL }}>{form.id ? 'Edit test' : `Add test — ${BRANCH_LABELS[form.branch]}`}</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Test name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                    placeholder="e.g. WISC-V Complete Kit" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Branch *</label>
                    <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} style={inputStyle}>
                      {BRANCHES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Purchased as *</label>
                    <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))} style={inputStyle}>
                      <option value="HARD_COPY">Hard copy</option>
                      <option value="ONLINE">Online</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Quantity</label>
                    <input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                      placeholder="optional" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Date acquired</label>
                    <input type="date" value={form.acquiredDate} onChange={e => setForm(f => ({ ...f, acquiredDate: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Supplier / platform</label>
                  <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                    placeholder="e.g. Pearson, WPS, online portal" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Remarks</label>
                  <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} style={inputStyle} />
                </div>
                {error && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowForm(false)}
                    style={{ background: '#fff', color: GRAY, border: `1px solid ${LIGHT}`, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={busy}
                    style={{ background: TEAL, color: '#fff', border: 0, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
