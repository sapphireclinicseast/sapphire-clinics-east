'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

/** Seconds of slack past a video's own length before the watchdog steps in. */
const VIDEO_GRACE_S = 8
/**
 * The longest a video may hold the screen when we never learn its length.
 * A minute is longer than any advert the clinic runs, so this only ever fires
 * for a video that is not playing at all.
 */
const VIDEO_MAX_WAIT_S = 60


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

// Medal colours for leaderboard (brand-tuned: Gold, neutral, Clay)
const MEDAL_COLORS = ['#C69849', '#94A3B8', '#CF9D88'] // 1st (gold), 2nd (neutral), 3rd (clay)

// ─── Aura Health Rehab palette (2026.06) ────────────────────────────────────
const BRAND = {
  narra:      '#244952', // primary — deep teal
  narraDeep:  '#193339', // deeper teal (footer / cards) — derived shade
  moss:       '#4A8073', // secondary — mid-teal
  sage:       '#7EA596', // tertiary — soft sage — derived tint
  clay:       '#CF9D88', // warm accent — coral / dusty rose
  sun:        '#C69849', // light accent — warm gold
  paper:      '#EDF3D9', // dominant neutral surface (pale green-cream)
  ink:        '#1A1A1A', // type / fine rules on light
  // Client-site neutrals (client.sapphireclinicseast.org): cards on paper.
  paper2:     '#E2EAC6',
  paper3:     '#CFDAAF', // card borders / dividers
  mid:        '#5E6655', // secondary text on paper
}

