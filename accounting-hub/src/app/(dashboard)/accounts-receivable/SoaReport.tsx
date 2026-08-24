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

      // Fetch orders for this wallet + period
      const [year, month] = genPeriod.split('-')
      const dateFrom = `${year}-${month}-01`
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
      const dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`

      const ordersRes = await fetch(
        `/api/accounts-receivable?type=HMO&walletId=${genWallet}&dateFrom=${dateFrom}&dateTo=${dateTo}`
      )
      const ordersData = await ordersRes.json()
      const fetchedOrders: AROrder[] = ordersData.orders || []

      if (fetchedOrders.length === 0) {
        setGenError('No orders found for this provider and period.')
        setGenerating(false)
        return
      }

      // Generate PDF
      const pdfBase64 = await buildSoaPdf(fetchedOrders, genWallet, walletName, genPeriod, settings)

      // Save record
      const saveRes = await fetch('/api/accounts-receivable/soa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: genWallet, walletName, period: genPeriod,
          pdfData: pdfBase64,
          forceCreate: true, // at this point we've confirmed or it's a fresh generate
        }),
      })

      if (!saveRes.ok) throw new Error('Failed to save SOA')

      setGenSuccess(`SOA for ${walletName} — ${periodLabel(genPeriod)} generated successfully.`)
      await fetchRecords()
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
          <h2 className="text-base font-bold" style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}>Generate SOA Report</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mid-gray)' }}>
            Select an HMO provider and month to generate a Statement of Account PDF.
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
          <button onClick={handleGenerate} disabled={generating || !genWallet || !genPeriod}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--teal)' }}>
            {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate SOA</>}
          </button>
        </div>

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
                <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--charcoal)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingRecords ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
                  <Loader2 size={16} className="animate-spin inline mr-2" />Loading…
                </td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-xs" style={{ color: 'var(--mid-gray)' }}>
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
    </div>
  )
}
