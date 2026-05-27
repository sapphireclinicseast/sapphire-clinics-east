'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

// ─── Department colours (TV dark theme) ──────────────────────────────────────
const DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  OT:         { bg: '#0D9488', text: '#fff' },
  PT:         { bg: '#2563EB', text: '#fff' },
  SLP:        { bg: '#7C3AED', text: '#fff' },
  SPED:       { bg: '#D97706', text: '#fff' },
  MD:         { bg: '#DC2626', text: '#fff' },
  PSYCHOLOGY: { bg: '#0891B2', text: '#fff' },
  ORTHOSIS:   { bg: '#059669', text: '#fff' },
  FRONT_DESK: { bg: '#6366F1', text: '#fff' },
}

// Medal colours for leaderboard (brand-tuned: Sun, neutral, Clay)
const MEDAL_COLORS = ['#EDD8A8', '#94A3B8', '#C68077'] // 1st (sand), 2nd (neutral), 3rd (coral)

// ─── Sapphire Clinics palette (2026.05 — Aura Academy refresh) ──────────────
const BRAND = {
  narra:      '#194850', // primary — deep teal
  narraDeep:  '#0F3138', // deeper teal (footer / cards)
  moss:       '#3E6B66', // secondary — mid-teal
  sage:       '#7B988A', // tertiary — soft sage
  clay:       '#C68077', // warm accent — coral / dusty rose
  sun:        '#EDD8A8', // light accent — warm sand
  paper:      '#F4ECDD', // dominant neutral surface (cream)
  ink:        '#1A1A1A', // type / fine rules on light
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string
  startTime: string
  endTime: string
  sessionType: string
  status: string
  department: string
  branch: string
  therapist: string
  initials: string
}

interface Ad {
  id: string
  fileName: string
  filePath: string
  mimeType: string
  order: number
}

interface LeaderboardEntry {
  id: string; name: string; dept: string; branch: string
  avgRating: number; sessions: number; score: number
}