// The Client Portal's hero panel (Hero3D) — dark narra with gold + clay glows.
const HERO_BG = [
  'radial-gradient(800px 360px at 110% -10%, rgba(198,152,73,0.30), transparent 60%)',
  'radial-gradient(700px 320px at -10% 120%, rgba(207,157,136,0.24), transparent 60%)',
  'linear-gradient(135deg, #13262B 0%, #244952 55%, #4A8073 110%)',
].join(', ')

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
  // How long the current video says it runs for, once its metadata loads.
  // 0 means "not known yet", which the watchdog treats as the worst case.
  const [videoSeconds, setVideoSeconds] = useState(0)
  const [fadingOut, setFadingOut] = useState(false)
  const [clock, setClock]     = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [lastRefresh, setLastRefresh] = useState('')
  const [currentHour, setCurrentHour] = useState(0)
  const videoRef   = useRef<HTMLVideoElement>(null)
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cross-fade: after the old slide fades out we swap the content, then only
  // fade back in once the NEW slide is ready. For a photo that means "loaded
  // and decoded" — fading in straight away used to show the old bitmap for a
  // beat and then snap to the new one.
  const [awaitingFadeIn, setAwaitingFadeIn] = useState(false)
  const adImgRef = useRef<HTMLImageElement | null>(null)
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
  // Lines front desk typed in the Queueing module. One slide, all of them, in
  // the same rotation as the ads.
  const [anns, setAnns] = useState<{ id: string; text: string }[]>([])
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  // Configurable image slide duration (seconds), set in Ads Manager
  const [adSlideDuration, setAdSlideDuration] = useState(12)
  /** Play the adverts with sound. Set in Queueing › Ads Manager. */
  const [adAudio, setAdAudio] = useState(false)
  /**
   * Sound is wanted but the browser refused to start it.
   *
   * Chrome will not autoplay audio until the page has been interacted with,
   * and a TV driven by a laptop browser is never interacted with. Rather than
   * leave it silently silent — front desk turn sound ON and nothing happens,
   * with no way to tell whether the setting or the file is at fault — the
   * panel says so and one click fixes it for the rest of the session.
   */
  const [audioBlocked, setAudioBlocked] = useState(false)

  const COMPLAINT_FORM_URL = 'https://hr.sapphireclinicseast.org/patient-complaint-form.html'
  // QR colour matches brand Narra so the code reads as "official"
  const complaintQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(COMPLAINT_FORM_URL)}&color=244952&bgcolor=FFFFFF&margin=8`

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
        setAdSlideDuration(settings.adSlideDuration ?? 12)
        setAdAudio(settings.adAudio ?? false)
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
      // The rotation, in order: ads → announcements → leaderboard → complaint
      // QR → back to the ads. Each slide knows only what follows it, which is
      // why adding one means touching every branch of this chain.
      const hasLb = lbEnabled && !!leaderboard
        && (((leaderboard.overall?.length ?? 0) > 0) || leaderboard.departments.length > 0)
      const hasAnns = anns.length > 0

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
      } else if (showAnnouncements) {
        setShowAnnouncements(false)
        if (hasLb) {
          setShowLeaderboard(true)
          setLbDeptIdx(prev => (prev + 1) % Math.max(((leaderboard?.overall?.length ?? 0) > 0 ? 1 : 0) + (leaderboard?.departments?.length ?? 0), 1))
        } else if (cfEnabled) {
          setShowComplaintQR(true)
        } else {
          setAdIdx(0)
        }
      } else {
        const nextIdx = (adIdx + 1) % Math.max(1, currentLength)
        const cycleEnd = nextIdx === 0 || currentLength <= 1
        if (cycleEnd && hasAnns) {
          setShowAnnouncements(true)
        } else if (cycleEnd && hasLb) {
          setShowLeaderboard(true)
          setLbDeptIdx(prev => (prev + 1) % Math.max(((leaderboard?.overall?.length ?? 0) > 0 ? 1 : 0) + (leaderboard?.departments?.length ?? 0), 1))
        } else if (cycleEnd && cfEnabled) {
          setShowComplaintQR(true)
        } else {
          setAdIdx(nextIdx)
        }
      }
      setAwaitingFadeIn(true)
    }, 500)
  }, [showComplaintQR, showLeaderboard, showAnnouncements, adIdx, leaderboard, lbEnabled, cfEnabled, anns.length])

  // ── Fetch ads (branch-filtered) ──────────────────────────────────────────────
  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch(`/api/queue-ads?branch=${branch}`)
      if (res.ok) setAds(await res.json())
    } catch { /* silent */ }
  }, [branch])

  // ── Fetch announcements (branch-filtered, capped server-side at three) ─────
  const fetchAnns = useCallback(async () => {
    try {
      const res = await fetch(`/api/queue-announcements?branch=${branch}`)
      if (res.ok) {
        const rows = await res.json() as { id: string; text: string }[]
        setAnns(Array.isArray(rows) ? rows.filter(r => r?.text?.trim()) : [])
      }
    } catch { /* silent — the TV must never crash over a notice board */ }
  }, [branch])

  useEffect(() => {
    fetchQueue()
    fetchAds()
    fetchAnns()
    fetchLeaderboard()
    const queueInterval = setInterval(fetchQueue, 30_000)
    const adsInterval   = setInterval(fetchAds,  120_000)
    const annInterval   = setInterval(fetchAnns, 120_000)
    const lbInterval    = setInterval(fetchLeaderboard, 300_000) // refresh leaderboard every 5 min
    return () => { clearInterval(queueInterval); clearInterval(adsInterval); clearInterval(annInterval); clearInterval(lbInterval) }
  }, [fetchQueue, fetchAds, fetchAnns, fetchLeaderboard])

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
  // Forget the previous video's length the moment the slide changes, or the
  // watchdog for a stalled 60-second advert would inherit the 10 seconds of
  // the one before it and cut a working video short.
  useEffect(() => { setVideoSeconds(0) }, [currentAd?.id])
  useEffect(() => {
    if (showLeaderboard) {
      const id = setTimeout(() => advanceAd(ads.length), 15_000)
      return () => clearTimeout(id)
    }
    if (showComplaintQR) {
      const id = setTimeout(() => advanceAd(ads.length), 20_000)
      return () => clearTimeout(id)
    }
    // Long enough to read three lines out loud, twice. Scaled a little by how
    // much there is to read, so a single short notice does not hold the screen
    // for as long as a full board.
    if (showAnnouncements) {
      const id = setTimeout(() => advanceAd(ads.length), 12_000 + anns.length * 4_000)
      return () => clearTimeout(id)
    }
    // With no ads uploaded there is no video end and no image timer, so nothing
    // would ever advance: announcements alone must still start their own turn.
    if (ads.length === 0) {
      if (!showAnnouncements && anns.length > 0) {
        const id = setTimeout(() => advanceAd(0), 1_000)
        return () => clearTimeout(id)
      }
      return
    }
    if (!isImage) {
      // ── The video watchdog ───────────────────────────────────────────────
      //
      // A video slide used to advance ONLY on its own `ended` event. That is
      // fine until the video does not end: a stream request that hangs, a
      // decode the TV cannot do, an autoplay rejection after the browser
      // backgrounds the tab. None of those fire `ended`, so the panel held
      // the same dark rectangle indefinitely while the queue beside it kept
      // updating — which is exactly how this was found, a photo of the East
      // TV with a live clock and a black advert.
      //
      // So: nothing may hold the screen without a deadline. The real duration
      // is used once the metadata says what it is, with a margin for slow
      // decoding; until then a fixed ceiling covers a video whose metadata
      // never arrives at all.
      const seconds = videoSeconds > 0 ? videoSeconds + VIDEO_GRACE_S : VIDEO_MAX_WAIT_S
      const id = setTimeout(() => advanceAd(ads.length), seconds * 1_000)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => advanceAd(ads.length), adSlideDuration * 1_000)
    return () => clearTimeout(id)
  }, [adIdx, isImage, ads.length, advanceAd, showLeaderboard, showComplaintQR, showAnnouncements, anns.length, adSlideDuration, videoSeconds])

  // ── Fade back in once the incoming slide is ready ─────────────────────────
  const finishFadeIn = useCallback(() => {
    setAwaitingFadeIn(false)
    setFadingOut(false)
  }, [])
  const showingImageAd = !showAnnouncements && !showLeaderboard && !showComplaintQR && !!isImage
  useEffect(() => {
    if (!awaitingFadeIn) return
    const img = showingImageAd ? adImgRef.current : null
    // A photo that isn't decoded yet finishes the fade from its onLoad.
    // Everything else (announcements, leaderboard, QR, video, a cached photo)
    // can come back on the next frame. A safety timeout covers a photo that
    // never loads, so the panel can't stay blank.
    if (img && !(img.complete && img.naturalWidth > 0)) {
      const safety = setTimeout(finishFadeIn, 4000)
      return () => clearTimeout(safety)
    }
    const raf = requestAnimationFrame(finishFadeIn)
    return () => cancelAnimationFrame(raf)
  }, [awaitingFadeIn, showingImageAd, adIdx, finishFadeIn])

  // Warm the cache with the next photo so it's usually ready before its turn.
  useEffect(() => {
    if (ads.length < 2) return
    const next = ads[(adIdx + 1) % ads.length]
    if (!next?.mimeType.startsWith('image/')) return
    const pre = new window.Image()
    pre.src = `/api/queue-ads/stream/${next.id}`
  }, [adIdx, ads])

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
  const totalSlides = ads.length + (anns.length > 0 ? 1 : 0) + (lbEnabled ? lbSlides.length : 0) + (cfEnabled ? 1 : 0)

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      // Client-site look: pale-green paper with white cards for the queue,
      // the Client Portal's dark hero gradient for the masthead and ads.
      background: BRAND.paper,
      display: 'flex', flexDirection: 'column',
      // Manrope is the body/data face; Montserrat takes over for headings via inline fontFamily.
      fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, -apple-system, sans-serif',
      color: BRAND.ink,
    }}>
      {/* ── Header — light top bar, like the Client Portal's ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 2rem',
        background: BRAND.paper,
        borderBottom: `1px solid ${BRAND.paper3}`,
        color: BRAND.narra,
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Aura Health Rehab rainbow mark in colour — same as the Client
              Portal's top bar; the branch name sits beside it. */}
          <Image src="/brand/mark-rainbow-narra-512.png" alt="Aura Health Rehab" width={120} height={120} priority
            style={{ objectFit: 'contain', height: '3rem', width: 'auto', flexShrink: 0 }} />
          <div>
            <p style={{
              fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
              fontSize: '1.5rem', fontWeight: 700, color: BRAND.narra,
              lineHeight: 1.1, letterSpacing: '-0.02em',
            }}>
              {clinicName}
            </p>
            <p style={{
              fontSize: '0.85rem', color: BRAND.mid,
              letterSpacing: '0.02em',
            }}>Patient Queue — Today</p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{
            fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
            fontSize: '2rem', fontWeight: 700, color: BRAND.narra,
            lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}>{clock}</p>
          <p style={{ fontSize: '0.8rem', color: BRAND.mid, marginTop: '0.15rem' }}>{dateLabel}</p>
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
            <div style={{ textAlign: 'center', marginTop: '4rem', color: BRAND.mid }}>
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
                      color: isNow ? BRAND.moss : isPast ? 'rgba(94,102,85,0.55)' : BRAND.mid,
                      textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>
                      {formatHour(h)}
                    </span>
                    {isNow && (
                      <span style={{
                        fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                        fontSize: '0.6rem', fontWeight: 700, background: BRAND.moss, color: '#fff',
                        padding: '0.1rem 0.4rem', borderRadius: '99px', letterSpacing: '0.08em',
                      }}>
                        NOW
                      </span>
                    )}
                    <div style={{ flex: 1, height: '1px', background: isNow ? BRAND.moss : BRAND.paper3 }} />
                  </div>

                  {/* Rows */}
                  {byHour[h].map(item => {
                    const dept = DEPT_COLORS[item.department] ?? { bg: '#475569', text: '#fff' }
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.45rem 0.75rem', borderRadius: '0.6rem', marginBottom: '0.35rem',
                        background: isNow ? '#F3F8EC' : '#fff',
                        border: `1px solid ${isNow ? BRAND.moss : BRAND.paper3}`,
                        boxShadow: isNow ? '0 0 0 2px rgba(74,128,115,0.15)' : '0 1px 2px rgba(25,72,80,0.05)',
                        opacity: isPast ? 0.45 : 1,
                        transition: 'opacity 0.5s',
                      }}>
                        {/* Time */}
                        <span style={{
                          fontFamily: 'var(--font-manrope), "Helvetica Neue", system-ui, sans-serif',
                          fontSize: '0.75rem', fontWeight: 600,
                          color: BRAND.narra, fontWeight: isNow ? 700 : 600,
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
                          color: BRAND.mid,
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.sessionType}
                        </span>

                        {/* Status — solid dark pill so it stays legible on the
                            light moss rows (future) as well as now/past rows. */}
                        {item.status === 'CONFIRMED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: '#2F5A28',
                            background: '#EEF5E8', border: '1px solid #CFE0BF',
                            padding: '0.15rem 0.55rem', borderRadius: '99px', whiteSpace: 'nowrap',
                          }}>
                            Confirmed
                          </span>
                        )}
                        {item.status === 'CANCELLED' && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, color: '#991B1B',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            padding: '0.15rem 0.55rem', borderRadius: '99px', whiteSpace: 'nowrap',
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

        {/* ── Ads Panel (60%) — Client Portal hero gradient ── */}
        <div style={{
          flex: '0 0 60%', borderLeft: `1px solid ${BRAND.paper3}`,
          background: HERO_BG,
          color: BRAND.paper,
          position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Announcements count as something to show: a clinic with no ads
              uploaded but a notice up should see the notice, not "No ads". */}
          {ads.length === 0 && anns.length === 0 && (!lbEnabled || !leaderboard) && !cfEnabled ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '1rem',
              color: 'rgba(244,236,221,0.4)',
            }}>
              <Image src="/aura-health-logo-light.png" alt="Aura Health Rehab" width={200} height={200}
                style={{ objectFit: 'contain', opacity: 0.6 }} />
              <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>No ads uploaded</p>
            </div>
          ) : (
            /* Fade wrapper — flex column so the square ad centerer can stretch */
            <div style={{
              flex: 1, position: 'relative',
              display: 'flex', flexDirection: 'column',
              transition: 'opacity 0.6s ease',
              opacity: fadingOut ? 0 : 1,
            }}>
              {showAnnouncements ? (
                /* ── Announcements — paper on moss, so a block of text reads as
                   a notice board rather than another ad. Sized off the count:
                   one line gets to be large, three stay legible. ── */
                <div style={{
                  width: '100%', height: '100%',
                  background: `linear-gradient(180deg, ${BRAND.moss} 0%, ${BRAND.narra} 100%)`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '2.5rem 3rem', gap: '1.75rem',
                }}>
                  <p style={{
                    fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                    fontSize: '0.7rem', fontWeight: 700, color: BRAND.sun,
                    textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0,
                  }}>
                    {anns.length === 1 ? 'Announcement' : 'Announcements'}
                  </p>
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    gap: anns.length > 2 ? '1.1rem' : '1.5rem',
                    width: '100%', maxWidth: '46rem',
                  }}>
                    {anns.map((a, i) => (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                        {anns.length > 1 && (
                          <span style={{
                            flexShrink: 0,
                            width: '2rem', height: '2rem', borderRadius: '99px',
                            background: 'rgba(237,243,217,0.14)',
                            border: `1px solid ${BRAND.sun}`,
                            color: BRAND.sun,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                            fontSize: '0.8rem', fontWeight: 700,
                            marginTop: '0.15rem',
                          }}>
                            {i + 1}
                          </span>
                        )}
                        <p style={{
                          margin: 0,
                          fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                          // One notice can be read from across the room; three
                          // have to give up some size to stay on the slide.
                          fontSize: anns.length > 2 ? '1.35rem' : anns.length > 1 ? '1.6rem' : '2.1rem',
                          lineHeight: 1.35,
                          fontWeight: 600,
                          color: BRAND.paper,
                          textAlign: anns.length > 1 ? 'left' : 'center',
                        }}>
                          {a.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : showComplaintQR ? (
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
                      {leaderboard?.year} — {branch === 'SBEA' ? 'East Branch' : branch === 'SBGH' ? 'Greenhills Branch' : branch}
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
              ) : currentAd ? (
                /* Full-bleed — the ad fills the whole panel edge to edge (no
                   side bands). Anything not ~6:5 is cropped from the centre;
                   Ads Manager tells uploaders the ideal size (1152 × 960). */
                <div style={{
                  position: 'absolute', inset: 0,
                }}>
                  <div style={{
                    width: '100%', height: '100%',
                    overflow: 'hidden',
                  }}>
                    {currentAd.mimeType.startsWith('video/') ? (
                      <>
                      <video
                        // Keyed by the ad, so switching slides builds a NEW
                        // element. Without this React reuses the old one and
                        // swapping only the <source> does not reliably make a
                        // video element reload — a known way to end up with a
                        // black panel holding the previous frame.
                        key={currentAd.id}
                        ref={videoRef}
                        autoPlay playsInline
                        loop={ads.length === 1 && (!lbEnabled || !leaderboard)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        // Muted in the MARKUP even when sound is wanted, then
                        // unmuted below. A video element that starts unmuted
                        // is refused autoplay outright by every modern
                        // browser; one that starts muted plays, and can then
                        // be asked for sound.
                        muted={!adAudio}
                        onLoadedMetadata={e => {
                          const v = e.currentTarget as HTMLVideoElement
                          const d = v.duration
                          if (Number.isFinite(d) && d > 0) setVideoSeconds(d)
                          if (!adAudio) return
                          // Ask for sound. A device that does not allow
                          // autoplay with audio rejects this, and the answer
                          // is to carry on SILENTLY rather than let the panel
                          // sit on a video that will not start — a waiting
                          // room notices a black screen, not a quiet advert.
                          v.muted = false
                          v.volume = 1
                          void v.play()
                            .then(() => setAudioBlocked(false))
                            .catch(() => {
                              // Refused. Carry on muted — a waiting room
                              // notices a black screen, not a quiet advert —
                              // and raise the prompt so somebody can unlock it.
                              setAudioBlocked(true)
                              v.muted = true
                              void v.play().catch(() => advanceAd(ads.length))
                            })
                        }}
                        onEnded={() => advanceAd(ads.length)}
                        // A file the TV cannot fetch or cannot decode. Skipping
                        // it is always better than showing it: one advert
                        // missing is invisible to the room, a frozen panel is
                        // the whole screen.
                        onError={() => advanceAd(ads.length)}
                        // Buffering that never recovers looks identical to a
                        // dead slide. The watchdog above would catch it
                        // eventually; this catches it sooner.
                        onStalled={() => { if (videoSeconds === 0) advanceAd(ads.length) }}
                      >
                        <source src={`/api/queue-ads/stream/${currentAd.id}`} type={currentAd.mimeType} />
                      </video>
                      {/* ── Unlock sound ──────────────────────────────────
                          Browsers refuse to start audio until the page has
                          been interacted with, and a TV driven from a laptop
                          never is. One click anywhere on this panel satisfies
                          that for the whole session, so this appears only when
                          sound was asked for and refused, and goes as soon as
                          it works.

                          Deliberately visible rather than a silent fallback:
                          without it, turning sound on in Ads Manager appears
                          to do nothing, with no way to tell whether the
                          setting, the file or the television is at fault. */}
                      {adAudio && audioBlocked && (
                        <button
                          type="button"
                          onClick={() => {
                            const v = videoRef.current
                            if (!v) return
                            v.muted = false
                            v.volume = 1
                            void v.play()
                              .then(() => setAudioBlocked(false))
                              .catch(() => { v.muted = true; void v.play().catch(() => {}) })
                          }}
                          style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'flex-end', justifyContent: 'center',
                            padding: '0 0 3vh', background: 'transparent',
                            border: 'none', cursor: 'pointer',
                          }}
                        >
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.6vw',
                            padding: '0.9vh 1.6vw', borderRadius: 999,
                            background: 'rgba(15,23,42,0.72)', color: '#fff',
                            fontSize: 'clamp(12px, 1.4vw, 22px)', fontWeight: 700,
                            backdropFilter: 'blur(6px)',
                          }}>
                            <span aria-hidden>🔊</span> Click once for sound
                          </span>
                        </button>
                      )}
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={currentAd.id}
                        ref={adImgRef}
                        src={`/api/queue-ads/stream/${currentAd.id}`}
                        onLoad={() => { if (awaitingFadeIn) finishFadeIn() }}
                        onError={() => { if (awaitingFadeIn) finishFadeIn() }}
                        alt="Clinic ad"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    )}
                  </div>
                </div>
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
                  width: (!showLeaderboard && !showComplaintQR && !showAnnouncements && i === adIdx) ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px',
                  background: (!showLeaderboard && !showComplaintQR && !showAnnouncements && i === adIdx) ? BRAND.sun : 'rgba(244,236,221,0.3)',
                  transition: 'width 0.3s',
                }} />
              ))}
              {anns.length > 0 && (
                <div style={{
                  width: showAnnouncements ? '1.5rem' : '0.4rem', height: '0.4rem',
                  borderRadius: '99px',
                  background: showAnnouncements ? BRAND.paper : 'rgba(244,236,221,0.3)',
                  transition: 'width 0.3s',
                }} />
              )}
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

      {/* ── Motto ribbon — scrolls like a news ticker. Two identical halves
          slide by exactly one half, so the loop is seamless. ── */}
      <style>{`
        @keyframes queue-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .queue-ticker-track { animation: none !important } }
      `}</style>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'stretch',
        background: BRAND.narra, color: '#fff',
        borderTop: `3px solid ${BRAND.sun}`,
        height: '2.6rem', overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div className="queue-ticker-track" aria-label="Feeling Seen. Finding Footing. Moving Forward." style={{
            display: 'flex', width: 'max-content', whiteSpace: 'nowrap',
            animation: 'queue-ticker 40s linear infinite',
          }}>
            {[0, 1].map(half => (
              <div key={half} aria-hidden={half === 1} style={{ display: 'flex' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '1.5rem', paddingRight: '1.5rem',
                    fontFamily: 'var(--font-montserrat), "Helvetica Neue", system-ui, sans-serif',
                    fontSize: '1.05rem', fontWeight: 600, letterSpacing: '0.02em',
                  }}>
                    Feeling Seen. Finding Footing. Moving Forward.
                    <span aria-hidden style={{ width: '0.45rem', height: '0.45rem', borderRadius: '50%', background: BRAND.sun, display: 'inline-block' }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Last-updated stays visible at the right end of the ribbon. */}
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 1.25rem', background: BRAND.narraDeep,
          fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          boxShadow: '-12px 0 16px -8px rgba(0,0,0,0.35)',
        }}>
          Updated {lastRefresh || '—'}
        </div>
      </div>
    </div>
  )
}
