'use client'

/**
 * Taxes → Service Invoice → BIR 2307: the payor e-signature stamped on the
 * signatory line, per branch. Upload (admin only) cleans the picture in the
 * browser — paper background made transparent, margins trimmed, re-encoded as
 * PNG — shows it on a replica of the form's signatory box, and can generate a
 * sample 2307 with it before saving.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Upload, Trash2, Eye, X, PenLine, AlertTriangle } from 'lucide-react'
import { generateBir2307Pdf, SIG_BOX } from '@/lib/bir2307-pdf'

export interface SignatureStatus { source: 'uploaded' | 'default' | 'none'; updatedAt: string | null }
export interface SignatoryInfo {
  signatoryName: string; signatoryTitle: string
  payorName: string; payorTin: string; payorAddress: string; payorZip: string
}

export const SIG_BRANCHES = [
  { value: 'SBEA', label: 'East Branch' },
  { value: 'SBGH', label: 'Greenhills Branch' },
  { value: 'VERDANA', label: 'Verdana Store' },
]

const fmtWhen = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

/** Signature status for all branches + whether this user may change it. */
export function useSignatureStatus() {
  const [signatures, setSignatures] = useState<Record<string, SignatureStatus>>({})
  const [canManage, setCanManage] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(() => fetch('/api/payroll/bir-2307/signature?status=1', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (d) { setSignatures(d.signatures || {}); setCanManage(!!d.canManage) }
      setLoaded(true)
    })
    .catch(() => setLoaded(true)), [])
  const refresh = useCallback(() => { void load() }, [load])
  useEffect(() => { load() }, [load])
  return { signatures, canManage, loaded, refresh }
}

export const signatureSrc = (branch: string, status?: SignatureStatus) =>
  `/api/payroll/bir-2307/signature?branch=${encodeURIComponent(branch)}&v=${encodeURIComponent(status?.updatedAt || status?.source || '')}`

/**
 * The form's signatory box, drawn to scale in PDF points (same coordinates as
 * lib/bir2307-pdf.ts), with the signature fitted exactly as the PDF fits it.
 */
export function SignatureLineMock({ src, name, title }: { src: string | null; name: string; title: string }) {
  const box = { x: SIG_BOX.centerX - SIG_BOX.maxW / 2, y: SIG_BOX.bottomTopY - SIG_BOX.maxH }
  return (
    <svg viewBox="160 694 292 78" className="w-full h-auto rounded-lg border" style={{ borderColor: 'var(--light-gray)', background: '#fff' }}
      role="img" aria-label="Signature on the BIR 2307 signatory line">
      <rect x={160} y={694} width={292} height={28} fill="#ececec" />
      <text x={306} y={704} fontSize={5.2} textAnchor="middle" fill="#666" fontFamily="Helvetica, Arial, sans-serif">
        …and regulations issued under authority thereof. Further, we give our consent to
      </text>
      <text x={306} y={712} fontSize={5.2} textAnchor="middle" fill="#666" fontFamily="Helvetica, Arial, sans-serif">
        the processing of our information under the Data Privacy Act of 2012 (R.A. No. 10173).
      </text>
      <rect x={160} y={722} width={292} height={28} fill="#fff" stroke="#444" strokeWidth={0.6} />
      {src && <image href={src} x={box.x} y={box.y} width={SIG_BOX.maxW} height={SIG_BOX.maxH} preserveAspectRatio="xMidYMax meet" />}
      <text x={306} y={739.5} fontSize={9} fontWeight={700} textAnchor="middle" fill="#000" fontFamily="Helvetica, Arial, sans-serif">
        {(name || '').toUpperCase()}
      </text>
      <text x={306} y={747.5} fontSize={6.5} textAnchor="middle" fill="#000" fontFamily="Helvetica, Arial, sans-serif">{title}</text>
      <rect x={160} y={750} width={292} height={22} fill="#e2e2e2" stroke="#444" strokeWidth={0.6} />
      <text x={306} y={758.5} fontSize={5.6} textAnchor="middle" fill="#222" fontFamily="Helvetica, Arial, sans-serif">
        Signature over Printed Name of Payor/Payor&apos;s Authorized Representative/Tax Agent
      </text>
      <text x={306} y={766.5} fontSize={5.2} textAnchor="middle" fill="#222" fontFamily="Helvetica, Arial, sans-serif">
        (Indicate Title/Designation and TIN)
      </text>
    </svg>
  )
}

// ── Image clean-up (browser) ──────────────────────────────────────────────

const MAX_UPLOAD = 1_800_000

/**
 * Turn a photo/scan of a signature into a transparent, trimmed PNG.
 * The paper tone is read from the picture itself (75th-percentile brightness),
 * so grey phone photos clean up as well as white scans. Images that already
 * carry transparency are kept as they are (only trimmed).
 */
