'use client'

// Front-desk inbox for public enquiries.
//
// The branch filter here is a CONVENIENCE for accounts that can see more than
// one branch. It is not the control: /api/inquiries pins a branch-scoped
// account to its own branch whatever this sends, and the API reports back which
// branch it pinned so the UI can stop pretending the filter exists.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Inbox, Loader2, Search, Check } from 'lucide-react'
import ChatThread, { ChatComposer } from '@/components/ChatThread'

interface Row {
  id: string; ref: string; branch: string; name: string; email: string | null; phone: string | null
  subject: string | null; status: string; readAt: string | null; lastMessageAt: string; createdAt: string
  _count: { messages: number }
}
interface Msg { id: string; fromStaff: boolean; authorName: string | null; body: string; createdAt: string }

const BRANCH_LABEL: Record<string, string> = { SBEA: 'East', SBGH: 'Greenhills' }
const STATUSES = ['ALL', 'OPEN', 'ANSWERED', 'CLOSED']

export default function InquiriesClient() {
  const [rows, setRows] = useState<Row[]>([])
  const [unread, setUnread] = useState(0)
  const [scoped, setScoped] = useState<string | null>(null)
  const [branch, setBranch] = useState('ALL')
  const [status, setStatus] = useState('OPEN')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<{ inquiry: Row; messages: Msg[] } | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  // Deep link from the notification bell: /inquiries?open=<id>. Runs once, and
  // only after the first list load, so opening it cannot be undone by the
  // fetch that follows. Without this the bell would drop you on a list and
  // leave you to find the row yourself, which defeats the notification.
  const searchParams = useSearchParams()
  const deepLinked = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ branch, status, q })
    const res = await fetch(`/api/inquiries?${p}`, { cache: 'no-store' })
    const d = await res.json()
    setRows(d.inquiries ?? []); setUnread(d.unread ?? 0); setScoped(d.scopedToBranch ?? null)
    setLoading(false)
  }, [branch, status, q])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (deepLinked.current) return
    const id = searchParams.get('open')
    if (!id) return
    deepLinked.current = true
    // An enquiry linked from the bell is unread, and the default filter is
    // already OPEN — but a reply on an ANSWERED thread is also unread, so widen
    // the filter rather than open a row the list is hiding.
    setStatus('ALL')
    open(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function open(id: string) {
    setOpenId(id); setThread(null)
    const res = await fetch(`/api/inquiries/${id}`, { cache: 'no-store' })
    if (res.ok) { setThread(await res.json()); load() }
  }

  async function send() {
    if (!openId || !reply.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/inquiries/${openId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (res.ok) { setReply(''); await open(openId) }
    } finally { setBusy(false) }
  }

  async function setStatusOf(id: string, next: string) {
    await fetch(`/api/inquiries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    await open(id)
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <Inbox size={20} style={{ color: 'var(--teal)' }} />
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          Enquiries
        </h1>
        {unread > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#DC2626', color: '#fff' }}>
            {unread} unread
          </span>
        )}
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--mid-gray)' }}>
        Questions sent from <strong>operations.sapphireclinicseast.org/inquiry</strong>.
        {scoped ? ` Showing ${BRANCH_LABEL[scoped] ?? scoped} only.` : ' Showing every branch.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {!scoped && (
          <select value={branch} onChange={e => setBranch(e.target.value)} className="px-3 py-2 rounded-lg text-sm"
            style={{ border: '1.5px solid var(--light-gray)' }}>
            <option value="ALL">All branches</option>
            <option value="SBEA">East</option>
            <option value="SBGH">Greenhills</option>
          </select>
        )}
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ border: `1.5px solid ${status === s ? 'var(--teal)' : 'var(--light-gray)'}`,
                     background: status === s ? 'var(--pale-teal)' : '#fff',
                     color: status === s ? 'var(--teal)' : 'var(--mid-gray)' }}>
            {s === 'ALL' ? 'All' : s === 'OPEN' ? 'Awaiting reply' : s === 'ANSWERED' ? 'Replied' : 'Closed'}
          </button>
        ))}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ border: '1.5px solid var(--light-gray)' }}>
          <Search size={14} style={{ color: 'var(--mid-gray)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Reference, name, email…"
            className="text-sm outline-none" style={{ border: 0, minWidth: 190 }} />
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: openId ? '1fr 1fr' : '1fr' }}>
        <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Nothing here.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} onClick={() => open(r.id)} style={{
                    cursor: 'pointer', borderBottom: '1px solid var(--light-gray)',
                    background: openId === r.id ? 'var(--pale-teal)' : !r.readAt ? '#FFFDF5' : '#fff',
                  }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!r.readAt && <span style={{ width: 7, height: 7, borderRadius: 99, background: '#DC2626', display: 'inline-block' }} />}
                        <span className="font-mono text-xs" style={{ color: 'var(--teal)' }}>{r.ref}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                          {BRANCH_LABEL[r.branch] ?? r.branch}
                        </span>
                      </div>
                      <p className="font-semibold mt-1" style={{ color: 'var(--charcoal)' }}>{r.name}</p>
                      <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                        {r.subject || '(no subject)'} · {r._count.messages} message{r._count.messages === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--mid-gray)', whiteSpace: 'nowrap' }}>
                      {new Date(r.lastMessageAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                      <span className="block mt-1 font-semibold" style={{
                        color: r.status === 'OPEN' ? '#A16207' : r.status === 'ANSWERED' ? '#047857' : '#6B7280' }}>
                        {r.status === 'OPEN' ? 'Awaiting' : r.status === 'ANSWERED' ? 'Replied' : 'Closed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {openId && (
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid var(--light-gray)' }}>
            {!thread ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--teal)' }} /></div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-xs" style={{ color: 'var(--teal)' }}>{thread.inquiry.ref}</p>
                    <p className="font-bold" style={{ color: 'var(--charcoal)' }}>{thread.inquiry.name}</p>
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {[thread.inquiry.email, thread.inquiry.phone].filter(Boolean).join(' · ') || 'No contact details'}
                    </p>
                  </div>
                  <button onClick={() => setStatusOf(thread.inquiry.id, thread.inquiry.status === 'CLOSED' ? 'OPEN' : 'CLOSED')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    style={{ border: '1.5px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
                    <Check size={13} /> {thread.inquiry.status === 'CLOSED' ? 'Reopen' : 'Close'}
                  </button>
                </div>

                <ChatThread
                  /* Front desk is reading, so the CLINIC's replies sit on the
                     right — the mirror of what the enquirer sees. */
                  mineIsStaff
                  maxHeight={360}
                  messages={thread.messages.map(m => ({
                    id: m.id,
                    fromStaff: m.fromStaff,
                    author: m.fromStaff ? (m.authorName || 'Front Desk') : thread.inquiry.name,
                    body: m.body,
                    createdAt: m.createdAt,
                  }))}
                />

                <div className="mt-3">
                  {thread.inquiry.status === 'CLOSED' ? (
                    <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                      Closed — reopen to reply. The enquirer cannot add to a closed thread.
                    </p>
                  ) : (
                    <ChatComposer
                      value={reply}
                      onChange={setReply}
                      onSend={send}
                      busy={busy}
                      placeholder="Write a reply — the enquirer sees this on their link."
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
