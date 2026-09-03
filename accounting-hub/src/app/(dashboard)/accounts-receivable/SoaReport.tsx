'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Settings, Download, Eye, Trash2, Loader2, AlertCircle,
  X, CheckCircle2, Upload, RefreshCw,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  buildSoaPdf, periodLabel, MONTH_OPTIONS, type SoaSettings, type SoaOrder as AROrder,
} from '@/lib/soa-pdf'

/* ─── Types ────────────────────────────────────────────────── */
interface ARWallet { id: string; patientName: string; branch?: string | null }


interface SoaListRecord {
  id: string
  walletId: string
  walletName: string
  period: string // "YYYY-MM"
  branch: string | null
  isHighlighted: boolean
  generatedAt: string
  generatedByName: string | null
  orderIds?: string[] | null      // sessions covered by this SOA (set at generation)
  submittedDate?: string | null   // set once the Submitted button records the filing date
  submissionId?: string | null
}


interface SoaReportProps {
  wallets: ARWallet[]
  isAdmin: boolean // can edit settings
  canWrite?: boolean // can generate/delete SOAs (front desk view them only)
}

/* ─── SOA Settings Modal ───────────────────────────────────── */
function SoaSettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: SoaSettings
  onSave: (s: SoaSettings) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<SoaSettings>({ ...settings })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadingHmo, setUploadingHmo] = useState(false)
  const [uploadingMgr, setUploadingMgr] = useState(false)
  const hmoSigRef = useRef<HTMLInputElement>(null)
  const mgrSigRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof SoaSettings, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Convert image to resized base64 data URI (stored in DB — survives redeploys)
  const uploadSig = async (file: File, field: 'hmoOfficerEsigUrl' | 'clinicManagerEsigUrl', setBusy: (v: boolean) => void) => {
    setBusy(true)
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onloadend = () => {
          const img = new Image()
          img.onerror = reject
          img.onload = () => {
            const canvas = document.createElement('canvas')
            const MAX = 800
            const scale = Math.min(1, MAX / img.width)
            canvas.width = Math.round(img.width * scale)
            canvas.height = Math.round(img.height * scale)
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL('image/png', 0.9))
          }
          img.src = reader.result as string
        }
        reader.readAsDataURL(file)
      })
      setForm(f => ({ ...f, [field]: dataUri }))
    } catch { setError('Failed to process image') }
    finally { setBusy(false) }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch { setError('Failed to save settings') }
    finally { setSaving(false) }
  }

  const field = (label: string, key: keyof SoaSettings, placeholder?: string) => (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>{label}</label>
      <input type="text" value={(form[key] as string) || ''} onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)' }}>SOA Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Clinic Info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Clinic Information</p>
            <div className="space-y-3">
              {field('Clinic Name', 'clinicName', 'Sapphire Clinics East Incorporated')}
              {field('Clinic Address', 'clinicAddress', 'Level 4, Robinsons Metroeast...')}
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Bank Details</p>
            <div className="space-y-3">
              {field('Bank Name', 'bankName', 'BDO Unibank, Inc.')}
              {field('Bank Branch', 'bankBranch', 'Robinsons - Metro East')}
              {field('Account Name', 'bankAccountName', 'Sapphire Clinics East Incorporated')}
              {field('Account Number', 'bankAccountNo', '004688016007')}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Contact Information</p>
            <div className="space-y-3">
              {field('Email', 'contactEmail', 'east.sandboxclinic@gmail.com')}
              {field('Phone 1', 'contactPhone1', '0917 118 9289')}
              {field('Phone 2', 'contactPhone2', '(02) 5310 4991')}
            </div>
          </div>

          {/* Signatories */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--teal)' }}>Signatories</p>
            <div className="space-y-4">
              {/* HMO Officer */}
              <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>HMO Officer</p>
                {field('Full Name', 'hmoOfficerName', 'DENISE VERONICA SALAO')}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>E-Signature Image</label>
                  {form.hmoOfficerEsigUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={form.hmoOfficerEsigUrl} alt="HMO e-sig" className="h-12 object-contain border rounded-lg" style={{ borderColor: 'var(--light-gray)' }} />
                      <button onClick={() => setForm(f => ({ ...f, hmoOfficerEsigUrl: null }))}
                        className="p-1 rounded hover:bg-red-50"><X size={12} className="text-red-400" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer text-xs hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', opacity: uploadingHmo ? 0.5 : 1 }}>
                      <Upload size={13} />
                      {uploadingHmo ? 'Uploading...' : 'Upload PNG/JPG (transparent background recommended)'}
                      <input ref={hmoSigRef} type="file" accept="image/*" className="hidden" disabled={uploadingHmo}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadSig(f, 'hmoOfficerEsigUrl', setUploadingHmo) }} />
                    </label>
                  )}
                </div>
              </div>

              {/* Clinic Manager */}
              <div className="p-4 rounded-xl border space-y-3" style={{ borderColor: 'var(--light-gray)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Clinic Manager</p>
                {field('Full Name', 'clinicManagerName', 'JAN DE ASIS')}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>E-Signature Image</label>
                  {form.clinicManagerEsigUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={form.clinicManagerEsigUrl} alt="Manager e-sig" className="h-12 object-contain border rounded-lg" style={{ borderColor: 'var(--light-gray)' }} />
                      <button onClick={() => setForm(f => ({ ...f, clinicManagerEsigUrl: null }))}
                        className="p-1 rounded hover:bg-red-50"><X size={12} className="text-red-400" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed cursor-pointer text-xs hover:bg-gray-50"
                      style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)', opacity: uploadingMgr ? 0.5 : 1 }}>
                      <Upload size={13} />
                      {uploadingMgr ? 'Uploading...' : 'Upload PNG/JPG (transparent background recommended)'}
                      <input ref={mgrSigRef} type="file" accept="image/*" className="hidden" disabled={uploadingMgr}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadSig(f, 'clinicManagerEsigUrl', setUploadingMgr) }} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="mx-6 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}

        <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: 'var(--light-gray)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--teal)' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Duplicate Confirm Dialog ─────────────────────────────── */
