'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Script from 'next/script'
import { ClipboardCheck, QrCode, X, Bell } from 'lucide-react'

interface PromptData {
  scheduleId: string
  staffId: string
  staffName: string
  department: string
  patientId: string
  patientName: string
  patientAge: number | null
  startTime: string
  endTime: string
  sessionType: string
  promptType: 'pre_session' | 'end_session'
}

export default function SurveyPrompt({ role }: { role: string }) {
  const [prompt, setPrompt] = useState<PromptData | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [surveyType, setSurveyType] = useState('')
  const [assigned, setAssigned] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const dismissedRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isFrontDesk = role === 'AHEA_FRONT_DESK' || role === 'AHGH_FRONT_DESK'

  // ── Check for upcoming survey prompts ──────────────────────────────────
  const checkUpcoming = useCallback(async () => {
    if (!isFrontDesk) return

    try {
      const res = await fetch('/api/customer-survey/upcoming')
      if (!res.ok) return
      const data = await res.json()

      if (data.prompts?.length > 0) {
        const p = data.prompts[0] as PromptData
        const key = `${p.scheduleId}-${p.promptType}`

        // Check if this prompt was recently dismissed
        const dismissedAt = dismissedRef.current.get(key)
        if (dismissedAt) {
          const elapsed = Date.now() - dismissedAt
          // Re-show after 5 minutes if dismissed
          if (elapsed < 5 * 60 * 1000) return
          // Remove from dismissed so it can show again
          dismissedRef.current.delete(key)
        }

        setPrompt(p)
        setShowModal(true)
        setAssigned(false)
        setQrUrl('')
        setSurveyType('')
      }
    } catch {
      // Silently fail — don't interrupt the user's workflow
    }
  }, [isFrontDesk])

  useEffect(() => {
    if (!isFrontDesk) return

    // Initial check after 10 seconds
    const timeout = setTimeout(checkUpcoming, 10_000)

    // Then check every 60 seconds
    intervalRef.current = setInterval(checkUpcoming, 60_000)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isFrontDesk, checkUpcoming])

  // ── Create assignment and show QR ──────────────────────────────────────
  const handleAssign = async () => {
    if (!prompt) return

    try {
      const res = await fetch('/api/customer-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: prompt.staffId,
          patientId: prompt.patientId,
          patientName: prompt.patientName,
          patientAge: prompt.patientAge,
          branch: role === 'AHGH_FRONT_DESK' ? 'SBGH' : 'SBEA',
          sessionType: prompt.sessionType?.toLowerCase().includes('group') ? 'group' : 'individual',
          scheduleId: prompt.scheduleId,
        }),
      })

      if (!res.ok) throw new Error('Failed')
      const result = await res.json()

      const url = `https://survey.sapphireclinicseast.org?id=${result.assignmentId}`
      setQrUrl(url)
      setSurveyType(result.surveyType)
      setAssigned(true)

      // Render QR code
      setTimeout(() => {
        if (qrRef.current) {
          qrRef.current.innerHTML = ''
          // @ts-expect-error - QRCode CDN
          if (typeof window !== 'undefined' && window.QRCode) {
            // @ts-expect-error - QRCode CDN
            new window.QRCode(qrRef.current, { text: url, width: 240, height: 240, colorDark: '#0f766e', colorLight: '#ffffff' })
          } else {
            qrRef.current.innerHTML = `<p style="font-size:14px;word-break:break-all;color:#0f766e">${url}</p>`
          }
        }
      }, 100)
    } catch {
      alert('Failed to create survey assignment. Please try again.')
    }
  }

  // ── Dismiss handler ────────────────────────────────────────────────────
  const handleDismiss = () => {
    if (prompt) {
      const key = `${prompt.scheduleId}-${prompt.promptType}`
      dismissedRef.current.set(key, Date.now())
    }
    setShowModal(false)
    setPrompt(null)
    setAssigned(false)
  }

  if (!showModal || !prompt) return null

  const isEndSession = prompt.promptType === 'end_session'

  return (
    <>
      {/* Load QRCode library */}
      <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="lazyOnload" />

      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: 'rgba(4, 47, 46, 0.90)', backdropFilter: 'blur(12px)' }}>

        <div className="rounded-3xl p-10 max-w-xl w-[95%] text-center shadow-2xl animate-in fade-in zoom-in-95"
          style={{ background: '#fff' }}>

          {/* Pulsing bell icon for urgency */}
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: isEndSession ? '#fef2f2' : '#f0fdfa' }}>
            <div className="absolute inset-0 rounded-2xl animate-ping opacity-20"
              style={{ background: isEndSession ? '#ef4444' : '#0f766e' }} />
            {isEndSession
              ? <Bell size={36} style={{ color: '#ef4444' }} />
              : <ClipboardCheck size={36} style={{ color: '#0f766e' }} />
            }
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#1e293b' }}>
            {isEndSession ? '⚠️ Survey Reminder' : '📋 Patient Survey Time'}
          </h2>

          <p className="text-base mb-2" style={{ color: '#475569' }}>
            {isEndSession
              ? 'Session is about to end — please have the patient complete the survey now.'
              : 'A patient\'s session is coming up. Please prepare the tablet for their satisfaction survey.'
            }
          </p>

          {/* Patient & therapist info */}
          <div className="rounded-xl p-4 mb-6 text-left" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Patient</span>
                <p className="font-bold" style={{ color: '#1e293b' }}>{prompt.patientName}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Therapist</span>
                <p className="font-bold" style={{ color: '#1e293b' }}>{prompt.staffName}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Department</span>
                <p className="font-semibold" style={{ color: '#0f766e' }}>{prompt.department}</p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase" style={{ color: '#94a3b8' }}>Session Time</span>
                <p className="font-semibold" style={{ color: '#475569' }}>{prompt.startTime} – {prompt.endTime}</p>
              </div>
            </div>
          </div>

          {/* QR code area — shown after assignment */}
          {assigned && qrUrl ? (
            <div className="mb-6">
              <p className="text-sm font-semibold mb-1" style={{ color: '#0f766e' }}>
                {surveyType} Survey — Scan QR Code
              </p>
              <div ref={qrRef}
                className="w-[260px] h-[260px] mx-auto mb-3 p-2.5 rounded-xl flex items-center justify-center"
                style={{ border: '3px solid #0f766e' }} />
              <p className="text-xs break-all" style={{ color: '#94a3b8' }}>{qrUrl}</p>
            </div>
          ) : (
            /* Generate button */
            <button
              onClick={handleAssign}
              className="flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white mx-auto mb-6 transition-all hover:scale-105 hover:shadow-lg"
              style={{ background: '#0f766e' }}
            >
              <QrCode size={22} />
              Generate Survey QR Code
            </button>
          )}

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium mx-auto transition-all hover:bg-slate-200"
            style={{ background: '#f1f5f9', color: '#64748b' }}
          >
            <X size={16} />
            {assigned ? 'Done' : 'Remind me in 5 minutes'}
          </button>

          {!assigned && (
            <p className="text-xs mt-3" style={{ color: '#cbd5e1' }}>
              This reminder will reappear in 5 minutes if you don&apos;t generate the survey.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
