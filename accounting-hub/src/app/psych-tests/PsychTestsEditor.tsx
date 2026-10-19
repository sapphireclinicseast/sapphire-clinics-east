'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The psych heads' external editor for the Psych Tests register.
 *
 * No hub login. Reached two ways: the bare /psych-tests page (access-code
 * gate, which fetches the edit token server-side) or a direct
 * /psych-tests/<token> link. One table holds every test — East, Greenhills,
 * or Shared (both branches) — with +/− steppers so quantities move as kits
 * are used or restocked. Every change is stamped with the editor's name.
 * Styled inline like the other public pages (/pay, /m).
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
  { value: 'SANDBOX_EAST', label: 'East' },
  { value: 'SANDBOX_GREENHILLS', label: 'Greenhills' },
  { value: 'ALL', label: 'Shared (both branches)' },
]
const BRANCH_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  SANDBOX_EAST: { label: 'East', bg: '#e6f2ef', color: '#0f766e' },
  SANDBOX_GREENHILLS: { label: 'Greenhills', bg: '#eef2fb', color: '#3b5bb5' },
  ALL: { label: 'Shared', bg: '#fdf3e3', color: '#b45309' },
}

const TEAL = '#0f766e'
const CHARCOAL = '#1f2d2a'
const GRAY = '#6b7f7a'
const LIGHT = '#e2ece8'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${LIGHT}`,
  fontSize: 14, color: CHARCOAL, outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: GRAY, marginBottom: 4 }
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: GRAY,
  textTransform: 'uppercase', letterSpacing: '0.06em', background: '#f1f6f3', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13.5, color: CHARCOAL, borderTop: `1px solid ${LIGHT}`, verticalAlign: 'middle' }

const emptyForm = { id: '', branch: 'SANDBOX_EAST', name: '', format: 'HARD_COPY', quantity: '', supplier: '', acquiredDate: '', remarks: '' }

export default function PsychTestsEditor({ token }: { token: string }) {
  const [tests, setTests] = useState<Test[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [editor, setEditor] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
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

  const needName = () => {
    if (editor.trim()) return false
    setError('Please enter your name at the top first.')
    return true
  }

  const flashSaved = () => { setSavedTick(true); setTimeout(() => setSavedTick(false), 1600) }

  const openAdd = () => { setForm({ ...emptyForm, branch: branchFilter || 'SANDBOX_EAST' }); setShowForm(true); setError('') }
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
    if (needName()) return
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
      flashSaved()
      load()
    } catch {
      setError('Could not save — please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // Stock in/out: optimistic bump, server answers with the authoritative count.
  const adjust = async (t: Test, delta: number) => {
    if (needName()) return
    setTests(cur => (cur || []).map(x => x.id === t.id ? { ...x, quantity: Math.max(0, (x.quantity ?? 0) + delta) } : x))
    try {
      const r = await fetch(`/api/public/psych-tests/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adjust', id: t.id, delta, editorName: editor.trim() }),
      })
      const d = await r.json()
      if (r.ok) {
        setTests(cur => (cur || []).map(x => x.id === t.id ? { ...x, quantity: d.quantity, updatedByName: editor.trim() } : x))
      } else {
        setError(d.error || 'Could not update the count.')
        load()
      }
    } catch {
      setError('Could not update the count — please try again.')
      load()
    }
  }

  const remove = async (t: Test) => {
    if (needName()) return
    if (!window.confirm(`Remove "${t.name}" (${BRANCH_CHIP[t.branch]?.label || t.branch})?`)) return
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

  const shown = (tests || []).filter(t => !branchFilter || t.branch === branchFilter)
  const stepBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 8, border: `1px solid ${LIGHT}`, background: '#fff',
    color: CHARCOAL, fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f8f7f4', padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEAL, fontWeight: 700, margin: 0 }}>
            Aura Health Rehab · Inventory
          </p>
          <h1 style={{ fontSize: 24, color: CHARCOAL, margin: '4px 0 2px' }}>Psych Tests Register</h1>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Every psychological test in one table — East, Greenhills, or shared by both. Use the +/− buttons as kits are
            used or restocked. Changes save straight to the Accounting Hub.
          </p>
        </header>

        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 14, boxShadow: '0 6px 18px rgba(16,52,45,0.06)' }}>
          <label style={labelStyle}>Your name (stamped on every change)</label>
          <input value={editor} onChange={e => rememberEditor(e.target.value)} placeholder="e.g. Albert Go / Frednick Asistion"
            style={{ ...inputStyle, maxWidth: 340 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ value: '', label: 'All' }, ...BRANCHES.map(b => ({ value: b.value, label: BRANCH_CHIP[b.value].label }))].map(c => (
              <button key={c.value} onClick={() => setBranchFilter(c.value)}
                style={{
                  padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${branchFilter === c.value ? TEAL : LIGHT}`,
                  background: branchFilter === c.value ? TEAL : '#fff',
                  color: branchFilter === c.value ? '#fff' : GRAY,
                }}>
                {c.label}
              </button>
            ))}
          </div>
          <button onClick={openAdd} disabled={busy}
            style={{ background: TEAL, color: '#fff', border: 0, borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Add test
          </button>
        </div>

        {savedTick && (
          <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            Saved — the Accounting Hub list is updated.
          </div>
        )}
        {error && !showForm && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '9px 14px', fontSize: 13, marginBottom: 10 }}>{error}</div>
        )}

        {tests === null && <p style={{ color: GRAY, fontSize: 14 }}>Loading…</p>}

        {tests !== null && (
          <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 6px 18px rgba(16,52,45,0.06)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Test</th>
                  <th style={thStyle}>Branch</th>
                  <th style={thStyle}>Format</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Remarks</th>
                  <th style={thStyle}>Last updated</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', padding: '26px 12px', color: GRAY }}>
                    {tests.length === 0 ? 'No tests recorded yet — add the first one.' : 'No tests under this filter.'}
                  </td></tr>
                )}
                {shown.map(t => {
                  const chip = BRANCH_CHIP[t.branch] || BRANCH_CHIP.ALL
                  return (
                    <tr key={t.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{t.name}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: chip.bg, color: chip.color }}>{chip.label}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                          background: t.format === 'ONLINE' ? '#f1ecf7' : '#e6f2ef',
                          color: t.format === 'ONLINE' ? '#6d5192' : TEAL,
                        }}>
                          {t.format === 'ONLINE' ? 'Online' : 'Hard copy'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button style={stepBtn} onClick={() => adjust(t, -1)} title="Used one / stock out" aria-label={`Deduct one ${t.name}`}>−</button>
                        <span style={{ display: 'inline-block', minWidth: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{t.quantity ?? '—'}</span>
                        <button style={stepBtn} onClick={() => adjust(t, 1)} title="Restocked / stock in" aria-label={`Add one ${t.name}`}>+</button>
                      </td>
                      <td style={{ ...tdStyle, color: t.supplier ? CHARCOAL : GRAY }}>{t.supplier || '—'}</td>
                      <td style={{ ...tdStyle, color: t.remarks ? CHARCOAL : GRAY, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.remarks || undefined}>{t.remarks || '—'}</td>
                      <td style={{ ...tdStyle, fontSize: 11.5, color: GRAY, whiteSpace: 'nowrap' }}>
                        {new Date(t.updatedAt).toLocaleDateString()}{t.updatedByName ? ` · ${t.updatedByName}` : ''}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => openEdit(t)} disabled={busy}
                          style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 6 }}>
                          Edit
                        </button>
                        <button onClick={() => remove(t)} disabled={busy}
                          style={{ background: '#fff', color: '#b91c1c', border: '1px solid #f3c6c6', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,32,28,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
            <form onSubmit={save} style={{ background: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, color: CHARCOAL }}>{form.id ? 'Edit test' : 'Add test'}</h3>
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
