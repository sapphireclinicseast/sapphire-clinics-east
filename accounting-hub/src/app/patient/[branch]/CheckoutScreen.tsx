'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Loader2, X } from 'lucide-react'

/**
 * What the patient sees while the cashier is ringing up their sale.
 *
 * Read-only by design, with one exception: scanning their own VIP or Prepaid
 * card, which sends the code to the till so the cashier can apply it without
 * the card crossing the counter.
 */

export interface CheckoutLine { name: string; quantity: number; unitPrice: number; lineTotal: number }
export interface CheckoutPayment { method: string; label: string; amount: number }
export interface CheckoutPayload {
  patientName: string
  clinicianName: string
  items: CheckoutLine[]
  discountLabel: string
  subtotal: number
  discountAmount: number
  netAmount: number
  payments: CheckoutPayment[]
}

const peso = (n: number) =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Friendly names — a patient should not have to read PREPAID_CARD. */
const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash', GCASH: 'GCash', PAYMAYA: 'Maya', PAYMONGO: 'Card / e-wallet',
  DEBIT: 'Debit card', CREDIT_CARD: 'Credit card', VIP_CARD: 'VIP Card',
  PREPAID_CARD: 'Prepaid Card', REWARD_POINTS: 'Reward points',
  DOWNPAYMENT: 'Downpayment', PACKAGE: 'Session package', ADVANCE: 'Advance',
  HMO: 'HMO', GL: 'Guarantee Letter', SHOPEE: 'Shopee', LAZADA: 'Lazada', TIKTOK: 'TikTok',
}
const methodLabel = (p: CheckoutPayment) =>
  p.label || METHOD_LABELS[p.method] || p.method.replace(/_/g, ' ').toLowerCase()

