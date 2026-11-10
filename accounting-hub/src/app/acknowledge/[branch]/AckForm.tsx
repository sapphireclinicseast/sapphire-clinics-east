'use client'

// Med rep signing form (phone / tablet): the paper "For brochures, referral
// pads, giveaways and documents received during coverage" acknowledgment,
// signed on screen by the doctor or secretary. Submitting logs the referral
// pads as Partner Distribution rows (drawing down this branch's on-hand) and
// stores the signed PDF. HR Hub look (Hannah, 2026-11-09); numbers in Roboto
// via the global 'Hub Digits' face; pick lists use NameCombobox, never <datalist>.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, Download, FileText, GraduationCap, Loader2, LogIn, Plus, RotateCcw, Stethoscope, X,
} from 'lucide-react'
import { NameCombobox } from '@/components/NameCombobox'
import { SignaturePad } from '@/components/SignaturePad'
import { HR_VARS } from '@/components/ui/hr-tokens'
import { coveredByUnion, controlToInt, rangeQuantity } from '@/lib/form-ranges'
import { ACK_FIELD_BRANCHES, ACK_ITEMS, ACK_ITEM_LABELS, DEFAULT_DELIVERED_BY_TITLE, resolveAckBranch, type AckBranch } from '@/lib/form-ack'

interface Partner { id: string; name: string; kind?: string; detail?: string; affiliation?: string }
interface GivenRange { a: number; b: number; partnerName: string; dateGiven: string }
interface Stock { formType: string; received: number; given: number; onHand: number; width: number; receivedRanges: Array<[number, number]>; givenRanges: GivenRange[] }
interface PadRow { formType: string; from: string; to: string }
interface Draft {
  branch?: string // slug picked on the general link
  kind: 'DOCTOR' | 'SCHOOL'
  institution: string; recipientName: string; recipientDesignation: string
  receivedBy: string; receivedByDesignation: string
  items: string[]; pads: PadRow[]; remarks: string
}
interface Done { id: string; padRows: number; pcs: number; receiptsAdded: number; pdfOk: boolean; pdfUrl: string; partnerName: string; items: string[]; branchName: string }

const EMPTY: Draft = {
  kind: 'DOCTOR', institution: '', recipientName: '', recipientDesignation: '', receivedBy: '', receivedByDesignation: '',
  items: [], pads: [{ formType: '', from: '', to: '' }], remarks: '',
}
const MAX_PADS = 6
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const pcs = (n: number) => n.toLocaleString('en-PH')
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

// First received control number that has not been given out yet.
function nextFree(st: Stock | undefined): number | null {
  if (!st) return null
  const rec = [...st.receivedRanges].sort((x, y) => x[0] - y[0])
  const giv = [...st.givenRanges].sort((x, y) => x.a - y.a)
  for (const [lo, hi] of rec) {
    let cur = lo
    let moved = true
    while (cur <= hi && moved) {
      moved = false
      for (const g of giv) if (g.a <= cur && g.b >= cur) { cur = g.b + 1; moved = true }
    }
    if (cur <= hi) return cur
  }
  return null
}

const inputCls = 'w-full h-12 px-3 rounded-lg border bg-white text-[16px] outline-none focus:border-[var(--teal)]'
const inputStyle = { borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>{children}</label>
}
function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 sm:p-5" style={{ borderColor: 'var(--light-gray)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--teal)' }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

