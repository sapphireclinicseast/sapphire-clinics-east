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
  const videoRef   = useRef<HTMLVideoElement>(null)
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Live clock (updates every second) ──────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date()
      setClock(now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setDateLabel(now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Fetch queue data ────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      const res = await fetch(`/api/queue?branch=${branch}&date=${today}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
        setLastRefresh(new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }))
      }
    } catch { /* silent — TV should never crash */ }
  }, [branch])

  // ── Advance to next ad with fade out → swap → fade in ───────────────────────
  const advanceAd = useCallback((currentLength: number) => {
    if (currentLength <= 1) return
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    setFadingOut(true)
    fadeTimer.current = setTimeout(() => {
      setAdIdx(i => (i + 1) % currentLength)
      setFadingOut(false)
    }, 500)
  }, [])

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
    const queueInterval = setInterval(fetchQueue, 30_000)
    const adsInterval   = setInterval(fetchAds,  120_000)
    return () => { clearInterval(queueInterval); clearInterval(adsInterval) }
  }, [fetchQueue, fetchAds])

  // ── Reload video src when ad changes ─────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [adIdx])

  // ── Reset adIdx if ads list shrinks ──────────────────────────────────────
  useEffect(() => {
    if (ads.length > 0 && adIdx >= ads.length) setAdIdx(0)
  }, [ads.length, adIdx])

  // ── Image ads: auto-advance after 12 s (with fade) ───────────────────────
  const currentAd = ads[adIdx]
  const isImage = currentAd?.mimeType.startsWith('image/')
  useEffect(() => {
    if (!isImage || ads.length === 0) return
    const id = setTimeout(() => advanceAd(ads.length), 12_000)
    return () => clearTimeout(id)
  }, [adIdx, isImage, ads.length, advanceAd])

  // ── Group items by hour ─────────────────────────────────────────────────────
  const byHour: Record<number, QueueItem[]> = {}
  for (const item of items) {
    const h = parseInt(item.startTime.split(':')[0], 10)
    ;(byHour[h] ??= []).push(item)
  }
  const hours = Object.keys(byHour).map(Number).sort((a, b) => a - b)

  // Current hour in PH time
  const nowHour = new Date().toLocaleString('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' })
  const currentHour = parseInt(nowHour, 10)

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#0F172A', display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 2rem',
        background: 'linear-gradient(90deg, #ED6823 0%, #FFA235 100%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Image src="/sandbox-clinic-logo.png" alt="Sandbox Clinic" width={48} height={48}
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {clinicName}
            </p>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>Patient Queue — Today</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{clock}</p>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: '0.15rem' }}>{dateLabel}</p>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Queue Panel (40%) ─────────────────────────────────────────── */}
        <div style={{ flex: '0 0 40%', overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: '4rem', color: '#64748B' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>No scheduled appointments today</p>
            </div>
          ) : (
            hours.map(h => {
              const isNow = h === currentHour
              return (
                <div key={h} style={{ marginBottom: '1rem' }}>
                  {/* Hour header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    marginBottom: '0.35rem',
                  }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, color: isNow ? '#FFA235' : '#94A3B8',
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {formatHour(h)}
                    </span>
                    {isNow && (
                      <span style={{
                        fontSize: '0.6rem', fontWeight: 700, background: '#FFA235', color: '#0F172A',
                        padding: '0.1rem 0.4rem', borderRadius: '99px', letterSpacing: '0.08em',
                      }}>
                        NOW
                      </span>
                    )}
                    <div style={{ flex: 1, height: '1px', background: isNow ? '#FFA235' : '#1E293B' }} />
                  </div>

                  {/* Rows */}
                  {byHour[h].map(item => {
                    const dept = DEPT_COLORS[item.department] ?? { bg: '#475569', text: '#fff' }
                    const isPast = h < currentHour
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.75rem', borderRadius: '0.4rem', marginBottom: '0.3rem',
                        background: isNow ? 'rgba(237,104,35,0.08)' : isPast ? 'rgba(255,255,255,0.02)' : '#1E293B',
                        border: isNow ? '1px solid rgba(237,104,35,0.3)' : '1px solid rgba(255,255,255,0.04)',
                        opacity: isPast ? 0.5 : 1,
                      }}>
                        {/* Time */}
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 600, color: '#CBD5E1',
                          whiteSpace: 'nowrap', minWidth: '8.5rem',
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
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.sessionType}
                        </span>

                        {/* Status */}
                        {item.status === 'CONFIRMED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: '#10B981',
                            background: 'rgba(16,185,129,0.12)', padding: '0.15rem 0.5rem', borderRadius: '99px', whiteSpace: 'nowrap',
                          }}>
                            Confirmed
                          </span>
                        )}
                        {item.status === 'CANCELLED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: '#EF4444',
                            background: 'rgba(239,68,68,0.12)', padding: '0.15rem 0.5rem', borderRadius: '99px', whiteSpace: 'nowrap',
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

        {/* ── Ads Panel (60%) ───────────────────────────────────────────── */}
        <div style={{
          flex: '0 0 60%', borderLeft: '1px solid #1E293B',
          background: '#000', position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {ads.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#334155',
            }}>
              <Image src="/sandbox-clinic-logo.png" alt="Sandbox Clinic" width={120} height={120}
                style={{ objectFit: 'contain', opacity: 0.3 }} />
              <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>No ads uploaded</p>
            </div>
          ) : (
            /* Fade wrapper — opacity transitions on ad change */
            <div style={{
              flex: 1, position: 'relative',
              transition: 'opacity 0.5s ease',
              opacity: fadingOut ? 0 : 1,
            }}>
              {currentAd?.mimeType.startsWith('video/') ? (
                <video
                  ref={videoRef}
                  autoPlay muted playsInline
                  loop={ads.length === 1}
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

          {/* Ad counter dots (outside fade wrapper so they stay visible) */}
          {ads.length > 1 && (
            <div style={{
              position: 'absolute', bottom: '1rem', left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: '0.4rem',
              pointerEvents: 'none',
            }}>
              {ads.map((_, i) => (
                <div key={i} style={{
                  width: i === adIdx ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px', background: i === adIdx ? '#ED6823' : 'rgba(255,255,255,0.3)',
                  transition: 'width 0.3s',
                }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '0.4rem 2rem', flexShrink: 0,
        background: '#0A1020', borderTop: '1px solid #1E293B',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: '0.7rem', color: '#334155' }}>
          Sandbox Clinic Patient Queue Display — For internal use only
        </p>
        <p style={{ fontSize: '0.7rem', color: '#334155' }}>
          Last updated: {lastRefresh || '—'} · Auto-refreshes every 30 seconds
        </p>
      </div>
    </div>
  )
}
