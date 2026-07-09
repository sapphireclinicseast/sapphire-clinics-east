'use client'

import { useCallback, useEffect, useState } from 'react'
import s from '../ugat.module.css'

const API = '/api/public/ugat'
const ADMIN_TOKEN_KEY = 'ugat_admin_token'

type Kind = 'SCHOOL' | 'PROGRAM' | 'FIELD'
interface Opt { id: string; label: string; sortOrder: number; disabled: boolean }
type Groups = Record<Kind, Opt[]>

const KIND_TITLES: Record<Kind, string> = {
  SCHOOL: 'Schools',
  PROGRAM: 'Programs',
  FIELD: 'Preferred Field of Practice',
}

export default function AdminClient() {
  const [token, setToken] = useState<string | null>(null)
  const [groups, setGroups] = useState<Groups | null>(null)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    setToken(localStorage.getItem(ADMIN_TOKEN_KEY))
    setBooted(true)
  }, [])

  const load = useCallback(async (t: string) => {
    const r = await fetch(`${API}/admin/options`, { headers: { Authorization: `Bearer ${t}` } })
    if (r.status === 401) { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(null); return }
    if (r.ok) setGroups(await r.json())
  }, [])

  useEffect(() => { if (token) load(token) }, [token, load])

  if (!booted) return <div className={s.root} />

  if (!token) {
    return (
      <div className={s.root}>
        <div className={s.adminLogin}>
          <AdminLogin onLogin={(t) => { localStorage.setItem(ADMIN_TOKEN_KEY, t); setToken(t) }} />
        </div>
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.adminWrap}>
        <div className={s.adminTop}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ugat/ugat-mark.svg" alt="" />
          <div style={{ flex: 1 }}>
            <h1 className={s.adminTitle}>UGAT Fellowship — Settings</h1>
          </div>
          <button className={s.ghostBtn} onClick={() => { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(null) }}>
            Sign out
          </button>
        </div>
        <p className={s.adminSub}>
          Edit the dropdown choices shown on the scholar sign-up form. Changes take effect immediately.
          Disabled options are hidden from new applicants but preserved in existing records.
        </p>

        {groups ? (
          <div className={s.adminGrid}>
            {(Object.keys(KIND_TITLES) as Kind[]).map((kind) => (
              <OptionColumn
                key={kind}
                kind={kind}
                title={KIND_TITLES[kind]}
                items={groups[kind] || []}
                token={token}
                reload={() => load(token)}
              />
            ))}
          </div>
        ) : (
          <p className={s.adminSub}>Loading…</p>
        )}
      </div>
    </div>
  )
}

function AdminLogin({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`${API}/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const d = await r.json()
      if (!r.ok || d.role !== 'ADMIN') { setErr('Invalid admin credentials.'); return }
      onLogin(d.token)
    } catch {
      setErr('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={s.card}>
      <h2 className={s.h1}>Admin sign in</h2>
      <p className={s.sub}>UGAT Fellowship settings — authorized staff only.</p>
      {err && <div className={`${s.alert} ${s.alertErr}`}>{err}</div>}
      <div className={s.field}>
        <label className={s.label}>Email</label>
        <input className={s.input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className={s.field}>
        <label className={s.label}>Password</label>
        <input className={s.input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className={s.btn} type="submit" disabled={busy}>{busy && <span className={s.spinner} />}Sign In</button>
    </form>
  )
}

function OptionColumn({
  kind, title, items, token, reload,
}: {
  kind: Kind; title: string; items: Opt[]; token: string; reload: () => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function add() {
    const label = newLabel.trim()
    if (!label) return
    setBusy(true)
    await fetch(`${API}/admin/options`, { method: 'POST', headers: auth, body: JSON.stringify({ kind, label }) })
    setNewLabel(''); setBusy(false); reload()
  }
  async function rename(id: string, label: string, original: string) {
    if (label.trim() === original || !label.trim()) return
    await fetch(`${API}/admin/options`, { method: 'PATCH', headers: auth, body: JSON.stringify({ id, label: label.trim() }) })
    reload()
  }
  async function toggle(id: string, disabled: boolean) {
    await fetch(`${API}/admin/options`, { method: 'PATCH', headers: auth, body: JSON.stringify({ id, disabled: !disabled }) })
    reload()
  }
  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete “${label}”? This cannot be undone. (Existing scholar records keep their saved value.)`)) return
    await fetch(`${API}/admin/options`, { method: 'DELETE', headers: auth, body: JSON.stringify({ id }) })
    reload()
  }

  return (
    <div className={s.adminCol}>
      <h3 className={s.adminColH}>{title}</h3>
      {items.length === 0 && <p className={s.adminSub} style={{ margin: 0 }}>No options yet.</p>}
      {items.map((o) => (
        <div key={o.id} className={s.adminRow}>
          <input
            className={`${s.adminRowLabel} ${o.disabled ? s.adminRowDisabled : ''}`}
            defaultValue={o.label}
            onBlur={(e) => rename(o.id, e.target.value, o.label)}
          />
          <button
            className={s.iconBtn}
            title={o.disabled ? 'Enable' : 'Disable'}
            onClick={() => toggle(o.id, o.disabled)}
          >
            {o.disabled ? '﹢' : '⦸'}
          </button>
          <button className={`${s.iconBtn} ${s.iconBtnDanger}`} title="Delete" onClick={() => remove(o.id, o.label)}>✕</button>
        </div>
      ))}
      <div className={s.adminAdd}>
        <input
          value={newLabel}
          placeholder={`Add ${title.toLowerCase().replace(/s$/, '')}…`}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button onClick={add} disabled={busy}>Add</button>
      </div>
    </div>
  )
}