// initialBranch: set by the old per-branch links (/acknowledge/east); null on
// the general link (/acknowledge), where the med rep picks East or Greenhills.
export function AckForm({ initialBranch, userName, allowed }: { initialBranch: AckBranch | null; userName: string; allowed: boolean }) {
  const draftKey = 'ack-draft'
  const [branchSlug, setBranchSlug] = useState(initialBranch?.slug || '')
  const branch = resolveAckBranch(branchSlug)
  const branchChoices = ACK_FIELD_BRANCHES.some((b) => b.slug === initialBranch?.slug) || !initialBranch ? ACK_FIELD_BRANCHES : [...ACK_FIELD_BRANCHES, initialBranch]
  const [d, setD] = useState<Draft>(EMPTY)
  const [title, setTitle] = useState(DEFAULT_DELIVERED_BY_TITLE)
  const [signature, setSignature] = useState<string | null>(null)
  const [sigKey, setSigKey] = useState(0) // remounts the pad to clear it
  const [partners, setPartners] = useState<Partner[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [signedOut, setSignedOut] = useState(false)
  const [needsReceipt, setNeedsReceipt] = useState<Array<{ formType: string; fromControl: string; toControl: string; quantity: number }> | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [today, setToday] = useState('')

  // Restore the draft (fields only, never the signature) and the med rep's title.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const saved = { ...EMPTY, ...JSON.parse(raw) } as Draft
        setD(saved)
        if (!initialBranch && saved.branch) setBranchSlug(saved.branch)
      }
      const t = localStorage.getItem('ack-title')
      if (t) setTitle(t)
    } catch { /* storage blocked: start blank */ }
    setToday(new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }))
    setLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(draftKey, JSON.stringify({ ...d, branch: branchSlug })) } catch { /* ignore */ }
  }, [d, branchSlug, draftKey, loaded])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem('ack-title', title) } catch { /* ignore */ }
  }, [title, loaded])

  const loadStock = useCallback(async () => {
    setStock([])
    if (!branchSlug) return
    try {
      const r = await fetch(`/api/inventory/form-acknowledgments/options?branch=${branchSlug}`)
      if (r.status === 401) { setSignedOut(true); return }
      const j = await r.json()
      setStock(Array.isArray(j.formTypes) ? j.formTypes : [])
    } catch { /* offline: the server still checks on submit */ }
  }, [branchSlug])

  useEffect(() => {
    if (!allowed) return
    fetch('/api/inventory/partner-institutions').then((r) => r.json()).then((j) => setPartners(Array.isArray(j.data) ? j.data : [])).catch(() => {})
    fetch('/api/inventory/form-templates').then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {}
      for (const t of Array.isArray(j.templates) ? j.templates : []) if (t.templateNo) m[t.templateNo] = t.templateName
      setTemplates(m)
    }).catch(() => {})
    loadStock()
  }, [allowed, loadStock])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const setPad = (i: number, patch: Partial<PadRow>) => setD((p) => ({ ...p, pads: p.pads.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const doctors = useMemo(() => partners.filter((p) => p.kind === 'Doctor'), [partners])
  const schools = useMemo(() => partners.filter((p) => (p.kind || 'School') === 'School'), [partners])
  const hospitals = useMemo(() => Array.from(new Set(doctors.map((p) => p.affiliation || '').filter(Boolean))).sort(), [doctors])
  const doctorHints = useMemo(() => Object.fromEntries(doctors.filter((p) => p.detail).map((p) => [p.name, p.detail!])), [doctors])

  // Who the pad rows are logged under in Partner Distribution.
  const isSchool = d.kind === 'SCHOOL'
  const partnerName = (isSchool ? d.institution : d.recipientName).trim()
  const matched = (isSchool ? schools : doctors).find((p) => same(p.name, partnerName))

  const pickDoctor = (name: string) => {
    const doc = doctors.find((p) => same(p.name, name))
    if (!doc) return
    setD((p) => ({
      ...p,
      recipientName: doc.name,
      institution: p.institution || doc.affiliation || '',
      recipientDesignation: p.recipientDesignation || doc.detail || '',
    }))
  }

  const hasPad = d.items.includes('REFERRAL_PAD')
  const stockBy = useMemo(() => new Map(stock.map((s) => [s.formType, s])), [stock])
  const formOptions = useMemo(() => {
    const inStock = stock.map((s) => s.formType)
    return [...inStock, ...Object.keys(templates).filter((t) => !inStock.includes(t)).sort()]
  }, [stock, templates])
  const formHints = useMemo(() => {
    const h: Record<string, string> = {}
    for (const t of formOptions) {
      const s = stockBy.get(t)
      h[t] = s ? `${pcs(s.onHand)} on hand${templates[t] ? ` · ${templates[t]}` : ''}` : (templates[t] ? `${templates[t]} · none received here` : 'none received here')
    }
    return h
  }, [formOptions, stockBy, templates])

  // Prefill the form type when this branch stocks exactly one form with pads on hand.
  useEffect(() => {
    if (!hasPad) return
    const onHand = stock.filter((s) => s.onHand > 0)
    if (onHand.length === 1 && d.pads.length === 1 && !d.pads[0].formType) setPad(0, { formType: onHand[0].formType })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPad, stock])

  const padInfo = d.pads.map((r) => {
    const qty = rangeQuantity(r.from, r.to)
    const st = stockBy.get(r.formType.trim())
    const a = controlToInt(r.from), b = controlToInt(r.to)
    const covered = !!(st && a != null && b != null && qty != null && coveredByUnion(st.receivedRanges, a, b))
    const given = st && a != null && b != null && qty != null ? st.givenRanges.filter((g) => g.a <= b && g.b >= a) : []
    const next = nextFree(st)
    return { qty, st, covered, given, next }
  })
  const totalPcs = hasPad ? padInfo.reduce((s, p) => s + (p.qty || 0), 0) : 0

  const missing: string[] = []
  if (!branch) missing.push('the branch (East or Greenhills)')
  if (!d.items.length) missing.push('tick at least one item')
  if (!partnerName) missing.push(isSchool ? 'the school / institution' : 'the recipient (doctor) name')
  if (!d.recipientName.trim() && !d.receivedBy.trim()) missing.push('who received the items')
  if (hasPad && d.pads.some((r, i) => !r.formType.trim() || padInfo[i].qty == null)) missing.push('the pad form and From # / To #')
  if (!signature) missing.push('the signature')

  const itemSummary = d.items.map((k) => {
    if (k !== 'REFERRAL_PAD' || !totalPcs) return ACK_ITEM_LABELS[k]
    const ranges = d.pads.filter((_, i) => padInfo[i].qty).map((r) => `${r.formType} ${r.from}–${r.to}`).join(', ')
    return `Referral Pad (${ranges}; ${pcs(totalPcs)} pcs)`
  })

  const submit = async (alsoRecordReceipt = false) => {
    if (!branch) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/inventory/form-acknowledgments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: branch.branch, recipientKind: d.kind, partnerId: matched?.id || null, partnerName,
          institution: d.institution, recipientName: d.recipientName, recipientDesignation: d.recipientDesignation,
          receivedBy: d.receivedBy, receivedByDesignation: d.receivedByDesignation, items: d.items,
          pads: hasPad ? d.pads.map((r) => ({ formType: r.formType, fromControl: r.from, toControl: r.to })) : [],
          remarks: d.remarks, deliveredByTitle: title, signaturePng: signature, alsoRecordReceipt,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 401) { setSignedOut(true); return }
      if (res.status === 409 && j.needsReceipt) { setNeedsReceipt(j.uncovered || []); return }
      if (!res.ok) { setError(j.error || 'Could not save — try again'); return }
      setNeedsReceipt(null)
      setDone({ ...j, partnerName, items: d.items, branchName: branch.shortName })
      setD(EMPTY); setSignature(null); setSigKey((k) => k + 1)
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      window.scrollTo({ top: 0 })
      loadStock()
    } catch {
      setError('No connection — your entries are kept on this device. Try again when you have signal.')
    } finally {
      setSubmitting(false)
    }
  }

  const loginHref = `/login?callbackUrl=${encodeURIComponent(initialBranch ? `/acknowledge/${initialBranch.slug}` : '/acknowledge')}`

  return (
    <div className="min-h-screen pb-16" style={{ ...HR_VARS, background: 'var(--off-white)', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}>
      <header className="border-b bg-white" style={{ borderColor: 'var(--light-gray)' }}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/scei-mark.png" alt="" className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>Accounting Hub</span>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={branch ? { background: 'var(--pale-teal)', color: 'var(--teal)' } : { background: '#fef3c7', color: '#92400e' }}>{branch ? branch.shortName : 'Pick a branch'}</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>Acknowledgment Receipt</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--mid-gray)' }}>For brochures, referral pads, giveaways and documents received during coverage</p>
        </div>

        {!allowed ? (
          <Card title="No access">
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>Your account can&apos;t record acknowledgments. Ask an admin to give you MedRep access in the Accounting Hub.</p>
          </Card>
        ) : signedOut ? (
          <Card title="Signed out">
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>Your sign-in has expired. Your entries are kept on this phone; the signature will need to be done again.</p>
            <a href={loginHref} className="inline-flex items-center gap-2 h-11 px-4 rounded-lg text-white text-sm font-semibold" style={{ background: 'var(--teal)' }}><LogIn size={16} /> Sign in again</a>
          </Card>
        ) : done ? (
          <Card title="Saved">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={28} style={{ color: '#047857' }} className="shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">Signed acknowledgment saved for {done.partnerName}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
                  {done.items.map((k) => ACK_ITEM_LABELS[k]).join(', ')}.
                  {done.pcs > 0 && <> {pcs(done.pcs)} pcs drawn from {done.branchName} on-hand ({done.padRows} row{done.padRows === 1 ? '' : 's'} in Partner Distribution).</>}
                  {done.receiptsAdded > 0 && <> The pad numbers were also recorded as received.</>}
                </p>
                {!done.pdfOk && <p className="text-sm mt-1" style={{ color: '#b45309' }}>The PDF will be built when it is first opened.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
              <a href={done.pdfUrl} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 h-11 rounded-lg border bg-white text-sm font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><FileText size={16} /> View PDF</a>
              <a href={`${done.pdfUrl}&download=1`} className="inline-flex items-center justify-center gap-2 h-11 rounded-lg border bg-white text-sm font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}><Download size={16} /> Download</a>
              <button type="button" onClick={() => setDone(null)} className="inline-flex items-center justify-center gap-2 h-11 rounded-lg text-white text-sm font-semibold" style={{ background: 'var(--teal)' }}><RotateCcw size={16} /> New acknowledgment</button>
            </div>
          </Card>
        ) : (
          <>
            <Card title="Branch">
              <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>Which branch are these items from? Referral pads come out of that branch&apos;s on-hand.</p>
              <div className="grid grid-cols-2 gap-2">
                {branchChoices.map((b) => (
                  <button key={b.slug} type="button" aria-pressed={branchSlug === b.slug} onClick={() => setBranchSlug(b.slug)}
                    className="h-12 rounded-lg border text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                    style={branchSlug === b.slug ? { borderColor: 'var(--teal)', background: 'var(--teal)', color: 'white' } : { borderColor: 'var(--light-gray)', background: 'white', color: 'var(--charcoal)' }}>
                    {branchSlug === b.slug && <Check size={16} strokeWidth={3} />} {b.shortName.replace(/ Branch$/, '')}
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Delivered by">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <div className="h-12 px-3 rounded-lg border flex items-center text-[16px]" style={{ borderColor: 'var(--light-gray)', background: 'var(--hr-head)' }}>{userName}</div>
                </div>
                <div>
                  <Label htmlFor="ack-title">Title</Label>
                  <input id="ack-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--hr-faint)' }}>{branch ? branch.name : 'Branch not picked yet'}{today ? ` · ${today}` : ''}</p>
            </Card>

            <Card title="Recipient">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg mb-4" style={{ background: 'var(--hr-head)', border: '1px solid var(--light-gray)' }}>
                {([['DOCTOR', 'Doctor', Stethoscope], ['SCHOOL', 'School', GraduationCap]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => set('kind', k)}
                    className="h-10 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                    style={d.kind === k ? { background: 'white', color: 'var(--teal)', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: 'var(--mid-gray)' }}>
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div>
                  <Label>{isSchool ? 'Institution / School' : 'Institution / Hospital'}</Label>
                  <NameCombobox value={d.institution} onChange={(v) => set('institution', v)}
                    options={isSchool ? schools.map((s) => s.name) : hospitals} maxOptions={Math.max(60, schools.length, hospitals.length)}
                    placeholder={isSchool ? 'Pick or type the school' : 'e.g. Cardinal Santos Medical Center'}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <Label>Recipient Name</Label>
                  <NameCombobox value={d.recipientName} onChange={(v) => set('recipientName', v)}
                    onCommit={(v) => { if (!isSchool) pickDoctor(v) }}
                    options={isSchool ? [] : doctors.map((p) => p.name)} maxOptions={Math.max(60, doctors.length)} hints={isSchool ? undefined : doctorHints}
                    placeholder={isSchool ? 'Person who received it' : 'Pick the doctor or type a name'}
                    className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <Label htmlFor="ack-rdes">Recipient Designation</Label>
                  <input id="ack-rdes" value={d.recipientDesignation} onChange={(e) => set('recipientDesignation', e.target.value)} placeholder={isSchool ? 'e.g. Guidance Counselor' : 'e.g. Developmental Pediatrician'} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <div className="flex items-end justify-between gap-2">
                    <Label htmlFor="ack-rby">Received By</Label>
                    {d.recipientName.trim() && !d.receivedBy.trim() && (
                      <button type="button" onClick={() => setD((p) => ({ ...p, receivedBy: p.recipientName, receivedByDesignation: p.receivedByDesignation || p.recipientDesignation }))}
                        className="text-xs font-semibold mb-1.5" style={{ color: 'var(--teal)' }}>Same as recipient</button>
                    )}
                  </div>
                  <input id="ack-rby" value={d.receivedBy} onChange={(e) => set('receivedBy', e.target.value)} placeholder="e.g. the secretary's name" className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <Label htmlFor="ack-rbydes">Designation</Label>
                  <input id="ack-rbydes" value={d.receivedByDesignation} onChange={(e) => set('receivedByDesignation', e.target.value)} placeholder="e.g. Secretary" className={inputCls} style={inputStyle} />
                </div>
              </div>
              {partnerName && (
                <p className="text-xs mt-3" style={{ color: 'var(--mid-gray)' }}>
                  Logged in Partner Distribution under <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{partnerName}</span>
                  {matched ? (isSchool ? ' (HR partner school)' : ' (referrers list)') : <span style={{ color: '#b45309' }}> — not in the {isSchool ? 'HR partner list' : 'referrers list'}, saved by name</span>}
                </p>
              )}
            </Card>

            <Card title="Items received (check all that apply)">
              <div className="grid grid-cols-2 gap-2">
                {ACK_ITEMS.map((it) => {
                  const on = d.items.includes(it.key)
                  return (
                    <button key={it.key} type="button" aria-pressed={on}
                      onClick={() => set('items', on ? d.items.filter((k) => k !== it.key) : [...d.items, it.key])}
                      className="flex items-center gap-3 h-12 px-3 rounded-lg border text-left text-[15px] font-semibold transition-colors"
                      style={on ? { borderColor: 'var(--teal)', background: 'var(--pale-teal)', color: 'var(--charcoal)' } : { borderColor: 'var(--light-gray)', background: 'white', color: 'var(--mid-gray)' }}>
                      <span className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                        style={on ? { background: 'var(--teal)', borderColor: 'var(--teal)' } : { borderColor: '#b8c4a8' }}>
                        {on && <Check size={14} color="white" strokeWidth={3} />}
                      </span>
                      {it.label}
                    </button>
                  )
                })}
              </div>
            </Card>

            {hasPad && (
              <Card title="Referral pads handed out" right={totalPcs > 0 ? <span className="text-sm font-bold" style={{ color: 'var(--teal)' }}>{pcs(totalPcs)} pcs</span> : undefined}>
                {!branch && <p className="text-sm mb-3 px-3 py-2 rounded-lg" style={{ background: '#fef3c7', color: '#92400e' }}>Pick the branch above to see which pads are on hand.</p>}
                <div className="space-y-4">
                  {d.pads.map((r, i) => {
                    const info = padInfo[i]
                    const width = info.st?.width || 4
                    return (
                      <div key={i} className={i > 0 ? 'pt-4 border-t' : ''} style={{ borderColor: 'var(--hr-line)' }}>
                        <div className="flex items-end gap-2">
                          <div className="flex-1 min-w-0">
                            <Label>Form</Label>
                            <NameCombobox value={r.formType} onChange={(v) => setPad(i, { formType: v })} options={formOptions} maxOptions={Math.max(60, formOptions.length)} hints={formHints}
                              placeholder="Pick the form" className={inputCls} style={inputStyle} />
                          </div>
                          {d.pads.length > 1 && (
                            <button type="button" onClick={() => set('pads', d.pads.filter((_, j) => j !== i))} aria-label="Remove range"
                              className="h-12 w-12 shrink-0 rounded-lg border bg-white flex items-center justify-center" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><X size={18} /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
                          <div>
                            <Label>From #</Label>
                            <input value={r.from} onChange={(e) => setPad(i, { from: e.target.value })} inputMode="numeric" placeholder="0651" className={inputCls} style={inputStyle} />
                          </div>
                          <div>
                            <Label>To #</Label>
                            <input value={r.to} onChange={(e) => setPad(i, { to: e.target.value })} inputMode="numeric" placeholder="0700" className={inputCls} style={inputStyle} />
                          </div>
                          <div className="h-12 min-w-[64px] px-2 rounded-lg flex flex-col items-center justify-center" style={{ background: 'var(--hr-head)', border: '1px solid var(--light-gray)' }}>
                            <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--hr-faint)' }}>Pcs</span>
                            <span className="text-[15px] font-bold leading-tight">{info.qty == null ? '—' : pcs(info.qty)}</span>
                          </div>
                        </div>
                        {info.next != null && !r.from && (
                          <button type="button" onClick={() => setPad(i, { from: String(info.next).padStart(width, '0') })}
                            className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--pale-teal)', color: 'var(--teal)' }}>
                            Next unused number on hand: {String(info.next).padStart(width, '0')}
                          </button>
                        )}
                        {branch && r.formType.trim() && info.qty != null && (
                          <div className="mt-2 space-y-1 text-xs">
                            {info.covered ? (
                              <p style={{ color: '#047857' }}>✓ In {branch?.shortName} stock · {pcs(info.st!.onHand)} on hand → {pcs(info.st!.onHand - info.qty)} after this</p>
                            ) : (
                              <p className="flex items-start gap-1.5" style={{ color: '#b45309' }}><AlertTriangle size={14} className="shrink-0 mt-px" /> These numbers are not recorded as received at {branch?.shortName}. You&apos;ll be asked to record them as received when you submit.</p>
                            )}
                            {info.given.length > 0 && (
                              <p className="flex items-start gap-1.5" style={{ color: '#b91c1c' }}><AlertTriangle size={14} className="shrink-0 mt-px" />
                                Some of these numbers were already given to {info.given[0].partnerName} on {fmtDate(info.given[0].dateGiven)}{info.given.length > 1 ? ` (+${info.given.length - 1} more)` : ''}. Check the pad.</p>
                            )}
                          </div>
                        )}
                        {r.from && r.to && info.qty == null && <p className="mt-2 text-xs" style={{ color: '#b91c1c' }}>To # must be the same as or after From #.</p>}
                      </div>
                    )
                  })}
                </div>
                {d.pads.length < MAX_PADS && (
                  <button type="button" onClick={() => set('pads', [...d.pads, { formType: d.pads[d.pads.length - 1]?.formType || '', from: '', to: '' }])}
                    className="mt-4 inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border bg-white text-sm font-semibold" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
                    <Plus size={16} /> Add another range
                  </button>
                )}
              </Card>
            )}

            <Card title="Remarks (optional)">
              <textarea value={d.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} maxLength={500}
                className="w-full px-3 py-2.5 rounded-lg border bg-white text-[16px] outline-none focus:border-[var(--teal)]" style={inputStyle} />
            </Card>

            <Card title="Signature of doctor / secretary">
              {d.items.length > 0 && (
                <p className="text-sm mb-3" style={{ color: 'var(--mid-gray)' }}>
                  By signing, <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{d.receivedBy.trim() || d.recipientName.trim() || 'the recipient'}</span> acknowledges receiving {itemSummary.join(', ')} from {userName}.
                </p>
              )}
              <SignaturePad key={sigKey} onChange={setSignature} height={210} />
              <p className="text-xs mt-1" style={{ color: 'var(--hr-faint)' }}>Delivered by: {userName} | {title || DEFAULT_DELIVERED_BY_TITLE}</p>
            </Card>

            {error && <p className="text-sm px-3 py-2.5 rounded-lg" style={{ background: '#fee2e2', color: '#991b1b' }}>{error}</p>}
            <div>
              <button type="button" onClick={() => submit(false)} disabled={submitting || missing.length > 0}
                className="w-full h-12 rounded-lg text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45" style={{ background: 'var(--teal)' }}>
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Submit signed acknowledgment
              </button>
              {missing.length > 0 && <p className="text-xs mt-2 text-center" style={{ color: 'var(--hr-faint)' }}>Still needed: {missing.join(', ')}</p>}
            </div>
          </>
        )}
      </main>

      {needsReceipt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Pads not recorded as received</h3>
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>These control numbers are not yet recorded in {branch?.shortName}&apos;s Consumable Forms:</p>
            <ul className="text-sm my-3 space-y-1">
              {needsReceipt.map((u, i) => <li key={i} className="font-semibold">{u.formType} · {u.fromControl}–{u.toControl} ({pcs(u.quantity)} pcs)</li>)}
            </ul>
            <p className="text-sm mb-4" style={{ color: 'var(--mid-gray)' }}>Record them as received from the supplier now? If you choose No, nothing is saved — check the numbers and submit again.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setNeedsReceipt(null)} disabled={submitting} className="h-11 px-4 rounded-lg border bg-white text-sm font-semibold" style={{ borderColor: 'var(--light-gray)' }}>No, go back</button>
              <button type="button" onClick={() => submit(true)} disabled={submitting} className="h-11 px-4 rounded-lg text-white text-sm font-semibold inline-flex items-center justify-center gap-2" style={{ background: 'var(--teal)' }}>
                {submitting && <Loader2 size={16} className="animate-spin" />} Yes, record as received
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