export default function CheckoutScreen({ slug, data }: { slug: string; data: CheckoutPayload }) {
  const [scanning, setScanning] = useState(false)
  const paid = data.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const due = Math.max(0, (Number(data.netAmount) || 0) - paid)

  return (
    <div className="w-full max-w-3xl">
      <div className="rounded-3xl bg-white overflow-hidden" style={{ boxShadow: '0 14px 40px rgba(16,52,45,0.09)' }}>
        <div className="px-8 py-6" style={{ background: 'linear-gradient(135deg,#134e46,#0f766e)' }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.72)' }}>
            Your visit today
          </p>
          <h1 className="text-3xl font-bold text-white mt-1">{data.patientName || 'Welcome'}</h1>
          {data.clinicianName && (
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>with {data.clinicianName}</p>
          )}
        </div>

        <div className="px-8 py-6">
          {/* Services */}
          <div className="space-y-3">
            {data.items.length === 0 && (
              <p className="text-sm py-4 text-center" style={{ color: '#8aa39b' }}>
                Your cashier is preparing your bill…
              </p>
            )}
            {data.items.map((it, i) => (
              <div key={`${it.name}-${i}`} className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-base" style={{ color: '#1c3f38' }}>{it.name}</span>
                  {it.quantity > 1 && (
                    <span className="block text-xs mt-0.5" style={{ color: '#8aa39b' }}>
                      {it.quantity} × {peso(it.unitPrice)}
                    </span>
                  )}
                </span>
                <span className="text-base tabular-nums shrink-0" style={{ color: '#1c3f38' }}>{peso(it.lineTotal)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 pt-5 space-y-2" style={{ borderTop: '1px solid #e6efeb' }}>
            <Row label="Subtotal" value={peso(data.subtotal)} />
            {data.discountAmount > 0 && (
              <Row
                label={data.discountLabel ? `Discount — ${data.discountLabel}` : 'Discount'}
                value={`− ${peso(data.discountAmount)}`}
                tone="#15803d"
              />
            )}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #e6efeb' }}>
              <span className="text-lg font-bold" style={{ color: '#1c3f38' }}>Total</span>
              <span className="text-3xl font-extrabold tabular-nums" style={{ color: '#0f766e' }}>{peso(data.netAmount)}</span>
            </div>
          </div>

          {/* Payments — every form, so a split or a downpayment is visible */}
          {data.payments.length > 0 && (
            <div className="mt-6 rounded-2xl p-5" style={{ background: '#f4f8f6' }}>
              <p className="text-[11px] uppercase tracking-[0.16em] mb-3" style={{ color: '#6f8b83' }}>
                How this is being paid
              </p>
              <div className="space-y-2">
                {data.payments.map((p, i) => (
                  <Row key={`${p.method}-${i}`} label={methodLabel(p)} value={peso(p.amount)} />
                ))}
              </div>
              {due > 0.005 && (
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px dashed #cddcd6' }}>
                  <span className="text-sm font-semibold" style={{ color: '#b45309' }}>Still to pay</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: '#b45309' }}>{peso(due)}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setScanning(true)}
            className="mt-6 w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold text-white"
            style={{ background: '#6d5192' }}>
            <Camera size={18} /> Pay with my VIP or Prepaid Card
          </button>
          <p className="mt-2 text-center text-[11px]" style={{ color: '#9db4ad' }}>
            Hold the barcode on the back of your card up to the camera.
          </p>
        </div>
      </div>

      {scanning && <ScannerModal slug={slug} onClose={() => setScanning(false)} />}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: tone || '#5b7a72' }}>{label}</span>
      <span className="text-sm tabular-nums" style={{ color: tone || '#1c3f38' }}>{value}</span>
    </div>
  )
}

/* ── Card scanner ────────────────────────────────────────────────────────── */

type ScanState = 'starting' | 'scanning' | 'sent' | 'error'

/**
 * Uses the browser's own BarcodeDetector where it exists, which on a clinic
 * tablet (Android/Chrome) it does. Where it does not, the patient can still key
 * the code in — better than a dead button on the one device we cannot swap.
 */
export function ScannerModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<ScanState>('starting')
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState('')

  const send = useCallback(async (code: string) => {
    try {
      await fetch('/api/patient-view/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: slug, code }),
      })
      setState('sent')
      // Long enough to read the confirmation, short enough that the next
      // patient does not find it still open.
      setTimeout(onClose, 2200)
    } catch {
      setState('error')
      setMessage('We could not send that to the cashier. Please hand your card over instead.')
    }
  }, [slug, onClose])

  useEffect(() => {
    let cancelled = false
    let raf = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia || !w.BarcodeDetector) {
        setState('error')
        setMessage('This tablet cannot use the camera for scanning. Please type the code below instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        const detector = new w.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'codabar', 'itf'],
        })
        setState('scanning')

        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const found = await detector.detect(videoRef.current)
            const value = found?.[0]?.rawValue
            if (value) { await send(String(value)); return }
          } catch { /* a frame that will not decode is normal; keep going */ }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch {
        setState('error')
        setMessage('We could not open the camera. Please type the code below instead.')
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [send])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ background: 'rgba(12,32,28,0.72)' }}>
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #eaf1ee' }}>
          <p className="font-bold" style={{ color: '#1c3f38' }}>Scan your card</p>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} style={{ color: '#7d968e' }} /></button>
        </div>

        {state === 'sent' ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 size={52} style={{ color: '#15803d' }} className="mx-auto" />
            <p className="mt-4 text-lg font-semibold" style={{ color: '#1c3f38' }}>Sent to your cashier</p>
            <p className="mt-1 text-sm" style={{ color: '#5b7a72' }}>They will apply your card to this payment.</p>
          </div>
        ) : (
          <div className="px-6 py-5">
            <div className="relative rounded-2xl overflow-hidden" style={{ background: '#0c201c', aspectRatio: '4 / 3' }}>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {state === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 size={26} className="animate-spin text-white" />
                </div>
              )}
              {state === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-xl" style={{ width: '72%', height: '38%', border: '3px solid rgba(255,255,255,0.85)' }} />
                </div>
              )}
            </div>

            {message && <p className="mt-3 text-sm text-center" style={{ color: '#b45309' }}>{message}</p>}

            <div className="mt-4">
              <p className="text-xs mb-1" style={{ color: '#7d968e' }}>Or type the code on your card</p>
              <div className="flex gap-2">
                <input
                  value={manual}
                  onChange={e => setManual(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && manual.trim().length >= 4) send(manual.trim()) }}
                  placeholder="Card code"
                  className="flex-1 px-4 py-3 rounded-xl border text-center tracking-widest outline-none"
                  style={{ borderColor: '#e2ece8', color: '#1c3f38' }} />
                <button
                  onClick={() => send(manual.trim())}
                  disabled={manual.trim().length < 4}
                  className="px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: '#6d5192' }}>
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