export async function prepareSignaturePng(file: File, removeBackground: boolean):
  Promise<{ blob: Blob; width: number; height: number; cleaned: boolean }> {
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(file) } catch {
    throw new Error('This image could not be read. Use a PNG or JPG picture of the signature.')
  }
  let maxSide = 1600
  for (;;) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('This browser cannot process images.')
    ctx.drawImage(bmp, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    const d = img.data
    const n = w * h
    let see = 0
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) see++
    const hasAlpha = see > n * 0.01
    const cleaned = removeBackground && !hasAlpha
    if (cleaned) {
      // Paper brightness varies across a phone photo (shadows, lamp falloff), so
      // estimate it locally: the 95th-percentile brightness of each block, taken
      // as the max over neighbouring blocks (so ink-heavy blocks still read as
      // paper), interpolated per pixel. Each pixel's opacity then comes from how
      // much darker it is than the paper around it.
      const L = new Float32Array(n)
      for (let p = 0, i = 0; p < n; p++, i += 4) L[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
      const B = 40
      const gw = Math.ceil(w / B), gh = Math.ceil(h / B)
      const block = new Float32Array(gw * gh)
      const hist = new Uint32Array(256)
      for (let by = 0; by < gh; by++) {
        for (let bx = 0; bx < gw; bx++) {
          hist.fill(0)
          let cnt = 0
          for (let y = by * B; y < Math.min(h, (by + 1) * B); y++) {
            for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x++) { hist[Math.min(255, L[y * w + x] | 0)]++; cnt++ }
          }
          let acc = 0, v = 255
          for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= cnt * 0.95) { v = k; break } }
          block[by * gw + bx] = v
        }
      }
      const paper = new Float32Array(gw * gh)
      for (let by = 0; by < gh; by++) {
        for (let bx = 0; bx < gw; bx++) {
          let m = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const yy = by + dy, xx = bx + dx
            if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) m = Math.max(m, block[yy * gw + xx])
          }
          paper[by * gw + bx] = Math.max(m, 1)
        }
      }
      const at = (gx: number, gy: number) => paper[Math.min(gh - 1, Math.max(0, gy)) * gw + Math.min(gw - 1, Math.max(0, gx))]
      for (let y = 0; y < h; y++) {
        const fy = (y + 0.5) / B - 0.5, gy = Math.floor(fy), ty = fy - gy
        for (let x = 0; x < w; x++) {
          const fx = (x + 0.5) / B - 0.5, gx = Math.floor(fx), tx = fx - gx
          const bg = (at(gx, gy) * (1 - tx) + at(gx + 1, gy) * tx) * (1 - ty) + (at(gx, gy + 1) * (1 - tx) + at(gx + 1, gy + 1) * tx) * ty
          const r = L[y * w + x] / bg
          const a = r >= 0.88 ? 0 : r <= 0.55 ? 255 : Math.round(255 * (0.88 - r) / 0.33)
          const i = (y * w + x) * 4 + 3
          d[i] = Math.min(d[i], a)
        }
      }
      ctx.putImageData(img, 0, 0)
    }
    // Trim to the ink.
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 24) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) throw new Error('No signature was found in this picture — it looks blank after removing the background.')
    const pad = 6
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad)
    const cw = maxX - minX + 1, ch = maxY - minY + 1
    const out = document.createElement('canvas')
    out.width = cw; out.height = ch
    out.getContext('2d')!.putImageData(ctx.getImageData(minX, minY, cw, ch), 0, 0)
    const blob = await new Promise<Blob | null>(res => out.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Could not encode the signature image.')
    if (blob.size <= MAX_UPLOAD || maxSide <= 400) {
      bmp.close?.()
      return { blob, width: cw, height: ch, cleaned }
    }
    maxSide = Math.round(maxSide * 0.7)
  }
}

// ── Sample certificate preview ─────────────────────────────────────────────

async function sampleCertificate(branch: string, info: SignatoryInfo, signaturePng?: ArrayBuffer | null) {
  const today = new Date()
  const y = today.getFullYear()
  const q = Math.floor(today.getMonth() / 3)
  const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`
  const last = new Date(y, q * 3 + 3, 0)
  const to = `${y}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  const bytes = await generateBir2307Pdf({
    payee: { name: 'SAMPLE PAYEE — PREVIEW ONLY', tin: '', address: '', zip: '' },
    payor: { name: info.payorName, tin: info.payorTin, address: info.payorAddress, zip: info.payorZip },
    fromDate: from, toDate: to,
    rows: [{ desc: 'Professional Fees', atc: 'WI010', m1: 0, m2: 0, m3: 0, total: 0, tax: 0 }],
    signatory: { name: info.signatoryName, title: info.signatoryTitle },
    signatureBranch: branch,
    ...(signaturePng !== undefined ? { signaturePng } : {}),
  })
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
}