function DuplicateDialog({
  walletName,
  period,
  onConfirm,
  onCancel,
}: {
  walletName: string
  period: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fef3c7' }}>
            <AlertCircle size={20} style={{ color: '#d97706' }} />
          </div>
          <div>
            <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--charcoal)' }}>SOA Already Generated</h3>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              An SOA for <strong>{walletName}</strong> — <strong>{periodLabel(period)}</strong> has already been generated.
              Do you want to generate again? Both versions will appear highlighted in the SOA History.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>Cancel</button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: '#d97706' }}>
            Generate Again
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ───────────────────────────────────────── */
export default function SoaReport({ wallets, isAdmin, canWrite = true }: SoaReportProps) {
  const [settings, setSettings] = useState<SoaSettings>({})
  const [showSettings, setShowSettings] = useState(false)
  const [records, setRecords] = useState<SoaListRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(true)

  // Generate form state
  const [genWallet, setGenWallet] = useState('')
  const [genPeriod, setGenPeriod] = useState(MONTH_OPTIONS[1]?.value || '')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [genSuccess, setGenSuccess] = useState('')

  // Duplicate dialog
  const [showDuplicate, setShowDuplicate] = useState(false)
  const pendingGenRef = useRef<(() => Promise<void>) | null>(null)

  // Transaction preview: once a provider + month are chosen, every eligible
  // transaction loads TICKED; individual sessions can be unticked before
  // generating. Sessions already in an SOA Submissions batch never appear —
  // they can no longer go on a new SOA.
  const [previewOrders, setPreviewOrders] = useState<AROrder[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [alreadySubmittedCount, setAlreadySubmittedCount] = useState(0)

  const loadPreview = useCallback(async () => {
    if (!genWallet || !genPeriod) { setPreviewOrders(null); setUnticked(new Set()); return }
    setPreviewLoading(true)
    setGenError('')
    setGenSuccess('')
    try {
      const [year, month] = genPeriod.split('-')
      const dateFrom = `${year}-${month}-01`
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
      const dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      const r = await fetch(`/api/accounts-receivable?type=HMO&walletId=${genWallet}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
      const d = await r.json()
      const all: AROrder[] = d.orders || []
      // Excluded: sessions already in a submitted batch, AND sessions sitting on
      // a generated SOA that is still awaiting its Submitted date.
      const pendingCovered = new Set(records.filter(r => r.walletId === genWallet && !r.submittedDate).flatMap(r => r.orderIds || []))
      const eligible = all.filter(o => !(o.soaSubmissionItems?.length) && !pendingCovered.has(o.id))
      setAlreadySubmittedCount(all.length - eligible.length)
      setPreviewOrders(eligible)
      setUnticked(new Set())
    } catch {
      setPreviewOrders(null)
      setGenError('Could not load the transactions for this provider and month.')
    } finally {
      setPreviewLoading(false)
    }
  }, [genWallet, genPeriod, records])
  useEffect(() => { loadPreview() }, [loadPreview])

  // "Submitted" button: record the date the SOA was actually filed. The server
  // creates the SoaSubmission batch over the record's sessions, which flips
  // "SOA Submitted" / "Date SOA Submitted" in the Per HMO table.
  const [submitFor, setSubmitFor] = useState<SoaListRecord | null>(null)
  const [submitDate, setSubmitDate] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const markSubmitted = async () => {
    if (!submitFor || !submitDate) { setSubmitError('Pick the date of submission.'); return }
    setSubmitBusy(true)
    setSubmitError('')
    try {
      const r = await fetch('/api/accounts-receivable/soa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: submitFor.id, submittedDate: submitDate }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to record the submission')
      setSubmitFor(null)
      await fetchRecords()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to record the submission')
    } finally {
      setSubmitBusy(false)
    }
  }

  const previewAmount = (o: AROrder) =>
    o.payments.reduce((s, p) => (!p.walletId || p.walletId === genWallet) ? s + (Number(p.amount) || 0) : s, 0)

  // History filters
  const [histWallet, setHistWallet] = useState('')
  const [histPeriod, setHistPeriod] = useState('')

  // Actions
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/accounts-receivable/soa-settings')
      if (r.ok) setSettings(await r.json())
    } catch { /* ignore */ }
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoadingRecords(true)
    try {
      const r = await fetch('/api/accounts-receivable/soa')
      if (r.ok) setRecords(await r.json())
    } catch { /* ignore */ }
    finally { setLoadingRecords(false) }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchRecords()
  }, [fetchSettings, fetchRecords])

  const saveSettings = async (s: SoaSettings) => {
    const r = await fetch('/api/accounts-receivable/soa-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (!r.ok) throw new Error('Failed')
    setSettings(s)
  }

  /* ── Core generate function ─────────────────────────────────── */
  const doGenerate = async (forceCreate = false) => {
    if (!genWallet || !genPeriod) { setGenError('Please select both an HMO Provider and Month.'); return }
    setGenerating(true)
    setGenError('')
    setGenSuccess('')
    try {
      const wallet = wallets.find(w => w.id === genWallet)
      const walletName = wallet?.patientName || genWallet

      // If not forcing, check for duplicate first (read-only, never creates)
      if (!forceCreate) {
        const checkRes = await fetch('/api/accounts-receivable/soa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletId: genWallet, walletName, period: genPeriod, checkOnly: true }),
        })
        const checkData = await checkRes.json()
        if (checkData.duplicate) {
          // Store the generate function and show dialog
          pendingGenRef.current = () => doGenerate(true)
          setShowDuplicate(true)
          setGenerating(false)
          return
        }
      }

      // The SOA covers exactly the TICKED transactions from the preview list.
      const eligible = previewOrders || []
      const fetchedOrders = eligible.filter(o => !unticked.has(o.id))
      const excludedByUser = eligible.length - fetchedOrders.length
      const alreadySubmitted = alreadySubmittedCount

      if (eligible.length === 0) {
        setGenError(alreadySubmitted > 0
          ? 'All sessions in this period are already tagged as SOA-submitted (see SOA Submissions) — nothing left to put on a new SOA.'
          : 'No orders found for this provider and period.')
        setGenerating(false)
        return
      }
      if (fetchedOrders.length === 0) {
        setGenError('Every transaction is unticked — tick at least one session to generate an SOA.')
        setGenerating(false)
        return
      }

      // Generate PDF
      const pdfBase64 = await buildSoaPdf(fetchedOrders, genWallet, walletName, genPeriod, settings)

      // Save record, carrying the covered order ids. Sessions are NOT tagged as
      // submitted yet — that happens when the Submitted button records the
      // actual filing date on the SOA record.
      const saveRes = await fetch('/api/accounts-receivable/soa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: genWallet, walletName, period: genPeriod,
          pdfData: pdfBase64,
          orderIds: fetchedOrders.map(o => o.id),
          forceCreate: true, // at this point we've confirmed or it's a fresh generate
        }),
      })

      if (!saveRes.ok) throw new Error('Failed to save SOA')

      setGenSuccess(
        `SOA for ${walletName} — ${periodLabel(genPeriod)} generated with ${fetchedOrders.length} session${fetchedOrders.length === 1 ? '' : 's'}.`
        + (excludedByUser > 0 ? ` ${excludedByUser} unticked session${excludedByUser === 1 ? ' was' : 's were'} left off.` : '')
        + (alreadySubmitted > 0 ? ` ${alreadySubmitted} already-submitted session${alreadySubmitted === 1 ? ' was' : 's were'} excluded.` : '')
        + ' Once it is actually filed, click Submitted on the record below to log the date — that flips its sessions to SOA-submitted in Per HMO.'
      )
      await fetchRecords()
      await loadPreview()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Failed to generate SOA')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerate = () => doGenerate(false)

  const confirmDuplicate = async () => {
    setShowDuplicate(false)
    if (pendingGenRef.current) {
      await pendingGenRef.current()
      pendingGenRef.current = null
    }
  }

  /* ── View / Download ─────────────────────────────────────────── */
  const openSoa = async (id: string, download: boolean) => {
    setViewingId(id)
    try {
      const r = await fetch(`/api/accounts-receivable/soa?id=${id}`)
      if (!r.ok) throw new Error('Failed')
      const d = await r.json()
      if (!d.pdfData) { alert('PDF data not found for this SOA.'); return }
      const byteStr = atob(d.pdfData)
      const bytes = new Uint8Array(byteStr.length)
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = `SOA_${d.walletName.replace(/\s+/g,'_')}_${d.period}.pdf`
        a.click()
      } else {
        window.open(url, '_blank')
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch { alert('Could not load SOA PDF') }
    finally { setViewingId(null) }
  }

  /* ── Delete ──────────────────────────────────────────────────── */
  const deleteSoa = async (id: string) => {
    if (!confirm('Delete this SOA record? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/accounts-receivable/soa?id=${id}`, { method: 'DELETE' })
      setRecords(rs => rs.filter(r => r.id !== id))
    } catch { alert('Failed to delete') }
    finally { setDeletingId(null) }
  }

  /* ── History filter ──────────────────────────────────────────── */
  const filteredRecords = records.filter(r => {
    if (histWallet && r.walletId !== histWallet) return false
    if (histPeriod && r.period !== histPeriod) return false
    return true
  })

  /* ── Unique periods in history for filter dropdown ───────────── */
  const historyPeriods = Array.from(new Set(records.map(r => r.period))).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-6">
      {/* ── Top-right Settings button ──────────────────────────── */}
      <div className="flex justify-end">
        {isAdmin && (
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
            <Settings size={14} /> SOA Settings
          </button>
        )}
      </div>

      {/* ── Generate SOA Report ─────────────────────────────────── */}
      {canWrite && (
      <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Generate SOA</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Select an HMO provider and month — every transaction for that month loads ticked below. Untick any you want left off, then generate the Statement of Account PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>HMO Provider</label>
            <select value={genWallet} onChange={e => { setGenWallet(e.target.value); setGenError(''); setGenSuccess('') }}
              className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">Select provider...</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
            <select value={genPeriod} onChange={e => { setGenPeriod(e.target.value); setGenError(''); setGenSuccess('') }}
              className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
              {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={handleGenerate}
            disabled={generating || previewLoading || !genWallet || !genPeriod || !previewOrders || previewOrders.filter(o => !unticked.has(o.id)).length === 0}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--teal)' }}>
            {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate SOA</>}
          </button>
        </div>

        {/* ── Transaction preview: all ticked by default; untick to leave off ── */}
        {genWallet && genPeriod && (
          previewLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs" style={{ color: 'var(--mid-gray)' }}>
              <Loader2 size={14} className="animate-spin" /> Loading transactions…
            </div>
          ) : previewOrders && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
              {previewOrders.length === 0 ? (
                <div className="px-4 py-5 text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {alreadySubmittedCount > 0
                    ? `All ${alreadySubmittedCount} session${alreadySubmittedCount === 1 ? '' : 's'} in this month are already tagged as SOA-submitted (see SOA Submissions) — nothing left to put on a new SOA.`
                    : 'No transactions found for this provider and month.'}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left sticky top-0" style={{ background: 'var(--off-white)', color: 'var(--mid-gray)' }}>
                          <th className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={unticked.size === 0}
                              onChange={() => setUnticked(unticked.size === 0 ? new Set(previewOrders.map(o => o.id)) : new Set())}
                              title={unticked.size === 0 ? 'Untick all' : 'Tick all'}
                            />
                          </th>
                          <th className="px-3 py-2 font-semibold whitespace-nowrap">Date</th>
                          <th className="px-3 py-2 font-semibold">Patient</th>
                          <th className="px-3 py-2 font-semibold">Service</th>
                          <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewOrders.map(o => {
                          const on = !unticked.has(o.id)
                          return (
                            <tr key={o.id} className="border-t cursor-pointer" style={{ borderColor: 'var(--light-gray)', opacity: on ? 1 : 0.45 }}
                              onClick={() => setUnticked(prev => { const n = new Set(prev); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n })}>
                              <td className="px-3 py-2"><input type="checkbox" checked={on} readOnly /></td>
                              <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--mid-gray)' }}>
                                {new Date(o.arCustomDate || o.transactionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{o.patientName || '—'}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{o.items.map(i => i.name).join(', ')}</td>
                              <td className="px-3 py-2 text-right font-medium whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{formatCurrency(previewAmount(o))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
                    <span style={{ color: 'var(--charcoal)' }}>
                      <strong>{previewOrders.length - unticked.size}</strong> of {previewOrders.length} session{previewOrders.length === 1 ? '' : 's'} ticked
                      {' '}· total <strong>{formatCurrency(previewOrders.filter(o => !unticked.has(o.id)).reduce((s, o) => s + previewAmount(o), 0))}</strong>
                      {unticked.size > 0 && <span style={{ color: 'var(--mid-gray)' }}> · {unticked.size} unticked will stay taggable later</span>}
                    </span>
                    {alreadySubmittedCount > 0 && (
                      <span style={{ color: 'var(--mid-gray)' }}>{alreadySubmittedCount} already-submitted session{alreadySubmittedCount === 1 ? '' : 's'} not shown</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        )}

        {genError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: '#fef2f2', color: '#dc2626' }}>
            <AlertCircle size={13} /> {genError}
          </div>
        )}
        {genSuccess && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: '#f0fdf4', color: '#15803d' }}>
            <CheckCircle2 size={13} /> {genSuccess}
          </div>
        )}

        {/* Settings nudge if incomplete */}
        {!settings.bankName && !settings.hmoOfficerName && isAdmin && (
          <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
            💡 Set up bank details and signatory names in{' '}
            <button onClick={() => setShowSettings(true)} className="underline font-medium" style={{ color: 'var(--teal)' }}>
              SOA Settings
            </button>{' '}
            to include them in the PDF.
          </p>
        )}
      </div>
      )}

      {/* ── SOA History ────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: 'var(--light-gray)', background: 'white' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>SOA History</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
              Previously generated SOA PDFs. Highlighted rows indicate multiple SOAs for the same period.
            </p>
          </div>
          <button onClick={fetchRecords} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>HMO Provider</label>
            <select value={histWallet} onChange={e => setHistWallet(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">All Providers</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.patientName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Month</label>
            <select value={histPeriod} onChange={e => setHistPeriod(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }}>
              <option value="">All Months</option>
              {historyPeriods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--off-white)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>HMO Provider</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Generated</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Submitted</th>
                <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                  <Loader2 size={16} className="animate-spin inline mr-2" />Loading…
                </td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                  {canWrite ? 'No SOA records found. Generate your first SOA above.' : 'No SOA records found.'}
                </td></tr>
              ) : filteredRecords.map(r => (
                <tr key={r.id}
                  className="border-t"
                  style={{
                    borderColor: 'var(--light-gray)',
                    background: r.isHighlighted ? '#fffbeb' : 'white',
                  }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{r.walletName}</span>
                      {r.isHighlighted && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                          Duplicate
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--charcoal)' }}>{periodLabel(r.period)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                    {new Date(r.generatedAt).toLocaleString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: true,
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{r.generatedByName || '—'}</td>
                  <td className="px-4 py-3">
                    {r.submittedDate ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap" style={{ background: '#dcfce7', color: '#166534' }}>
                        {new Date(r.submittedDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    ) : canWrite && (r.orderIds?.length || 0) > 0 ? (
                      <button
                        onClick={() => { setSubmitFor(r); setSubmitDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })); setSubmitError('') }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: 'var(--teal)' }}
                        title="Record the date this SOA was submitted — its sessions flip to SOA-submitted in Per HMO">
                        <Upload size={11} /> Submitted
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--mid-gray)' }} title={(r.orderIds?.length || 0) === 0 ? 'Generated before per-session tracking — tag its sessions in SOA Submissions' : undefined}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openSoa(r.id, false)} disabled={viewingId === r.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
                        {viewingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} View
                      </button>
                      <button onClick={() => openSoa(r.id, true)} disabled={viewingId === r.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: 'var(--charcoal)', color: 'var(--charcoal)' }}>
                        <Download size={11} /> Download
                      </button>
                      {canWrite && (
                      <button onClick={() => deleteSoa(r.id)} disabled={deletingId === r.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                        style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                        {deletingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showSettings && (
        <SoaSettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showDuplicate && (
        <DuplicateDialog
          walletName={wallets.find(w => w.id === genWallet)?.patientName || genWallet}
          period={genPeriod}
          onConfirm={confirmDuplicate}
          onCancel={() => { setShowDuplicate(false); pendingGenRef.current = null; setGenerating(false) }}
        />
      )}

      {/* Record-the-submission-date dialog (the Submitted button) */}
      {submitFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !submitBusy && setSubmitFor(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Record SOA submission</h3>
            <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
              <strong>{submitFor.walletName}</strong> — {periodLabel(submitFor.period)}, covering {submitFor.orderIds?.length || 0} session{(submitFor.orderIds?.length || 0) === 1 ? '' : 's'}.
              Recording this flips those sessions to <strong>SOA Submitted: Yes</strong> with this date in the Per HMO table.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--mid-gray)' }}>Date of submission</label>
              <input type="date" value={submitDate} onChange={e => setSubmitDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />
            </div>
            {submitError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: '#fef2f2', color: '#dc2626' }}>
                <AlertCircle size={13} /> {submitError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setSubmitFor(null)} disabled={submitBusy}
                className="px-4 py-2 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
                Cancel
              </button>
              <button onClick={markSubmitted} disabled={submitBusy || !submitDate}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>
                {submitBusy ? <><Loader2 size={13} className="animate-spin" /> Recording…</> : 'Record as Submitted'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
