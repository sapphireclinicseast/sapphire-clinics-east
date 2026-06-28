'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, ArrowRight } from 'lucide-react'

// Fires at these local hours (24-h)
const TRIGGER_HOURS = [11, 16]

function todayKey(hour: number) {
  const d = new Date()
  return `waitlist_reminded_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}_${hour}`
}

export default function WaitlistReminder({ role }: { role: string }) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const shownHourRef = useRef<number | null>(null)

  const isFrontDesk = role === 'AHEA_FRONT_DESK' || role === 'AHGH_FRONT_DESK'

  useEffect(() => {
    if (!isFrontDesk) return

    function check() {
      const now   = new Date()
      const hour  = now.getHours()
      const min   = now.getMinutes()

      // Only trigger in the :00 minute of a target hour
      if (!TRIGGER_HOURS.includes(hour) || min !== 0) return

      // Already triggered for this slot today?
      if (shownHourRef.current === hour) return
      const key = todayKey(hour)
      if (typeof window !== 'undefined' && localStorage.getItem(key)) return

      // Show it
      shownHourRef.current = hour
      if (typeof window !== 'undefined') localStorage.setItem(key, '1')
      setVisible(true)
    }

    // Check immediately, then every 30 s
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [isFrontDesk])

  function goToWaitlist() {
    setVisible(false)
    router.push('/patient-relationship')
  }

  if (!visible) return null

  const hour = new Date().getHours()
  const label = hour < 12 ? '11:00 AM' : '4:00 PM'

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(19, 32, 50, 0.88)', backdropFilter: 'blur(10px)' }}
    >
      <div
        className="rounded-3xl p-10 max-w-md w-[92%] text-center shadow-2xl"
        style={{ background: '#fff' }}
      >
        {/* Icon */}
        <div
          className="relative w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ background: '#eff6ff' }}
        >
          <div
            className="absolute inset-0 rounded-2xl animate-ping opacity-20"
            style={{ background: '#2563EB' }}
          />
          <ClipboardList size={36} style={{ color: '#2563EB' }} />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold mb-3" style={{ color: '#1e293b' }}>
          Waitlist Check — {label}
        </h2>

        <p className="text-base mb-6" style={{ color: '#475569', lineHeight: 1.6 }}>
          Please open the <strong>Patient Relationship → Waitlist</strong> and contact any patients
          waiting for a decking slot.
        </p>

        {/* CTA — only way to dismiss */}
        <button
          onClick={goToWaitlist}
          className="flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white mx-auto transition-all hover:scale-105 hover:shadow-lg"
          style={{ background: '#2563EB' }}
        >
          <ArrowRight size={20} />
          Go to Waitlist
        </button>

        <p className="text-xs mt-5" style={{ color: '#94a3b8' }}>
          This reminder will not close until you go to the Waitlist.
        </p>
      </div>
    </div>
  )
}