interface LeaderboardData {
  year: number
  byDept: Record<string, LeaderboardEntry[]>
  departments: string[]
  overall?: { rank: number; score: number; members: { id: string; name: string; dept: string; branch: string; avgRating: number; sessions: number; score: number }[] }[]
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

function formatHour(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:00 ${suffix}`
}

// ─── TV Queue Display ─────────────────────────────────────────────────────────
export default function QueueDisplay({ branch, clinicName }: { branch: string; clinicName: string }) {
  const [items, setItems]     = useState<QueueItem[]>([])
  const [ads, setAds]         = useState<Ad[]>([])
  const [adIdx, setAdIdx]     = useState(0)
  const [fadingOut, setFadingOut] = useState(false)
  const [clock, setClock]     = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [lastRefresh, setLastRefresh] = useState('')
  const [currentHour, setCurrentHour] = useState(0)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuePanelRef = useRef<HTMLDivElement>(null)
  const hourRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [lbEnabled, setLbEnabled] = useState(false) // controlled by Ads Manager toggle
  const [lbDeptIdx, setLbDeptIdx] = useState(0)
  // showLeaderboard = true means the ads panel is currently showing the leaderboard slide
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  // Complaint form QR state
  const [cfEnabled, setCfEnabled] = useState(false)
  const [showComplaintQR, setShowComplaintQR] = useState(false)

  const COMPLAINT_FORM_URL = 'https://hr.sapphireclinicseast.org/patient-complaint-form.html'
  // QR colour matches brand Narra so the code reads as "official"
  const complaintQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(COMPLAINT_FORM_URL)}&color=194850&bgcolor=FFFFFF&margin=8`

  // ── Live clock (updates every second) ──────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date()
      setClock(now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setDateLabel(now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }))
      const h = parseInt(now.toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }), 10)
      setCurrentHour(h)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Auto-scroll to current hour ────────────────────────────────────────────
  useEffect(() => {
    if (currentHour === 0) return
    const el = hourRefs.current[currentHour]
    if (el && queuePanelRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [currentHour, items]) // re-scroll when items update or hour changes

  // ── Fetch queue data ────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      const res = await fetch(`/api/queue?branch=${branch}&date=${today}&status=CONFIRMED`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
        setLastRefresh(new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }))
      }
    } catch { /* silent — TV should never crash */ }
  }, [branch])

  // ── Fetch leaderboard setting + data ───────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    try {
      // Check settings in Ads Manager
      const settingsRes = await fetch('/api/queue-ads/settings')
      if (settingsRes.ok) {
        const settings = await settingsRes.json()
        setLbEnabled(settings.showLeaderboard ?? false)
        setCfEnabled(settings.showComplaintForm ?? false)
        if (!settings.showLeaderboard) {
          setLeaderboard(null)
          setShowLeaderboard(false)
        }
        if (!settings.showLeaderboard) return
      }
      const res = await fetch(`/api/queue/leaderboard?branch=${branch}`)
      if (res.ok) setLeaderboard(await res.json())
    } catch { /* silent */ }
  }, [branch])

  // ── Advance to next ad/leaderboard/complaint-QR with fade ────────────────
  const advanceAd = useCallback((currentLength: number) => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    setFadingOut(true)
    fadeTimer.current = setTimeout(() => {
      if (showComplaintQR) {
        // Was showing complaint QR → back to ads
        setShowComplaintQR(false)
        setAdIdx(0)
      } else if (showLeaderboard) {
        // Was showing leaderboard → check if complaint QR should follow
        setShowLeaderboard(false)
        if (cfEnabled) {
          setShowComplaintQR(true)
        } else {
          setAdIdx(prev => (prev + 1) % Math.max(1, currentLength))
        }
      } else {
        const nextIdx = (adIdx + 1) % Math.max(1, currentLength)
        const cycleEnd = nextIdx === 0 || currentLength <= 1
        if (cycleEnd && lbEnabled && leaderboard && (((leaderboard.overall?.length ?? 0) > 0) || leaderboard.departments.length > 0)) {
          setShowLeaderboard(true)
          setLbDeptIdx(prev => (prev + 1) % Math.max(((leaderboard?.overall?.length ?? 0) > 0 ? 1 : 0) + (leaderboard?.departments?.length ?? 0), 1))
        } else if (cycleEnd && cfEnabled) {
          setShowComplaintQR(true)
        } else {
          setAdIdx(nextIdx)
        }
      }
      setFadingOut(false)
    }, 500)
  }, [showComplaintQR, showLeaderboard, adIdx, leaderboard, lbEnabled, cfEnabled])

  // ── Fetch ads (branch-filtered) ──────────────────────────────────────────────
  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch(`/api/queue-ads?branch=${branch}`)
      if (res.ok) setAds(await res.json())
    } catch { /* silent */ }
  }, [branch])

  useEffect(() => {
    fetchQueue()
    fetchAds()
    fetchLeaderboard()
    const queueInterval = setInterval(fetchQueue, 30_000)
    const adsInterval   = setInterval(fetchAds,  120_000)
    const lbInterval    = setInterval(fetchLeaderboard, 300_000) // refresh leaderboard every 5 min
    return () => { clearInterval(queueInterval); clearInterval(adsInterval); clearInterval(lbInterval) }
  }, [fetchQueue, fetchAds, fetchLeaderboard])

  // ── Reload video src when ad changes ─────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && !showLeaderboard) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [adIdx, showLeaderboard])

  // ── Reset adIdx if ads list shrinks ──────────────────────────────────────
  useEffect(() => {
    if (ads.length > 0 && adIdx >= ads.length) setAdIdx(0)
  }, [ads.length, adIdx])

  // ── Image ads & leaderboard & complaint QR: auto-advance timer ────────────
  const currentAd = ads[adIdx]
  const isImage = currentAd?.mimeType.startsWith('image/')
  useEffect(() => {
    if (showLeaderboard) {
      const id = setTimeout(() => advanceAd(ads.length), 15_000)
      return () => clearTimeout(id)
    }
    if (showComplaintQR) {
      const id = setTimeout(() => advanceAd(ads.length), 20_000)
      return () => clearTimeout(id)
    }
    if (!isImage || ads.length === 0) return
    const id = setTimeout(() => advanceAd(ads.length), 12_000)
    return () => clearTimeout(id)
  }, [adIdx, isImage, ads.length, advanceAd, showLeaderboard, showComplaintQR])

  // ── Group items by hour ─────────────────────────────────────────────────────
  const byHour: Record<number, QueueItem[]> = {}
  for (const item of items) {
    const h = parseInt(item.startTime.split(':')[0], 10)
    ;(byHour[h] ??= []).push(item)
  }
  const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b)

  // Current leaderboard department to show
  // Leaderboard cycle: Overall (first) + each department
  const lbSlides: { label: string; entries: { rank: number; score: number; members: { id: string; name: string; dept: string; branch: string; avgRating: number; sessions: number; score: number }[] }[] }[] = []
  if (leaderboard?.overall && leaderboard.overall.length > 0) {
    lbSlides.push({ label: 'Overall', entries: leaderboard.overall })
  }
  if (leaderboard?.departments) {
    for (const d of leaderboard.departments) {
      lbSlides.push({ label: d, entries: leaderboard.byDept[d] ?? [] })
    }
  }
  const currentSlide = lbSlides[lbDeptIdx % Math.max(lbSlides.length, 1)]
  const lbDept = currentSlide?.label ?? ''
  const lbEntries = currentSlide?.entries ?? []

  // Total slides count for dots (ads + leaderboard slides + complaint form)
  const totalSlides = ads.length + (lbEnabled ? lbSlides.length : 0) + (cfEnabled ? 1 : 0)

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      // Aura backdrop — deep teal grounded but with soft coral / sand glows
      // in opposite corners so the TV display has the same warm tints as the
      // rest of the brand surfaces (seminars, teletherapy, client portal).
      background: [
        'radial-gradient(900px 540px at 92% 92%, rgba(198,128,119,0.22), transparent 60%)',
        'radial-gradient(1100px 620px at 8% 6%, rgba(237,216,168,0.14), transparent 60%)',
        `linear-gradient(135deg, ${BRAND.narraDeep} 0%, ${BRAND.narra} 60%, ${BRAND.moss} 100%)`,
      ].join(', '),
      display: 'flex', flexDirection: 'column',
      // Manrope is the body/data face; Montserrat takes over for headings via inline fontFamily.
      fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, -apple-system, sans-serif',
      color: BRAND.paper,
    }}>
      {/* ── Header — Aura masthead (deep teal with coral lift + sand glow) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 2rem',
        background: [
          'radial-gradient(700px 240px at 50% 50%, rgba(237,216,168,0.16), transparent 65%)',
          'radial-gradient(500px 200px at 100% 100%, rgba(198,128,119,0.32), transparent 65%)',
          `linear-gradient(90deg, ${BRAND.narraDeep} 0%, ${BRAND.narra} 55%, ${BRAND.moss} 100%)`,
        ].join(', '),
        borderBottom: `2px solid ${BRAND.sun}`,
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Image src="/sandbox-clinic-logo.png" alt="Sandbox Clinic" width={48} height={48}
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <p style={{
              fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
              fontSize: '1.5rem', fontWeight: 800, color: BRAND.paper,
              lineHeight: 1.1, letterSpacing: '-0.02em',
            }}>
              {clinicName}
            </p>
            <p style={{
              fontSize: '0.85rem', color: 'rgba(244,236,221,0.78)',
              letterSpacing: '0.02em',
            }}>Patient Queue — Today</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{
            fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
            fontSize: '2rem', fontWeight: 700, color: BRAND.paper,
            lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>{clock}</p>
          <p style={{ fontSize: '0.8rem', color: 'rgba(244,236,221,0.78)', marginTop: '0.15rem' }}>{dateLabel}</p>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Queue Panel (40%) ─────────────────────────────────────────── */}
        <div ref={queuePanelRef} style={{
          flex: '0 0 40%', overflowY: 'auto', padding: '1rem 1.25rem',
          scrollBehavior: 'smooth',
        }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '4rem', color: 'rgba(244,236,221,0.55)' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>No scheduled appointments today</p>
            </div>
          ) : (
            hours.map(h => {
              const isNow = h === currentHour
              const isPast = h < currentHour
              return (
                <div
                  key={h}
                  ref={el => { hourRefs.current[h] = el }}
                  style={{ marginBottom: '1rem' }}
                >
                  {/* Hour header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    marginBottom: '0.35rem',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                      fontSize: '0.75rem', fontWeight: 700,
                      color: isNow ? BRAND.sun : isPast ? 'rgba(244,236,221,0.32)' : 'rgba(244,236,221,0.6)',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {formatHour(h)}
                    </span>
                    {isNow && (
                      <span style={{
                        fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                        fontSize: '0.6rem', fontWeight: 700, background: BRAND.sun, color: BRAND.narraDeep,
                        padding: '0.1rem 0.4rem', borderRadius: '99px', letterSpacing: '0.08em',
                      }}>
                        NOW
                      </span>
                    )}
                    <div style={{ flex: 1, height: '1px', background: isNow ? BRAND.sun : isPast ? BRAND.narraDeep : 'rgba(123,152,138,0.35)' }} />
                  </div>

                  {/* Rows */}
                  {byHour[h].map(item => {
                    const dept = DEPT_COLORS[item.department] ?? { bg: '#475569', text: '#fff' }
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.75rem', borderRadius: '0.4rem', marginBottom: '0.3rem',
                        background: isNow ? 'rgba(237,216,168,0.12)' : isPast ? 'rgba(244,236,221,0.03)' : BRAND.moss,
                        border: isNow ? `1px solid ${BRAND.sun}55` : '1px solid rgba(244,236,221,0.06)',
                        opacity: isPast ? 0.4 : 1,
                        transition: 'opacity 0.5s',
                      }}>
                        {/* Time */}
                        <span style={{
                          fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
                          fontSize: '0.75rem', fontWeight: 600,
                          color: isNow ? BRAND.sun : 'rgba(244,236,221,0.85)',
                          whiteSpace: 'nowrap', minWidth: '8.5rem',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {formatTime(item.startTime)} – {formatTime(item.endTime)}
                        </span>

                        {/* Initials badge */}
                        <div style={{
                          width: '1.9rem', height: '1.9rem', borderRadius: '0.3rem', flexShrink: 0,
                          background: dept.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: dept.text, letterSpacing: '0.02em' }}>
                            {item.initials}
                          </span>
                        </div>

                        {/* Department pill */}
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                          borderRadius: '99px', background: dept.bg, color: dept.text,
                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        }}>
                          {item.department}
                        </span>

                        {/* Session type */}
                        <span style={{
                          fontSize: '0.72rem',
                          color: isNow ? BRAND.paper : 'rgba(244,236,221,0.7)',
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.sessionType}
                        </span>

                        {/* Status */}
                        {item.status === 'CONFIRMED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: BRAND.sun,
                            background: 'rgba(237,216,168,0.16)', padding: '0.15rem 0.5rem', borderRadius: '99px', whiteSpace: 'nowrap',
                          }}>
                            Confirmed
                          </span>
                        )}
                        {item.status === 'CANCELLED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: BRAND.clay,
                            background: 'rgba(198,128,119,0.18)', padding: '0.15rem 0.5rem', borderRadius: '99px', whiteSpace: 'nowrap',
                          }}>
                            Cancelled
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* ── Ads Panel (60%) — narraDeep with warm coral lift bottom-right ── */}
        <div style={{
          flex: '0 0 60%', borderLeft: `1px solid ${BRAND.narraDeep}`,
          background: [
            'radial-gradient(700px 460px at 90% 92%, rgba(198,128,119,0.18), transparent 65%)',
            'radial-gradient(620px 420px at 12% 8%, rgba(237,216,168,0.10), transparent 65%)',
            BRAND.narraDeep,
          ].join(', '),
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {ads.length === 0 && (!lbEnabled || !leaderboard) && !cfEnabled ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem',
              color: 'rgba(244,236,221,0.4)',
            }}>
              <Image src="/sandbox-clinic-logo.png" alt="Sandbox Clinic" width={120} height={120}
                style={{ objectFit: 'contain', opacity: 0.3 }} />
              <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>No ads uploaded</p>
            </div>
          ) : (
            /* Fade wrapper */
            <div style={{
              flex: 1, position: 'relative',
              transition: 'opacity 0.5s ease',
              opacity: fadingOut ? 0 : 1,
            }}>
              {showComplaintQR ? (
                /* ── Patient Complaint Form QR Slide — Narra → deep Narra (Narra+Sun pairing) ── */
                <div style={{
                  width: '100%', height: '100%',
                  background: `linear-gradient(180deg, ${BRAND.narra} 0%, ${BRAND.narraDeep} 100%)`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '2.5rem 3rem', gap: '1.5rem',
                }}>
                  <p style={{
                    fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                    fontSize: '0.7rem', fontWeight: 700, color: BRAND.sun,
                    textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0,
                  }}>
                    Patient Feedback
                  </p>
                  <h2 style={{
                    fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                    fontSize: '1.8rem', fontWeight: 800, color: BRAND.paper,
                    textAlign: 'center', lineHeight: 1.2, margin: 0, letterSpacing: '-0.01em',
                  }}>
                    Submit a Complaint or Concern
                  </h2>
                  <p style={{
                    fontSize: '0.95rem', color: 'rgba(244,236,221,0.7)',
                    textAlign: 'center', maxWidth: '380px', lineHeight: 1.6, margin: 0,
                  }}>
                    Your feedback helps us improve our services. Scan the QR code below to submit a complaint or incident report.
                  </p>
                  {/* QR Code */}
                  <div style={{
                    background: BRAND.paper, borderRadius: '16px',
                    padding: '16px', boxShadow: `0 8px 32px ${BRAND.sun}33`,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={complaintQrUrl}
                      alt="Patient Complaint Form QR Code"
                      width={280} height={280}
                      style={{ display: 'block', borderRadius: '8px' }}
                    />
                  </div>
                  <p style={{
                    fontSize: '0.75rem', color: 'rgba(244,236,221,0.45)',
                    textAlign: 'center', margin: 0,
                  }}>
                    All submissions are confidential and reviewed by administration.
                  </p>
                </div>
              ) : showLeaderboard ? (
                /* ── Leaderboard Slide — Narra → Moss ── */
                <div style={{
                  width: '100%', height: '100%',
                  background: `linear-gradient(180deg, ${BRAND.narra} 0%, ${BRAND.moss} 100%)`,
                  display: 'flex', flexDirection: 'column',
                  padding: '2.5rem 3rem',
                }}>
                  {/* Title */}
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <p style={{
                      fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                      fontSize: '0.7rem', fontWeight: 700, color: BRAND.sun,
                      textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.25rem',
                    }}>
                      ★ Patient Satisfaction Leaderboard ★
                    </p>
                    <p style={{
                      fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                      fontSize: '1.6rem', fontWeight: 800, color: BRAND.paper, lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                    }}>
                      {lbDept === 'Overall' ? 'Top 5 — Overall' : `Top 5 — ${lbDept}`}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(244,236,221,0.55)', marginTop: '0.25rem' }}>
                      {leaderboard?.year} — {branch === 'SBEA' ? 'Sandbox East' : branch === 'SBGH' ? 'Greenhills' : branch}
                    </p>
                  </div>

                  {/* Entries */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem', justifyContent: 'center' }}>
                    {lbEntries.length > 0 ? lbEntries.map((group, i) => {
                      const medalColor = group.rank <= 3 ? MEDAL_COLORS[group.rank - 1] : undefined
                      const firstMember = group.members[0]
                      const deptColor = DEPT_COLORS[firstMember?.dept] ?? { bg: '#475569', text: '#fff' }
                      const memberNames = group.members.map(m => m.name).join(', ')
                      const isTied = group.members.length > 1
                      const avgRating = group.members.reduce((sum, m) => sum + m.avgRating, 0) / group.members.length
                      const totalSessions = group.members.reduce((sum, m) => sum + m.sessions, 0)
                      return (
                        <div key={'r' + group.rank + '_' + i} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.75rem 1rem', borderRadius: '0.6rem',
                          background: group.rank === 1 ? 'rgba(237,216,168,0.12)' : 'rgba(244,236,221,0.05)',
                          border: group.rank === 1 ? `1px solid ${BRAND.sun}55` : '1px solid rgba(244,236,221,0.08)',
                        }}>
                          {/* Rank */}
                          <div style={{
                            width: '2.2rem', height: '2.2rem', borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: medalColor ? medalColor + '25' : BRAND.narraDeep,
                            border: medalColor ? `2px solid ${medalColor}` : `2px solid ${BRAND.sage}`,
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                              fontSize: '0.9rem', fontWeight: 800, color: medalColor ?? BRAND.paper,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {group.rank}
                            </span>
                          </div>

                          {/* Names — each on its own line for tied rows */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {isTied ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                  <span style={{
                                    fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                                    fontSize: '0.65rem', fontWeight: 700, color: BRAND.sun,
                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                  }}>
                                    TIED · {group.members.length} therapists
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                  {group.members.map(m => (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ width: '0.3rem', height: '0.3rem', borderRadius: '50%', background: BRAND.sun, flexShrink: 0 }} />
                                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: BRAND.paper, lineHeight: 1.2 }}>{m.name}</span>
                                      {lbDept === 'Overall' && (
                                        <span style={{
                                          fontSize: '0.55rem', fontWeight: 700, padding: '0.05rem 0.35rem',
                                          borderRadius: '99px',
                                          background: (DEPT_COLORS[m.dept] ?? deptColor).bg,
                                          color: (DEPT_COLORS[m.dept] ?? deptColor).text,
                                          textTransform: 'uppercase', flexShrink: 0,
                                        }}>
                                          {m.dept}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <p style={{ fontSize: '1rem', fontWeight: 700, color: BRAND.paper, lineHeight: 1.25 }}>
                                  {memberNames}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem' }}>
                                  <span style={{
                                    fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                                    borderRadius: '99px', background: deptColor.bg, color: deptColor.text,
                                    textTransform: 'uppercase',
                                  }}>
                                    {firstMember?.dept}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', color: 'rgba(244,236,221,0.6)' }}>
                                    ★ {avgRating.toFixed(1)}/6 · {totalSessions} sessions
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Score */}
                          <div style={{ textAlign: 'right' }}>
                            <p style={{
                              fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
                              fontSize: '1.5rem', fontWeight: 800,
                              color: group.rank === 1 ? BRAND.sun : BRAND.sage,
                              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                            }}>
                              {group.score}
                            </p>
                            <p style={{
                              fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                              fontSize: '0.55rem', fontWeight: 700, color: 'rgba(244,236,221,0.55)',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                            }}>
                              Score
                            </p>
                          </div>
                        </div>
                      )
                    }) : (
                      <p style={{ textAlign: 'center', color: 'rgba(244,236,221,0.4)', fontSize: '0.85rem' }}>No data yet</p>
                    )}
                  </div>
                </div>
              ) : currentAd?.mimeType.startsWith('video/') ? (
                <video
                  ref={videoRef}
                  autoPlay muted playsInline
                  loop={ads.length === 1 && (!lbEnabled || !leaderboard)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onEnded={() => advanceAd(ads.length)}
                >
                  <source src={`/api/queue-ads/stream/${currentAd.id}`} type={currentAd.mimeType} />
                </video>
              ) : currentAd ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/queue-ads/stream/${currentAd.id}`}
                  alt="Clinic ad"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : null}
            </div>
          )}

          {/* Carousel dots */}
          {totalSlides > 1 && (
            <div style={{
              position: 'absolute', bottom: '1rem', left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: '0.4rem',
              pointerEvents: 'none',
            }}>
              {ads.map((_, i) => (
                <div key={`ad-${i}`} style={{
                  width: (!showLeaderboard && !showComplaintQR && i === adIdx) ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px',
                  background: (!showLeaderboard && !showComplaintQR && i === adIdx) ? BRAND.sun : 'rgba(244,236,221,0.3)',
                  transition: 'width 0.3s',
                }} />
              ))}
              {lbEnabled && leaderboard && (((leaderboard.overall?.length ?? 0) > 0) || leaderboard.departments.length > 0) && (
                <div style={{
                  width: showLeaderboard ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px',
                  background: showLeaderboard ? BRAND.sun : 'rgba(244,236,221,0.3)',
                  transition: 'width 0.3s',
                }} />
              )}
              {cfEnabled && (
                <div style={{
                  width: showComplaintQR ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px',
                  background: showComplaintQR ? BRAND.clay : 'rgba(244,236,221,0.3)',
                  transition: 'width 0.3s',
                }} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer — narraDeep with a quiet coral wash on the left edge ──── */}
      <div style={{
        padding: '0.4rem 2rem', flexShrink: 0,
        background: [
          'radial-gradient(360px 80px at 0% 50%, rgba(198,128,119,0.18), transparent 70%)',
          BRAND.narraDeep,
        ].join(', '),
        borderTop: `1px solid rgba(123,152,138,0.25)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: '0.7rem', color: 'rgba(244,236,221,0.45)', letterSpacing: '0.02em' }}>
          Sandbox Clinic Patient Queue Display — For internal use only
        </p>
        <p style={{
          fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
          fontSize: '0.7rem', color: 'rgba(244,236,221,0.45)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          Last updated: {lastRefresh || '—'} · Auto-refreshes every 30 seconds
        </p>
      </div>
    </div>
  )
}