function PdfPreview({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl h-[90vh] flex flex-col shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Sample BIR 2307 — check the signatory line near the bottom</p>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold" style={{ color: 'var(--teal)' }}>Open full size</a>
            <button onClick={onClose} className="p-1 rounded-lg" aria-label="Close"><X size={16} /></button>
          </div>
        </div>
        <iframe src={url} title="Sample BIR 2307" className="flex-1 w-full" />
      </div>
    </div>
  )
}

// ── Upload dialog ──────────────────────────────────────────────────────────

function SignatureUploadDialog({ branch, settings, onClose, onSaved }: {
  branch: string
  settings: Record<string, SignatoryInfo>
  onClose: () => void
  onSaved: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [clean, setClean] = useState(true)
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string; width: number; height: number; cleaned: boolean } | null>(null)
  const [targets, setTargets] = useState<string[]>(SIG_BRANCHES.map(b => b.value))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const info = settings[branch]

  useEffect(() => {
    if (!file) return
    let cancelled = false
    let url = ''
    prepareSignaturePng(file, clean)
      .then(p => {
        if (cancelled) return
        url = URL.createObjectURL(p.blob)
        setPrepared({ ...p, url }); setError('')
      })
      .catch(e => { if (!cancelled) { setPrepared(null); setError(e instanceof Error ? e.message : 'Could not read the image') } })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [file, clean])

  const showSample = async () => {
    if (!prepared || !info) return
    setBusy(true); setError('')
    try { setPreview(await sampleCertificate(branch, info, await prepared.blob.arrayBuffer())) }
    catch (e) { setError(`Preview failed: ${e instanceof Error ? e.message : ''}`) }
    setBusy(false)
  }

  const save = async () => {
    if (!prepared || !targets.length) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', new File([prepared.blob], 'signature.png', { type: 'image/png' }))
      fd.append('branches', targets.join(','))
      const r = await fetch('/api/payroll/bir-2307/signature', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Failed to save the signature'); setBusy(false); return }
      onSaved()
    } catch { setError('Failed to save the signature'); setBusy(false) }
  }

  const toggleTarget = (b: string) => setTargets(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--light-gray)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Upload e-signature</h2>
            <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
              Stamped on the payor signatory line of every BIR 2307 generated for the branches you tick.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = '' }} />
            <button onClick={() => inputRef.current?.click()} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Upload size={15} /> {file ? `Chosen: ${file.name} — choose another` : 'Choose a picture of the signature (PNG or JPG)'}
            </button>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mid-gray)' }}>
              Best: dark ink on plain white paper, photographed straight on, or a PNG with a transparent background.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--charcoal)' }}>
            <input type="checkbox" checked={clean} onChange={e => setClean(e.target.checked)} />
            Remove the paper background (make it transparent)
          </label>

          {prepared && (
            <div className="space-y-2">
              <p className="text-xs font-bold" style={{ color: 'var(--charcoal)' }}>Cleaned image</p>
              <div className="rounded-lg border p-3 flex items-center justify-center"
                style={{
                  borderColor: 'var(--light-gray)',
                  backgroundImage: 'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)',
                  backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={prepared.url} alt="Cleaned signature" className="max-h-28 max-w-full" />
              </div>
              <p className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>
                {prepared.width}×{prepared.height}px{prepared.cleaned ? ' · background removed' : ' · kept as uploaded'} — the checkered squares show what is transparent.
              </p>
              <p className="text-xs font-bold pt-1" style={{ color: 'var(--charcoal)' }}>On the certificate</p>
              <SignatureLineMock src={prepared.url} name={info?.signatoryName || ''} title={info?.signatoryTitle || ''} />
            </div>
          )}

          <div>
            <p className="text-xs font-bold mb-1" style={{ color: 'var(--charcoal)' }}>Use for</p>
            <div className="flex flex-wrap gap-3">
              {SIG_BRANCHES.map(b => (
                <label key={b.value} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--charcoal)' }}>
                  <input type="checkbox" checked={targets.includes(b.value)} onChange={() => toggleTarget(b.value)} /> {b.label}
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm flex items-center gap-1.5" style={{ color: '#b91c1c' }}><AlertTriangle size={14} /> {error}</p>}

          <div className="flex gap-2">
            <button onClick={showSample} disabled={!prepared || busy || !info}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-40"
              style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Eye size={14} /> Preview on a 2307
            </button>
            <button onClick={save} disabled={!prepared || busy || !targets.length}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--teal)' }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} Save signature
            </button>
          </div>
        </div>
      </div>
      {preview && <PdfPreview url={preview} onClose={() => { URL.revokeObjectURL(preview); setPreview(null) }} />}
    </div>
  )
}

// ── Per-branch panel (Settings) and compact strip (Generator) ─────────────

function useSamplePreview() {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async (branch: string, info: SignatoryInfo | undefined, signaturePng?: ArrayBuffer | null) => {
    if (!info) return
    setBusy(true)
    try { setUrl(await sampleCertificate(branch, info, signaturePng)) }
    catch (e) { alert(`Preview failed: ${e instanceof Error ? e.message : ''}`) }
    setBusy(false)
  }
  const close = () => { if (url) URL.revokeObjectURL(url); setUrl(null) }
  return { url, busy, open, close }
}

const sourceText = (s?: SignatureStatus) =>
  !s ? '' : s.source === 'uploaded' ? `Uploaded ${fmtWhen(s.updatedAt)}` : s.source === 'default' ? 'Carried over from the HR hub' : 'No e-signature on file'

/** Settings: the branch's signature on a replica of the signatory line, with upload / remove / preview. */
export function SignaturePanel({ branch, info, status, canManage, settings, onChanged }: {
  branch: string
  info: SignatoryInfo | undefined
  status: SignatureStatus | undefined
  canManage: boolean
  settings: Record<string, SignatoryInfo>
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const sample = useSamplePreview()
  const has = status && status.source !== 'none'

  const remove = async () => {
    if (!confirm('Remove the uploaded e-signature for this branch? 2307s will go back to the signature carried over from the HR hub.')) return
    setRemoving(true)
    try {
      const r = await fetch(`/api/payroll/bir-2307/signature?branches=${branch}`, { method: 'DELETE' })
      if (!r.ok) alert((await r.json().catch(() => ({}))).error || 'Failed to remove the signature')
      onChanged()
    } catch { alert('Failed to remove the signature') }
    setRemoving(false)
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--mid-gray)' }}>
          E-signature on the 2307
        </label>
        <span className="text-[11px]" style={{ color: status?.source === 'uploaded' ? '#166534' : 'var(--mid-gray)' }}>{sourceText(status)}</span>
      </div>
      <div className="max-w-md">
        <SignatureLineMock src={has ? signatureSrc(branch, status) : null} name={info?.signatoryName || ''} title={info?.signatoryTitle || ''} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {canManage && (
          <button onClick={() => setUploading(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
            <Upload size={13} /> {status?.source === 'uploaded' ? 'Replace e-signature' : 'Upload e-signature'}
          </button>
        )}
        {canManage && status?.source === 'uploaded' && (
          <button onClick={remove} disabled={removing} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-50"
            style={{ borderColor: 'var(--light-gray)', color: '#b91c1c' }}>
            {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove upload
          </button>
        )}
        <button onClick={() => sample.open(branch, info)} disabled={sample.busy || !info}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}>
          {sample.busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Preview on a 2307
        </button>
        {!canManage && <span className="text-[11px]" style={{ color: 'var(--mid-gray)' }}>Only an admin can change the e-signature.</span>}
      </div>
      {uploading && (
        <SignatureUploadDialog branch={branch} settings={settings}
          onClose={() => setUploading(false)} onSaved={() => { setUploading(false); onChanged() }} />
      )}
      {sample.url && <PdfPreview url={sample.url} onClose={sample.close} />}
    </div>
  )
}

/** Generator: the payor branch's signature, a stamp on/off switch and a shortcut to change it. */
export function SignatureStrip({ branch, info, status, canManage, settings, stamp, onStamp, onChanged }: {
  branch: string
  info: SignatoryInfo | undefined
  status: SignatureStatus | undefined
  canManage: boolean
  settings: Record<string, SignatoryInfo>
  stamp: boolean
  onStamp: (v: boolean) => void
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const has = status && status.source !== 'none'
  return (
    <div className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center gap-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
      <div className="w-full md:w-72 shrink-0">
        <SignatureLineMock src={has && stamp ? signatureSrc(branch, status) : null} name={info?.signatoryName || ''} title={info?.signatoryTitle || ''} />
      </div>
      <div className="space-y-1.5 text-xs" style={{ color: 'var(--charcoal)' }}>
        <p className="font-bold">Payor e-signature</p>
        <p style={{ color: status?.source === 'uploaded' ? '#166534' : 'var(--mid-gray)' }}>{sourceText(status)}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={stamp} onChange={e => onStamp(e.target.checked)} disabled={!has} />
          Stamp the e-signature on this certificate
        </label>
        {canManage && (
          <button onClick={() => setUploading(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-white"
            style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
            <Upload size={13} /> {status?.source === 'uploaded' ? 'Replace e-signature' : 'Upload e-signature'}
          </button>
        )}
      </div>
      {uploading && (
        <SignatureUploadDialog branch={branch} settings={settings}
          onClose={() => setUploading(false)} onSaved={() => { setUploading(false); onChanged() }} />
      )}
    </div>
  )
}
