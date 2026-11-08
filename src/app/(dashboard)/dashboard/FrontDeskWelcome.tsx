'use client'

import React from 'react'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Image from 'next/image'
import {
  AlertTriangle, ArrowRight, Banknote, Building2, Cake, CalendarClock, Check, CheckCircle2,
  FileText, Gift, History, Loader2, Mail, RefreshCw, Search, Send, Smartphone, UserSearch, X,
} from 'lucide-react'
import DeskShortcutCard from '@/components/DeskShortcutCard'
import { branchLabel } from '@/lib/branch-label'
import { CARD_STYLE, DashCard, Skeleton } from '../patients/dashboard/ui'

type BirthdayPatient = { id: string; firstName: string; lastName: string; birthday: string; hasPhone: boolean }
/** One patient with cancellation fees owed and not yet collected. */
type FeeOwedRow = { id: string; name: string; count: number; oldestAt: string }
type SmsState = 'idle' | 'sending' | 'sent' | 'error'
type EmailState = 'idle' | 'sending' | 'sent' | 'error'

// localStorage is now only an IN-FLIGHT guard: it stops a double-send if the
// operator refreshes while a request is still on the wire. The durable record
// lives server-side (BirthdayGreeting) and is loaded from /api/birthday/greetings,
// so the green "sent" state is shared by every staff member and survives
// sign-out — a per-browser flag that also reset daily is what let patients get
// greeted twice.
function storageKey(type: 'email' | 'sms'): string {
  const d = new Date()
  return `birthday-${type}-sent-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function loadSent(type: 'email' | 'sms'): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(type))
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}
function markSent(type: 'email' | 'sms', patientId: string) {
  try {
    const sent = loadSent(type)
    sent.add(patientId)
    localStorage.setItem(storageKey(type), JSON.stringify([...sent]))
  } catch {}
}

const loadSentEmails = () => loadSent('email')
const markEmailSent = (id: string) => markSent('email', id)

// ── Famous inspirational quotes — one per calendar day ──────────────────────
const QUOTES: { text: string; author: string }[] = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { text: "The best way to find yourself is to lose yourself in the service of others.", author: "Mahatma Gandhi" },
  { text: "With the new day comes new strength and new thoughts.", author: "Eleanor Roosevelt" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "What you do makes a difference, and you have to decide what kind of difference you want to make.", author: "Jane Goodall" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "No act of kindness, no matter how small, is ever wasted.", author: "Aesop" },
  { text: "Optimism is the faith that leads to achievement.", author: "Helen Keller" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "Spread love everywhere you go.", author: "Mother Teresa" },
  { text: "Don't judge each day by the harvest you reap but by the seeds that you plant.", author: "Robert Louis Stevenson" },
  { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
  { text: "If you look at what you have in life, you'll always have more.", author: "Oprah Winfrey" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "You will face many defeats in life, but never let yourself be defeated.", author: "Maya Angelou" },
  { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln" },
  { text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller" },
  { text: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
  { text: "When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.", author: "Henry Ford" },
  { text: "It is never too late to be what you might have been.", author: "George Eliot" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { text: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Keep your face always toward the sunshine — and shadows will fall behind you.", author: "Walt Whitman" },
  { text: "If your actions inspire others to dream more, learn more, do more and become more, you are a leader.", author: "John Quincy Adams" },
  { text: "Leadership is not about being in charge. It is about taking care of those in your charge.", author: "Simon Sinek" },
  { text: "The most common way people give up their power is by thinking they don't have any.", author: "Alice Walker" },
  { text: "You must do the things you think you cannot do.", author: "Eleanor Roosevelt" },
  { text: "Try to be a rainbow in someone's cloud.", author: "Maya Angelou" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "I can't change the direction of the wind, but I can adjust my sails to always reach my destination.", author: "Jimmy Dean" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Nothing is impossible. The word itself says 'I'm possible!'", author: "Audrey Hepburn" },
  { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { text: "To handle yourself, use your head; to handle others, use your heart.", author: "Eleanor Roosevelt" },
  { text: "Too many of us are not living our dreams because we are living our fears.", author: "Les Brown" },
  { text: "I attribute my success to this: I never gave or took any excuse.", author: "Florence Nightingale" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Somewhere, something incredible is waiting to be known.", author: "Marie Curie" },
  { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington" },
  { text: "You can't use up creativity. The more you use, the more you have.", author: "Maya Angelou" },
  { text: "Darkness cannot drive out darkness; only light can do that.", author: "Martin Luther King Jr." },
  { text: "Not everything that is faced can be changed, but nothing can be changed until it is faced.", author: "James Baldwin" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "You have power over your mind, not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "What we think, we become.", author: "Buddha" },
  { text: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "Injustice anywhere is a threat to justice everywhere.", author: "Martin Luther King Jr." },
  { text: "The only person you are destined to become is the person you decide to be.", author: "Ralph Waldo Emerson" },
  { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "In every day, there are 1,440 minutes. That means we have 1,440 daily opportunities to make a positive impact.", author: "Les Brown" },
]

// Pick by day-of-year so each calendar day always shows the same quote
function getDailyQuote() {
  const now = new Date()
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000
  )
  return QUOTES[dayOfYear % QUOTES.length]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}


// ── Timed reminder popup ──────────────────────────────────────────────────────
interface Reminder {
  id: string
  triggerHour: number
  triggerMinute: number
  title: string
  timeLabel: string
  actions: string[]
  color: string
  icon: string
}

// 15 minutes after clinic opening per branch
const CLINIC_OPENING_REMINDER: Record<string, { h: number; m: number }> = {
  SBEA: { h: 10, m: 15 },
  SBGH: { h:  9, m: 15 },
}

function getReminders(branch: string | undefined): Reminder[] {
  const opening = (branch ? CLINIC_OPENING_REMINDER[branch] : null) ?? { h: 10, m: 15 }
  const oh = opening.h
  const om = opening.m
  const openLabel = `${oh % 12 === 0 ? 12 : oh % 12}:${String(om).padStart(2, '0')} ${oh < 12 ? 'AM' : 'PM'}`
  return [
    {
      id: 'desk-deck-out-1pm',
      triggerHour: 13, triggerMinute: 0,
      title: 'Deck Out to Patients',
      timeLabel: '1:00 PM',
      actions: [
        'Send the next-day schedule to each scheduled patient to confirm.',
        'Expect their confirmation replies until 5:00 PM.',
      ],
      color: '#4a8073', icon: '📋',
    },
    {
      id: 'desk-confirm-5pm',
      triggerHour: 17, triggerMinute: 0,
      title: 'Patient Replies Due · Send to Consultant',
      timeLabel: '5:00 PM',
      actions: [
        'Collect all patient confirmation replies by now.',
        'Send the confirmed next-day schedule to the consultant.',
      ],
      color: '#D97706', icon: '📤',
    },
    {
      id: 'desk-clinic-opening',
      triggerHour: oh, triggerMinute: om,
      title: 'Clinic Is Open — Check Absences',
      timeLabel: openLabel,
      actions: [
        'Consultants must have notified Front Desk by 8:00 AM of any same-day absence.',
        'Inform affected patients now that the clinic is open.',
      ],
      color: '#4a8073', icon: '🏥',
    },
  ]
}

function reminderDayKey(id: string): string {
  const d = new Date()
  return `${id}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function isReminderDone(id: string): boolean {
  try { return localStorage.getItem(reminderDayKey(id)) === 'done' } catch { return false }
}
function markReminderDone(id: string) {
  try { localStorage.setItem(reminderDayKey(id), 'done') } catch {}
}

function ReminderModal({ reminder, onDismiss }: { reminder: Reminder; onDismiss: () => void }) {
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    if (countdown <= 0) {
      markReminderDone(reminder.id)
      onDismiss()
      return
    }
    const t = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown, reminder.id, onDismiss])

  function dismiss() {
    markReminderDone(reminder.id)
    onDismiss()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.52)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={dismiss}
    >
      <div
        style={{
          background: '#fff', borderRadius: '1.25rem',
          maxWidth: '440px', width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: reminder.color, padding: '1.1rem 1.4rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{reminder.icon}</span>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
              Front Desk Reminder &middot; {reminder.timeLabel}
            </p>
            <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '0.22rem 0 0', lineHeight: 1.2 }}>
              {reminder.title}
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.4rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
            {reminder.actions.map((action, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, width: 23, height: 23,
                  background: reminder.color + '18',
                  border: `1.5px solid ${reminder.color}55`,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 800, color: reminder.color,
                }}>
                  {i + 1}
                </span>
                <p style={{ fontSize: '0.875rem', color: '#333', lineHeight: 1.6, margin: 0, flex: 1 }}>
                  {action}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={dismiss}
              style={{
                flex: 1, padding: '0.72rem', borderRadius: '0.65rem',
                background: reminder.color, color: '#fff', border: 'none',
                fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Got it ✓
            </button>
            <p style={{ fontSize: '0.68rem', color: '#BBB', margin: 0, whiteSpace: 'nowrap' }}>
              Auto-closes in {countdown}s
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// DeskShortcutReminder card now lives in @/components/DeskShortcutCard (shared
// with the Clinic Schedule "Today" view). Use <DeskShortcutCard /> below.

// ── PACT Cancellation Reminder card ──────────────────────────────────────────
function PactCancellationReminder() {
  const steps = [
    { letter: 'P', action: 'Plan early', desc: 'Let us know as soon as you know you may miss a session.' },
    { letter: 'A', action: 'Alert us', desc: 'Tell the Front Desk during office hours, or message your therapist if the office is closed.' },
    { letter: 'C', action: 'Cut-off', time: '5:00 PM the day before', desc: 'Message us by then so it counts as a Standard Cancellation — not a Late Cancellation.' },
    { letter: 'T', action: 'Through official channels', desc: 'Use official channels only, and make sure your message is acknowledged.' },
  ]
  const tiers = [
    { label: 'Standard', desc: 'Before 5 PM the day before. Slot is held.', bg: '#edf3d9', border: '#b8d4a0', color: '#4a8073' },
    { label: 'Late', desc: 'After 5 PM the day before. Fee may apply.', bg: '#FFFBEB', border: '#FDE68A', color: '#D97706' },
    { label: 'No-Show', desc: 'Did not show up. Fee applies.', bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
  ]

  return (
    <div style={{
      width: '100%',
      background: '#fff',
      border: '1.5px solid #EDE5D8',
      borderRadius: '0.875rem',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #244952, #4a8073)', padding: '0.6rem 0.9rem' }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: '0.73rem', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
          Patient Cancellation — PACT
        </p>
        <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.61rem', margin: '0.18rem 0 0' }}>
          Tell us in time so their slot is held and no fee applies.
        </p>
      </div>

      {/* PACT steps */}
      <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {steps.map(({ letter, action, time, desc }) => (
          <div key={letter} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{
              flexShrink: 0, width: 26, height: 26,
              background: '#244952', borderRadius: '0.35rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: '0.85rem',
            }}>
              {letter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1A1A1A', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                {action}
                {time && (
                  <span style={{ background: '#c69849', color: '#fff', borderRadius: 99, padding: '0.05rem 0.45rem', fontSize: '0.6rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {time}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.63rem', color: '#666', marginTop: '0.12rem', lineHeight: 1.4 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* What your notice counts as */}
      <div style={{ borderTop: '1px solid #F0E8DC', padding: '0.5rem 0.75rem 0.7rem' }}>
        <div style={{ fontSize: '0.59rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#AAA', marginBottom: '0.35rem' }}>
          What the notice counts as
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {tiers.map(({ label, desc, bg, border, color }) => (
            <div key={label} style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: '0.35rem', padding: '0.3rem 0.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.59rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
              <div style={{ fontSize: '0.57rem', color: '#555', marginTop: '0.1rem', lineHeight: 1.35 }}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.57rem', color: '#AAA', fontStyle: 'italic', marginTop: '0.4rem', marginBottom: 0, lineHeight: 1.4 }}>
          Messages after 5:00 PM or on the day itself count as Late / same-day cancellations (Section 4).
        </p>
      </div>
    </div>
  )
}

// ── Presentation helpers ─────────────────────────────────────────────────────
// Same vocabulary as the Queueing / Staff / Scheduling pages: white cards with a
// --light-gray rule, Montserrat headings, and status colours only where there is
// a real state behind them (owed, at limit, failed, done).

const SECTION_LABEL = 'text-[10.5px] font-bold uppercase tracking-wider'
const SUBTLE_BG = '#F6F9F8'
const BTN_SM = 'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed'

type Tone = 'danger' | 'warn' | 'info' | 'brand' | 'clear'
const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
  danger: { fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA' },
  warn:   { fg: '#B45309', bg: '#FFFBEB', bd: '#FDE68A' },
  info:   { fg: '#1D4ED8', bg: '#EFF6FF', bd: '#BFDBFE' },
  brand:  { fg: '#244952', bg: '#EEF4F2', bd: '#c8dbd5' },
  clear:  { fg: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0' },
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function SectionHeading({ id, title, sub }: { id?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
      <h2 id={id} className={SECTION_LABEL} style={{ color: 'var(--mid-gray)' }}>{title}</h2>
      {sub && <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>{sub}</p>}
    </div>
  )
}

function CountChip({ n, tone }: { n: number; tone: Tone }) {
  const t = TONES[tone]
  return (
    <span className="inline-flex items-center h-6 min-w-6 justify-center px-2 rounded-full text-xs font-bold tabular-nums"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {n}
    </span>
  )
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline whitespace-nowrap"
      style={{ color: 'var(--teal)' }}>
      {children} <ArrowRight size={12} />
    </a>
  )
}

/** Small status pill used on list rows (age, "Not emailed", "Sent"). */
function Pill({ tone, children, title }: { tone: Tone | 'neutral'; children: ReactNode; title?: string }) {
  const t = tone === 'neutral' ? { fg: '#475569', bg: '#F1F5F9', bd: '#E2E8F0' } : TONES[tone]
  return (
    <span title={title}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide leading-4 whitespace-nowrap tabular-nums"
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {children}
    </span>
  )
}

function CaughtUp({ title = 'All caught up', hint }: { title?: string; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg px-3.5 py-3" style={{ background: SUBTLE_BG }}>
      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: TONES.clear.fg }} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
        {hint && <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--mid-gray)' }}>{hint}</p>}
      </div>
    </div>
  )
}

function CardError({ message, onRetry, busy }: { message: ReactNode; onRetry?: () => void; busy?: boolean }) {
  return (
    <div role="alert" className="rounded-lg px-4 py-4 text-center" style={{ background: TONES.warn.bg, border: `1px solid ${TONES.warn.bd}` }}>
      <AlertTriangle size={16} className="mx-auto mb-1.5" style={{ color: TONES.warn.fg }} />
      <p className="text-[13px] font-semibold leading-snug" style={{ color: '#92400E' }}>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={busy}
          className={`${BTN_SM} mt-3 hover:bg-white/70`}
          style={{ border: `1px solid ${TONES.warn.bd}`, color: '#92400E', background: '#fff' }}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Try again
        </button>
      )}
    </div>
  )
}

/** Placeholder list rows while a card loads. */
function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${70 - i * 10}%` }} />
          <Skeleton className="h-5 ml-auto" style={{ width: 52 }} />
        </div>
      ))}
    </div>
  )
}

/** One tile in the "Needs your attention" row: a count, a label, a link. */
function AttentionTile({ href, icon, label, count, sub, tone, state }: {
  href: string
  icon: ReactNode
  label: string
  count: number
  sub?: ReactNode
  tone: Tone
  state: 'loading' | 'ready' | 'error'
}) {
  const t = state === 'error' ? TONES.warn : TONES[tone]
  return (
    <a href={href}
      className="group relative flex items-start gap-3 rounded-xl pl-4 pr-3.5 py-3.5 min-w-0 overflow-hidden transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...CARD_STYLE, outlineColor: 'var(--teal)' }}>
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: state === 'loading' ? 'var(--light-gray)' : t.fg }} />
      <span className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: t.bg, color: t.fg }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>{label}</p>
        {state === 'loading' ? (
          <>
            <Skeleton className="h-6 w-10 mt-1.5" />
            <Skeleton className="h-3 w-28 mt-1.5" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold leading-tight mt-0.5"
              style={{ fontFamily: 'var(--font-display)', color: state === 'error' ? TONES.warn.fg : count > 0 ? t.fg : 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
              {state === 'error' ? '—' : count}
            </p>
            {sub && (
              <p className="text-xs mt-0.5 leading-snug" style={{ color: state === 'error' ? '#92400E' : 'var(--mid-gray)' }}>{sub}</p>
            )}
          </>
        )}
      </div>
      <ArrowRight size={15} className="flex-shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--mid-gray)' }} />
    </a>
  )
}

// ── Today's front-desk checkpoints ───────────────────────────────────────────
// The same three timed reminders the popup fires, laid out as today's timeline
// so front desk can see what is coming and what has been acknowledged. Reads
// the popup's own "done" flag; it never fires or dismisses anything itself.
function TodayCheckpoints({ branch }: { branch?: string }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    // First tick deferred a frame so the server render and the first client
    // render agree (no clock on either), then every 30s like the popup check.
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 30_000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [])

  const reminders = getReminders(branch)
    .slice()
    .sort((a, b) => (a.triggerHour * 60 + a.triggerMinute) - (b.triggerHour * 60 + b.triggerMinute))
  const mins = now ? now.getHours() * 60 + now.getMinutes() : null

  return (
    <DashCard title="Front desk checkpoints" icon={<CalendarClock size={16} />}
      description="Today's timed reminders — the popup appears at each time." flush>
      <ul className="px-5 py-1 divide-y" style={{ borderColor: 'var(--light-gray)' }}>
        {reminders.map(r => {
          const at = r.triggerHour * 60 + r.triggerMinute
          let badge: ReactNode = <Skeleton className="h-5" style={{ width: 64 }} />
          if (mins !== null) {
            badge = isReminderDone(r.id) ? <Pill tone="clear">Done</Pill>
              : mins >= at && mins < at + 60 ? <Pill tone="warn">Due now</Pill>
              : mins < at ? <Pill tone="neutral">Upcoming</Pill>
              : <Pill tone="neutral">Passed</Pill>
          }
          return (
            <li key={r.id} className="flex items-start gap-3 py-3" style={{ borderColor: 'var(--light-gray)' }}>
              <span className="flex-shrink-0 w-16 text-[13px] font-bold tabular-nums pt-px" style={{ color: 'var(--teal)' }}>
                {r.timeLabel}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>{r.title}</p>
                <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--mid-gray)' }}>{r.actions[0]}</p>
              </div>
              <span className="flex-shrink-0">{badge}</span>
            </li>
          )
        })}
      </ul>
    </DashCard>
  )
}

/** What each child card reports up so the attention row can count it. */
interface ProgressSummary { loading: boolean; error: string | null; count: number; paidUnsent: number; staleUnsent: number }
interface PlushSummary { loading: boolean; error: string | null; pending: number; unplaceable: number }

// ── Main component ───────────────────────────────────────────────────────────
export default function FrontDeskWelcome({
  name,
  branch,
  seesAllBranches,
  birthdayPatients = [],
}: {
  name?: string
  branch?: string
  seesAllBranches?: boolean
  birthdayPatients?: BirthdayPatient[]
}) {
  const [quote, setQuote] = useState<{ text: string; author: string } | null>(null)
  const [smsState, setSmsState] = useState<Record<string, SmsState>>({})
  const [emailState, setEmailState] = useState<Record<string, EmailState>>({})
  const [sentEmailIds, setSentEmailIds] = useState<Set<string>>(new Set())
  const [sentSmsIds, setSentSmsIds] = useState<Set<string>>(new Set())
  // "email:<patientId>" / "sms:<patientId>" → who greeted them and when
  const [greetedBy, setGreetedBy] = useState<Record<string, { by: string | null; at: string }>>({})
  const [slotAlerts, setSlotAlerts] = useState<{ nearingNoShow: any[]; subjectNoShow: any[]; nearingCancel: any[]; subjectCancel: any[] }>({ nearingNoShow: [], subjectNoShow: [], nearingCancel: [], subjectCancel: [] })
  // Display-only: whether the slot-alert fetch has answered, and which of its
  // two reads failed. Before this the watchlist said "Nobody is at or near slot
  // removal" while still loading, and again when the request failed.
  const [slotLoaded, setSlotLoaded] = useState(false)
  const [slotFailed, setSlotFailed] = useState<{ noshow: boolean; cancel: boolean }>({ noshow: false, cancel: false })
  const [slotAttempt, setSlotAttempt] = useState(0)
  // Cancellation fees owed and not yet collected, read out of the same
  // cancellation fetch the watchlist uses. `checked: false` means the
  // Accounting Hub could not be reached — which must read as "not checked",
  // never as "nothing owed", or front desk stops chasing money on an outage.
  const [feesOwed, setFeesOwed] = useState<{ checked: boolean; rows: FeeOwedRow[] } | null>(null)
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null)
  // Display-only summaries reported up by the cards that load their own data.
  const [waitlist, setWaitlist] = useState<WaitlistSummary | null>(null)
  const [prSummary, setPrSummary] = useState<ProgressSummary>({ loading: true, error: null, count: 0, paidUnsent: 0, staleUnsent: 0 })
  const [plushSummary, setPlushSummary] = useState<PlushSummary>({ loading: true, error: null, pending: 0, unplaceable: 0 })
  // Set after mount so the server's clock/time zone never decides the date.
  const [todayLabel, setTodayLabel] = useState<string | null>(null)

  useEffect(() => {
    const reminders = getReminders(branch)
    function checkReminders() {
      const now = new Date()
      const h = now.getHours()
      const m = now.getMinutes()
      for (const r of reminders) {
        if (h === r.triggerHour && m === r.triggerMinute && !isReminderDone(r.id)) {
          setActiveReminder(r)
          break
        }
      }
    }
    checkReminders()
    const interval = setInterval(checkReminders, 30_000)
    return () => clearInterval(interval)
  }, [branch])

  useEffect(() => {
    setQuote(getDailyQuote())
    setTodayLabel(new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    setSentEmailIds(loadSentEmails())
    setSentSmsIds(loadSent('sms'))
    // Server record wins: union it with the local in-flight marks so a send
    // made by anyone, on any machine, shows as already greeted here.
    fetch('/api/birthday/greetings')
      .then(r => r.ok ? r.json() : null)
      .then((d: { email?: string[]; sms?: string[]; detail?: Record<string, { by: string | null; at: string }> } | null) => {
        if (!d) return
        setSentEmailIds(prev => new Set([...prev, ...(d.email ?? [])]))
        setSentSmsIds(prev => new Set([...prev, ...(d.sms ?? [])]))
        setGreetedBy(d.detail ?? {})
      })
      .catch(() => {})
  }, [branch])

  useEffect(() => {
    // Fetch slot removal alerts. `failed` is a display-only marker so the
    // cards can say "couldn't load" instead of reporting an all-clear; the
    // patients array each read yields is exactly what it was before.
    const branchParam = branch === 'SBEA' ? 'SANDBOX_EAST' : branch === 'SBGH' ? 'SANDBOX_GREENHILLS' : ''
    Promise.all([
      fetch(`/api/patient-relationship?tab=noshow&branch=${branchParam}`).then(r => r.json().then(d => r.ok ? d : { ...d, failed: true })).catch(() => ({ patients: [], failed: true })),
      fetch(`/api/patient-relationship?tab=cancellation&branch=${branchParam}`).then(r => r.json().then(d => r.ok ? d : { ...d, failed: true })).catch(() => ({ patients: [], failed: true })),
    ]).then(([ns, ca]) => {
      setSlotAlerts({
        nearingNoShow: (ns.patients || []).filter((p: any) => p.noShowCount === 2),
        subjectNoShow: (ns.patients || []).filter((p: any) => p.noShowCount >= 3),
        nearingCancel: (ca.patients || []).filter((p: any) => p.cancellationsUsed >= 10 && p.cancellationsUsed < 12),
        subjectCancel: (ca.patients || []).filter((p: any) => p.cancellationsUsed >= 12),
      })
      setSlotFailed({ noshow: !!ns.failed, cancel: !!ca.failed })
      setSlotLoaded(true)

      // A fee is owed on the 3rd cancellation onward inside the rolling
      // 6-month window; the API marks those logs feeBearing and attaches the
      // POS payment that settled each one, where there is one. What is left is
      // money the clinic is still owed — and it was visible nowhere except by
      // expanding a patient's log list one patient at a time.
      //
      // feeLookup.ok must be true, not merely not-false: a failed fetch gives
      // us no feeLookup at all, and treating that as a clean check would
      // report "nothing outstanding" during an Accounting Hub outage.
      const rows: FeeOwedRow[] = (ca.patients || [])
        .map((p: any) => {
          const unpaid = (p.logs || []).filter((l: any) => !l.deletedAt && l.feeBearing && !l.feePaid)
          if (unpaid.length === 0) return null
          const oldest = unpaid.reduce((a: any, b: any) =>
            new Date(a.createdAt) <= new Date(b.createdAt) ? a : b)
          return {
            id: p.id,
            name: `${p.lastName}, ${p.firstName}`,
            count: unpaid.length,
            oldestAt: oldest.createdAt,
          }
        })
        .filter(Boolean) as FeeOwedRow[]
      // Longest outstanding first — that is the one that gets harder to collect
      // with every week it waits.
      rows.sort((a, b) => new Date(a.oldestAt).getTime() - new Date(b.oldestAt).getTime())
      setFeesOwed({ checked: ca.feeLookup?.ok === true, rows })
    })
  }, [branch, slotAttempt])

  const retrySlotAlerts = () => {
    setSlotLoaded(false)
    setFeesOwed(null)
    setSlotAttempt(n => n + 1)
  }

  const branchLabel =
    branch === 'SBEA' ? 'Aura Health East'
    : branch === 'SBGH' ? 'Aura Health Greenhills'
    : undefined

  // ── Display-only tallies for the header line and the attention row ──
  const slotRows = [
    { key: 'sn', label: 'No-shows — at limit',      list: slotAlerts.subjectNoShow, out: 3,  field: 'noShowCount',       tone: 'danger' as const },
    { key: 'nn', label: 'No-shows — nearing',       list: slotAlerts.nearingNoShow, out: 3,  field: 'noShowCount',       tone: 'warn' as const },
    { key: 'sc', label: 'Cancellations — at limit', list: slotAlerts.subjectCancel, out: 12, field: 'cancellationsUsed', tone: 'danger' as const },
    { key: 'nc', label: 'Cancellations — nearing',  list: slotAlerts.nearingCancel, out: 12, field: 'cancellationsUsed', tone: 'warn' as const },
  ]
  const slotTotal = slotRows.reduce((n, r) => n + r.list.length, 0)
  const slotAtLimit = slotAlerts.subjectNoShow.length + slotAlerts.subjectCancel.length
  const slotAnyFailed = slotFailed.noshow || slotFailed.cancel

  const feeTotal = feesOwed?.rows.reduce((n, r) => n + r.count, 0) ?? 0
  const feeOldestDays = feesOwed?.rows[0] ? daysSince(feesOwed.rows[0].oldestAt) : null

  const waitUntouched = waitlist?.ok ? (waitlist.untouched ?? 0) : 0
  const waitStale = waitlist?.ok ? (waitlist.stale ?? 0) : 0

  const bdayGreeted = birthdayPatients.filter(p => sentEmailIds.has(p.id) || sentSmsIds.has(p.id)).length

  const summaryParts: string[] = []
  if (birthdayPatients.length > 0) summaryParts.push(`${plural(birthdayPatients.length, 'birthday')} today`)
  if (waitUntouched > 0) summaryParts.push(`${plural(waitUntouched, 'enquiry', 'enquiries')} to chase`)
  if (feesOwed?.checked && feeTotal > 0) summaryParts.push(`${plural(feeTotal, 'cancellation fee')} to collect`)
  if (slotLoaded && slotTotal > 0) summaryParts.push(`${slotTotal} on the slot-removal watchlist`)
  if (!prSummary.loading && prSummary.count > 0) summaryParts.push(`${plural(prSummary.count, 'progress report')} pending`)
  if (!plushSummary.loading && plushSummary.pending > 0) summaryParts.push(`${plural(plushSummary.pending, 'plush toy')} to hand over`)
  const stillLoading = !slotLoaded || waitlist === null || prSummary.loading || plushSummary.loading

  return (
    <div className="max-w-[1200px] mx-auto min-w-0 space-y-6">
      {/* ── Timed reminder popup ── */}
      {activeReminder && (
        <ReminderModal
          reminder={activeReminder}
          onDismiss={() => setActiveReminder(null)}
        />
      )}

      {/* ── Header: a compact greeting, not a hero. Logo beside the greeting,
          date + branch, and one line saying what is waiting. ── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-4 min-w-0">
            <Image
              src="/aura-health-logo.png"
              alt="Aura Health Rehab Clinic"
              width={72}
              height={40}
              className="hidden sm:block flex-shrink-0"
              style={{ objectFit: 'contain' }}
              unoptimized
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
                {todayLabel ?? 'Welcome back'}
              </p>
              <h1 className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Good {getGreeting()}, <span style={{ color: 'var(--teal)' }}>{name ?? 'there'}</span>
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }} aria-live="polite">
                {summaryParts.length > 0
                  ? summaryParts.join(' · ')
                  : stillLoading ? 'Checking what needs you today…' : 'Nothing is waiting on you — all caught up.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {branchLabel && (
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold"
                style={{ background: SUBTLE_BG, border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}>
                <Building2 size={13} style={{ color: 'var(--teal)' }} />
                {branchLabel}
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Codepaca.svg" alt="Aura alpaca mascot" width={52} height={52} className="hidden sm:block" style={{ opacity: 0.9 }} />
          </div>
        </div>

        {/* The quote stays — it is the one warm thing on the page — as a quiet
            line rather than a card competing with the work. */}
        {quote && (
          <p className="text-[13px] leading-relaxed italic pl-3 max-w-[80ch]"
            style={{ color: '#4a6b64', borderLeft: '2px solid rgba(74,128,115,0.35)' }}>
            &ldquo;{quote.text}&rdquo;
            <span className="not-italic font-semibold" style={{ color: '#4a8073' }}> &mdash; {quote.author}</span>
          </p>
        )}
      </header>

      {/* ── Needs your attention ── one tile per work queue on this page. Six
          tiles: 3 across from 1280px, 2 on tablet, 1 on a phone — no orphan. */}
      <section aria-labelledby="attention-heading">
        <SectionHeading id="attention-heading" title="Needs your attention" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <AttentionTile
            href="/patient-relationship?tab=cancellation"
            icon={<Banknote size={17} />}
            label="Cancellation fees to collect"
            count={feeTotal}
            state={feesOwed === null ? 'loading' : !feesOwed.checked ? 'error' : 'ready'}
            tone={feeTotal > 0 ? 'warn' : 'clear'}
            sub={feesOwed && !feesOwed.checked ? 'Not checked — the Accounting Hub did not answer'
              : feeTotal > 0 ? `${plural(feesOwed?.rows.length ?? 0, 'patient')}${feeOldestDays !== null && Number.isFinite(feeOldestDays) ? ` · oldest ${feeOldestDays}d` : ''}`
              : 'All caught up'}
          />
          <AttentionTile
            href="/patient-relationship?tab=waitlist"
            icon={<UserSearch size={17} />}
            label="Waitlist to chase"
            count={waitUntouched}
            state={waitlist === null ? 'loading' : !waitlist.ok ? 'error' : 'ready'}
            tone={waitStale > 0 ? 'warn' : waitUntouched > 0 ? 'info' : 'clear'}
            sub={waitlist && !waitlist.ok ? (waitlist.warning ?? 'The waitlist could not be read.')
              : waitUntouched > 0
                ? (waitStale > 0 ? `${waitStale} waiting over ${waitlist?.staleDays ?? 30} days` : 'Not enrolled and not tagged')
                  + (waitlist?.partial?.length ? ' · incomplete' : '')
                : 'All caught up'}
          />
          <AttentionTile
            href="#slot-watchlist"
            icon={<AlertTriangle size={17} />}
            label="Slot removal watchlist"
            count={slotTotal}
            state={!slotLoaded ? 'loading' : slotAnyFailed ? 'error' : 'ready'}
            tone={slotAtLimit > 0 ? 'danger' : slotTotal > 0 ? 'warn' : 'clear'}
            sub={slotAnyFailed ? 'Couldn’t load — open to try again'
              : slotTotal > 0 ? `${slotAtLimit} at limit · ${slotTotal - slotAtLimit} nearing`
              : 'Nobody at or near the limit'}
          />
          <AttentionTile
            href="#progress-reports"
            icon={<FileText size={17} />}
            label="Progress reports awaiting payment + email"
            count={prSummary.count}
            state={prSummary.loading ? 'loading' : prSummary.error ? 'error' : 'ready'}
            tone={prSummary.staleUnsent > 0 ? 'danger' : prSummary.count > 0 ? 'warn' : 'clear'}
            sub={prSummary.error ? prSummary.error
              : prSummary.count > 0
                ? (prSummary.paidUnsent > 0 ? `${prSummary.paidUnsent} paid, not emailed yet` : 'Awaiting payment')
                : 'All caught up'}
          />
          <AttentionTile
            href="#birthdays"
            icon={<Cake size={17} />}
            label="Birthdays today"
            count={birthdayPatients.length}
            state="ready"
            tone={birthdayPatients.length > 0 && bdayGreeted < birthdayPatients.length ? 'brand' : 'clear'}
            sub={birthdayPatients.length === 0 ? 'No patient birthdays today'
              : bdayGreeted >= birthdayPatients.length ? 'Everyone has been greeted'
              : `${bdayGreeted} of ${birthdayPatients.length} greeted`}
          />
          <AttentionTile
            href="#plush-toy"
            icon={<Gift size={17} />}
            label="Plush toys to hand over"
            count={plushSummary.pending}
            state={plushSummary.loading ? 'loading' : plushSummary.error ? 'error' : 'ready'}
            tone={plushSummary.unplaceable > 0 ? 'warn' : plushSummary.pending > 0 ? 'brand' : 'clear'}
            sub={plushSummary.error ? plushSummary.error
              : plushSummary.unplaceable > 0 ? `${plural(plushSummary.unplaceable, 'VIP wallet')} not matched to a patient`
              : plushSummary.pending > 0 ? 'VIP card or 100th session'
              : 'All caught up'}
          />
        </div>
      </section>

      {/* ── Today ── */}
      <section aria-labelledby="today-heading">
        <SectionHeading id="today-heading" title="Today" sub={todayLabel ?? undefined} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ── Birthday Reminder ── */}
          <div id="birthdays" className="min-w-0 scroll-mt-4">
            <DashCard
              title="Birthdays today"
              icon={<Cake size={16} />}
              description={`Patients of ${branchLabel ?? 'this branch'} whose birthday is today.`}
              action={<CountChip n={birthdayPatients.length} tone={birthdayPatients.length > 0 ? 'brand' : 'clear'} />}
              flush
              footer={birthdayPatients.length > 0 ? (
                <>&ldquo;Send email&rdquo; sends a birthday greeting to the patient&apos;s email (requires email on file). &ldquo;Send SMS&rdquo; sends it to their phone (requires phone number on file).</>
              ) : undefined}
            >
              <div className="px-5 py-3">
                {birthdayPatients.length === 0 ? (
                  <CaughtUp title="No patient birthdays today" hint="Check back tomorrow." />
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
                    {birthdayPatients.map(p => {
                      // Every row on this card IS today now, so there is nothing to
                      // compare. The old check read a local-midnight timestamp with
                      // getUTC*, which in a UTC+8 clinic resolved to the previous day
                      // — a birthday happening today was labelled "Thu, Sep 3".
                      const dayLabel = 'Today! 🎉'
                      const clinicName =
                        branch === 'SBEA' ? 'Aura Health East'
                        : branch === 'SBGH' ? 'Aura Health Greenhills'
                        : 'Aura Health Rehab Clinic'
                      const msg = `Happy Birthday, ${p.firstName}! 🎂 Wishing you a wonderful day filled with joy and good health! From all of us at ${clinicName}. 💚`
                      const sms = smsState[p.id] ?? 'idle'
                      const email = emailState[p.id] ?? 'idle'
                      const alreadySent = sentEmailIds.has(p.id)
                      const alreadySentSms = sentSmsIds.has(p.id)
                      // Name the sender on the button, so "already greeted" is a fact
                      // someone can act on rather than a green box of unknown origin.
                      const greetedNote = (ch: 'email' | 'sms') => {
                        const g = greetedBy[`${ch}:${p.id}`]
                        if (!g) return undefined
                        const when = new Date(g.at).toLocaleString()
                        return g.by ? `Already sent by ${g.by} — ${when}` : `Already sent — ${when}`
                      }

                      async function sendSms() {
                        // Mark in localStorage immediately — prevents duplicate sends if
                        // the user refreshes while the request is still in-flight
                        markSent('sms', p.id)
                        setSentSmsIds(loadSent('sms'))
                        setSmsState(s => ({ ...s, [p.id]: 'sending' }))
                        try {
                          const res = await fetch('/api/birthday/send-sms', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ patientId: p.id, branch, message: msg }),
                          })
                          if (res.ok) {
                            setSmsState(s => ({ ...s, [p.id]: 'sent' }))
                          } else {
                            // Definitive server error — SMS was NOT sent; allow retry
                            const d = await res.json().catch(() => ({}))
                            setSmsState(s => ({ ...s, [p.id]: 'error' }))
                            // Remove the optimistic mark so the user can try again
                            try {
                              const sent = loadSent('sms')
                              sent.delete(p.id)
                              localStorage.setItem(storageKey('sms'), JSON.stringify([...sent]))
                              setSentSmsIds(new Set(sent))
                            } catch {}
                            if (d.error) alert(`SMS failed: ${d.error}`)
                          }
                        } catch {
                          setSmsState(s => ({ ...s, [p.id]: 'error' }))
                          // Network/timeout error — SMS status unknown; keep the mark
                          // to prevent accidental duplicates (check httpSMS dashboard)
                        }
                      }

                      async function sendEmail(force = false) {
                        if (alreadySent && !force) {
                          if (!confirm(`A birthday email was already sent to ${p.firstName} today. Send again?`)) return
                          if (!confirm('Are you sure? This will send a second birthday email.')) return
                        }
                        setEmailState(s => ({ ...s, [p.id]: 'sending' }))
                        try {
                          const res = await fetch('/api/birthday/send-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ patientId: p.id, branch }),
                          })
                          if (res.ok) {
                            setEmailState(s => ({ ...s, [p.id]: 'sent' }))
                            markEmailSent(p.id)
                            setSentEmailIds(loadSentEmails())
                          } else {
                            const d = await res.json().catch(() => ({}))
                            setEmailState(s => ({ ...s, [p.id]: 'error' }))
                            alert(d.error || 'Failed to send email.')
                          }
                        } catch {
                          setEmailState(s => ({ ...s, [p.id]: 'error' }))
                        }
                      }

                      const emailDone = alreadySent || email === 'sent'
                      const smsDone = alreadySentSms || sms === 'sent'
                      const doneStyle: CSSProperties = { background: '#DFF5E4', color: '#166534', border: '1px solid #B6E5C2' }
                      const failStyle: CSSProperties = { background: '#FDE4E4', color: '#991B1B', border: '1px solid #F5C2C2' }

                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" style={{ borderColor: 'var(--light-gray)' }}>
                          <div className="flex-1 min-w-[140px]">
                            <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>
                              {p.firstName} {p.lastName}
                            </p>
                            <p className="text-xs font-medium" style={{ color: 'var(--teal)' }}>{dayLabel}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Send Email */}
                            <button
                              type="button"
                              onClick={() => sendEmail(false)}
                              disabled={email === 'sending'}
                              title={
                                alreadySent || email === 'sent'
                                  ? (greetedNote('email') ?? 'Email already sent — click to resend')
                                  : 'Send birthday greeting email'
                              }
                              className={`${BTN_SM} ${emailDone || email === 'error' ? '' : 'hover:bg-gray-50'}`}
                              style={{
                                ...(emailDone ? doneStyle : email === 'error' ? failStyle
                                  : { background: '#fff', color: 'var(--teal)', border: '1px solid var(--light-gray)' }),
                                cursor: email === 'sending' ? 'wait' : 'pointer',
                                opacity: email === 'sending' ? 0.7 : 1,
                              }}
                            >
                              {email === 'sending' ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                                : emailDone ? <><Check size={12} /> Email sent</>
                                : email === 'error' ? <><X size={12} /> Failed</>
                                : <><Mail size={12} /> Send email</>}
                            </button>
                            {/* Send SMS */}
                            {p.hasPhone && (
                              <button
                                type="button"
                                onClick={sendSms}
                                disabled={sms === 'sending' || sms === 'sent' || alreadySentSms}
                                title={sms === 'error' ? 'Failed — tap to retry' : alreadySentSms ? (greetedNote('sms') ?? 'SMS already sent') : 'Send SMS birthday greeting'}
                                className={`${BTN_SM} ${smsDone || sms === 'error' ? '' : 'text-white hover:opacity-90'}`}
                                style={{
                                  ...(smsDone ? doneStyle : sms === 'error' ? failStyle
                                    : { background: 'var(--teal)', border: '1px solid var(--teal)' }),
                                  cursor: (sms === 'sending' || sms === 'sent' || alreadySentSms) ? 'default' : 'pointer',
                                  opacity: sms === 'sending' ? 0.7 : 1,
                                }}
                              >
                                {sms === 'sending' ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                                  : smsDone ? <><Check size={12} /> SMS sent</>
                                  : sms === 'error' ? <><X size={12} /> Failed</>
                                  : <><Smartphone size={12} /> Send SMS</>}
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </DashCard>
          </div>

          <TodayCheckpoints branch={branch} key={activeReminder?.id ?? 'none'} />
        </div>
      </section>

      {/* ── Follow-ups: the work queues behind the tiles above. Two columns,
          each card at the top of its own cell, so nothing is left as a void. ── */}
      <section aria-labelledby="followups-heading">
        <SectionHeading id="followups-heading" title="Follow-ups" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* Cancellation fees owed — reads out of the same cancellation data as
              the watchlist; the two answer consecutive questions: who is near
              losing their slot, and who still owes for the cancellations that
              got them there. */}
          <div id="fees" className="min-w-0 scroll-mt-4">
            <FeesOwedCard data={feesOwed} onRetry={retrySlotAlerts} />
          </div>

          {/* ── Waitlist enquiries nobody has picked up ──
              These are the only items on the page with a clock on them that
              nothing else surfaces — the 11am/4pm popup says "go and check the
              waitlist" without ever saying whether there is anything in it. */}
          <div id="waitlist" className="min-w-0 scroll-mt-4">
            <WaitlistToChase branch={branch} onSummary={setWaitlist} />
          </div>

          {/* One watchlist, not four cards. Severity is carried by a coloured
              rail and the count, which is what makes a real entry jump out;
              when everything is clear it collapses to a single line. */}
          <div id="slot-watchlist" className="min-w-0 scroll-mt-4">
            <DashCard
              title="Slot removal watchlist"
              icon={<AlertTriangle size={16} />}
              description="No-shows count out of 3, cancellations out of 12."
              action={slotLoaded && !slotAnyFailed ? <CountChip n={slotTotal} tone={slotAtLimit > 0 ? 'danger' : slotTotal > 0 ? 'warn' : 'clear'} /> : undefined}
            >
              {!slotLoaded ? (
                <RowsSkeleton rows={3} />
              ) : slotFailed.noshow && slotFailed.cancel ? (
                <CardError message="Couldn’t load no-show and cancellation counts." onRetry={retrySlotAlerts} />
              ) : (
                <div className="space-y-3">
                  {slotAnyFailed && (
                    <CardError
                      message={slotFailed.noshow ? 'No-show counts could not be loaded — this list is incomplete.' : 'Cancellation counts could not be loaded — this list is incomplete.'}
                      onRetry={retrySlotAlerts}
                    />
                  )}
                  {slotTotal === 0 ? (
                    !slotAnyFailed && <CaughtUp hint="Nobody is at or near slot removal." />
                  ) : (
                    <>
                      {slotRows.filter(r => r.list.length > 0).map(r => {
                        const t = TONES[r.tone]
                        return (
                          <div key={r.key} className="rounded-lg pl-3 pr-3 py-2" style={{ borderLeft: `3px solid ${t.fg}`, background: t.bg }}>
                            <p className={`${SECTION_LABEL} mb-1`} style={{ color: t.fg }}>
                              {r.label} ({r.list.length})
                            </p>
                            <ul>
                              {r.list.map((p: any) => (
                                <li key={p.id} className="flex items-baseline justify-between gap-3 py-0.5 text-[13px] font-semibold" style={{ color: 'var(--charcoal)' }}>
                                  <span className="min-w-0 break-words">{p.lastName}, {p.firstName}</span>
                                  <span className="flex-shrink-0 text-xs font-bold tabular-nums" style={{ color: t.fg }}>
                                    {p[r.field]}/{r.out}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                      {/* Cleared categories are named but not given a box each —
                          knowing cancellations are clear still matters, it just
                          doesn't warrant the same weight as a real flag. */}
                      {slotRows.some(r => r.list.length === 0) && (
                        <p className="text-xs" style={{ color: 'var(--mid-gray)' }}>
                          Clear: {slotRows.filter(r => r.list.length === 0).map(r => r.label).join(' · ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </DashCard>
          </div>

          {/* Progress Reports — pending PRs awaiting Paid + Email */}
          <div id="progress-reports" className="min-w-0 scroll-mt-4">
            <PendingProgressReports onSummary={setPrSummary} />
          </div>

          {/* Perk actions — real work, so it sits with the work. */}
          <div id="plush-toy" className="min-w-0 scroll-mt-4">
            <PlushToyEligible branch={branch} seesAllBranches={seesAllBranches} onSummary={setPlushSummary} />
          </div>

          {/* Past Progress Reports — searchable history */}
          <div className="min-w-0">
            <PastProgressReports />
          </div>
        </div>
      </section>

      {/* ── Reference: read once and remembered, so they come after the work.
          Two equal columns, one per row on a narrow screen. ── */}
      <section aria-labelledby="reference-heading">
        <SectionHeading id="reference-heading" title="Front desk reference" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <DeskShortcutCard />
          <PactCancellationReminder />
        </div>
      </section>
    </div>
  )
}


// ── Cancellation fees still to collect ──────────────────────────────────────
// Derived from the cancellation fetch the watchlist already makes, so this card
// costs nothing extra. It answers a question that previously took opening each
// patient's log list in turn: who owes a cancellation fee that has not been
// paid at the till.
//
// Days, not pesos: the fee amount lives on the POS line, not on the
// cancellation, so a figure here would be one we made up.
function FeesOwedCard({ data, onRetry }: { data: { checked: boolean; rows: FeeOwedRow[] } | null; onRetry?: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const LIMIT = 6

  const totalFees = data?.rows.reduce((n, r) => n + r.count, 0) ?? 0
  const shown = data ? (showAll ? data.rows : data.rows.slice(0, LIMIT)) : []

  return (
    <DashCard
      title="Cancellation fees to collect"
      icon={<Banknote size={16} />}
      description="Fees owed from the 3rd cancellation in 6 months, not yet paid."
      action={<div className="flex items-center gap-3">
        {data?.checked && totalFees > 0 && <CountChip n={totalFees} tone="warn" />}
        <CardLink href="/patient-relationship?tab=cancellation">Open</CardLink>
      </div>}
      footer={data?.checked && data.rows.length > 0
        ? 'Longest outstanding first. Collect at the POS — the till then asks which cancellation it settles.'
        : undefined}
    >
      {data === null ? (
        <RowsSkeleton rows={3} />
      ) : !data.checked ? (
        // Never a reassuring zero on an outage: front desk must know the question
        // went unanswered, or they stop collecting on the day the hub is down.
        <CardError message="Not checked — the Accounting Hub did not answer, so paid fees could not be read." onRetry={onRetry} />
      ) : data.rows.length === 0 ? (
        <CaughtUp hint="Every cancellation fee owed has been paid." />
      ) : (
        <>
          <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
            {shown.map(r => {
              const days = Math.floor((Date.now() - new Date(r.oldestAt).getTime()) / 86_400_000)
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2" style={{ borderColor: 'var(--light-gray)' }}>
                  <span className="min-w-0 text-[13px] font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{r.name}</span>
                  <Pill tone="warn">
                    {r.count > 1 ? `${r.count} fees · ` : ''}{Number.isFinite(days) ? `${days}d` : '—'}
                  </Pill>
                </li>
              )
            })}
          </ul>
          {data.rows.length > LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="mt-2 text-xs font-semibold hover:underline"
              style={{ color: 'var(--teal)' }}
            >
              {showAll ? 'Show fewer' : `Show all ${data.rows.length} patients`}
            </button>
          )}
        </>
      )}
    </DashCard>
  )
}

// ── Waitlist enquiries nobody has dealt with ────────────────────────────────
// The Waitlist tab colours enrolled enquiries green and "will no longer avail"
// red; everything else is a plain row among hundreds, which is how a family who
// filled in the form last week goes uncalled. This is only that remainder.
interface WaitlistSummary {
  ok: boolean
  warning?: string
  total?: number
  untouched?: number
  converted?: number
  declined?: number
  stale?: number
  staleDays?: number
  newest?: { name: string; form: string; branch: string; days: number | null }[]
  partial?: string[]
}

function WaitlistToChase({ branch, onSummary }: { branch?: string; onSummary?: (d: WaitlistSummary | null) => void }) {
  const [data, setData] = useState<WaitlistSummary | null>(null)
  // Display-only: bumping this re-runs the same fetch from "Try again".
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const branchParam = branch === 'SBEA' ? 'SANDBOX_EAST' : branch === 'SBGH' ? 'SANDBOX_GREENHILLS' : ''
    fetch(`/api/dashboard/waitlist-summary?branch=${branchParam}`)
      .then(r => r.json())
      .then((d: WaitlistSummary) => setData(d))
      .catch(() => setData({ ok: false, warning: 'Could not load the waitlist.' }))
  }, [branch, attempt])

  useEffect(() => { onSummary?.(data) }, [data, onSummary])

  const untouched = data?.ok ? (data.untouched ?? 0) : 0

  return (
    <DashCard
      title="Waitlist to chase"
      icon={<UserSearch size={16} />}
      description="Enquiries not enrolled and not tagged, newest first."
      action={<div className="flex items-center gap-3">
        {untouched > 0 && <CountChip n={untouched} tone={(data?.stale ?? 0) > 0 ? 'warn' : 'info'} />}
        <CardLink href="/patient-relationship?tab=waitlist">Open</CardLink>
      </div>}
      footer={data?.ok && untouched > 0 && (!!data.stale || !!data.partial?.length) ? (
        <>
          {!!data.stale && (
            <p>{data.stale} of them have been waiting more than {data.staleDays ?? 30} days.</p>
          )}
          {/* One intake form HR would not answer for looks exactly like a quiet
              week, so a partial read says so rather than quietly undercounting. */}
          {!!data.partial?.length && (
            <p style={{ color: '#92400E' }}>Incomplete: no response from HR for {data.partial.join(', ')}.</p>
          )}
        </>
      ) : undefined}
    >
      {data === null ? (
        <RowsSkeleton rows={4} />
      ) : !data.ok ? (
        <CardError message={data.warning ?? 'The waitlist could not be read.'} onRetry={() => { setData(null); setAttempt(n => n + 1) }} />
      ) : untouched === 0 ? (
        <CaughtUp hint={`All ${data.total ?? 0} enquiries are enrolled or tagged.`} />
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
          {(data.newest ?? []).map((e, i) => (
            <li key={`${e.name}-${i}`} className="flex items-center justify-between gap-3 py-2" style={{ borderColor: 'var(--light-gray)' }}>
              <span className="min-w-0 text-[13px] font-semibold break-words" style={{ color: 'var(--charcoal)' }}>{e.name}</span>
              <Pill tone={e.days !== null && e.days > (data.staleDays ?? 30) ? 'warn' : 'info'}>
                {e.days === null ? '—' : e.days === 0 ? 'today' : `${e.days}d`}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  )
}

// ── Plush Toy Perk (VIP wallet holders + 100-session milestone) ─────────────
// Milestone counts CONFIRMED Schedule sessions since 2026-04-01 — decking-
// originated visits are already included, since a decking-assigned patient's
// visit only becomes a real dated, confirmable session once front desk adds
// it to Clinic Schedule (DeckingSlot itself is just the recurring weekly
// template with no per-date attendance state of its own).
interface PlushToyCandidate {
  id: string
  firstName: string
  lastName: string
  isVip: boolean
  isMilestone: boolean
  /** ISO timestamp once handed over; null = still pending. */
  givenAt: string | null
  givenBy: string | null
  /** 'East' | 'Greenhills' — only populated in the all-branches view. */
  branch: string | null
}

function PlushToyEligible({ branch, seesAllBranches, onSummary }: { branch?: string; seesAllBranches?: boolean; onSummary?: (s: PlushSummary) => void }) {
  const [list, setList] = useState<PlushToyCandidate[]>([])
  // VIP wallets in Accounting that match no patient record here — usually a
  // patient re-registered under a new id. Shown rather than dropped: front desk
  // were told a name was VIP and then never saw it on this list.
  const [unplaceable, setUnplaceable] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Display-only: a failed load used to read as "None".
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    // A main admin isn't scoped to one clinic — ask for both branches rather
    // than the single branch the rest of this dashboard is pinned to.
    const scope = seesAllBranches ? 'ALL' : branch
    if (!scope) { setLoading(false); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/plush-toy-eligible?branch=${scope}`)
      const d = await r.json()
      setList(d.eligible || [])
      setUnplaceable(d.unplaceableVip || [])
      setError(r.ok ? null : (d.error || 'Couldn’t load the plush toy list.'))
    } catch {
      setError('Couldn’t load the plush toy list.')
    } finally { setLoading(false) }
  }
  React.useEffect(() => { load() }, [branch, seesAllBranches]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markGiven(c: PlushToyCandidate) {
    if (!confirm(`Confirm: give the Aura the Alpaca plush toy to ${c.firstName} ${c.lastName}?`)) return
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/patients/${c.id}/plush-toy`, { method: 'PATCH' })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed') }
      const d = await r.json()
      // Flip the row to its given state rather than hiding it. The server is
      // the source of truth (Patient.plushToyGivenAt), so this same green card
      // reappears for every user, on every sign-in, indefinitely — which is
      // what stops a second toy being handed out.
      setList(prev => prev.map(x => x.id === c.id
        ? { ...x, givenAt: d.plushToyGivenAt ?? new Date().toISOString(), givenBy: d.plushToyGivenBy ?? null }
        : x))
    } catch (e) { alert((e as Error).message) }
    finally { setBusyId(null) }
  }

  // Header count shows what still needs action, not the total on screen.
  const pendingCount = list.filter(c => !c.givenAt).length

  useEffect(() => {
    onSummary?.({ loading, error, pending: pendingCount, unplaceable: unplaceable.length })
  }, [loading, error, pendingCount, unplaceable.length, onSummary])

  const chip = (given: boolean, label: string) => (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase leading-none"
      style={{ background: given ? '#DCFCE7' : '#EDE9FE', color: given ? '#166534' : '#6D28D9' }}>
      {label}
    </span>
  )

  return (
    <DashCard
      title="Plush toy perk"
      icon={<Gift size={16} />}
      description="VIP card holders and patients at their 100th session."
      action={!loading && !error ? <CountChip n={pendingCount} tone={pendingCount > 0 ? 'brand' : 'clear'} /> : undefined}
    >
      <div className="space-y-3">
        {!loading && unplaceable.length > 0 && (
          <div className="rounded-lg px-3 py-2.5" style={{ background: '#FFF7E6', border: '1px solid #F3D9A5' }}>
            <p className="text-xs font-bold" style={{ color: '#8A5A00' }}>
              {unplaceable.length} VIP wallet{unplaceable.length === 1 ? '' : 's'} not matched to a patient record
            </p>
            <p className="text-xs mt-0.5 leading-snug" style={{ color: '#8A5A00' }}>
              {unplaceable.join(', ')} — the wallet in Accounting points at a patient record that no longer
              exists here, usually because they were registered again. Ask Accounting to re-link the wallet.
            </p>
          </div>
        )}
        {loading ? (
          <RowsSkeleton rows={2} />
        ) : error ? (
          <CardError message={error} onRetry={load} busy={loading} />
        ) : list.length === 0 ? (
          <CaughtUp hint="Nobody is due a plush toy right now." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--light-gray)' }}>
            {list.map(c => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" style={{ borderColor: 'var(--light-gray)' }}>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: c.givenAt ? '#166534' : 'var(--charcoal)' }}>
                    {c.lastName}, {c.firstName}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.isVip && chip(!!c.givenAt, 'VIP Card')}
                    {c.isMilestone && chip(!!c.givenAt, '100th Session')}
                    {seesAllBranches && c.branch && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase leading-none"
                        style={{ background: '#F1F5F9', color: '#475569' }}>
                        {branchLabel(c.branch)}
                      </span>
                    )}
                  </div>
                </div>
                {c.givenAt ? (
                  // Locked record — no onClick, so it cannot be re-triggered.
                  <div
                    title={`Given${c.givenBy ? ' by ' + c.givenBy : ''} on ${new Date(c.givenAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`}
                    className="rounded-lg px-2.5 py-1.5 text-right cursor-default"
                    style={{ background: '#DFF5E4', border: '1px solid #B6E5C2', color: '#166534' }}
                  >
                    <p className="text-xs font-bold inline-flex items-center gap-1"><Check size={12} /> Plush toy given</p>
                    <p className="text-[10.5px] font-medium opacity-90">
                      {new Date(c.givenAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {c.givenBy ? ` · ${c.givenBy}` : ''}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => markGiven(c)}
                    disabled={busyId === c.id}
                    className={`${BTN_SM} text-white hover:opacity-90`}
                    style={{ background: 'var(--teal)', opacity: busyId === c.id ? 0.6 : 1, cursor: busyId === c.id ? 'not-allowed' : 'pointer' }}
                  >
                    <Gift size={12} /> Mark plush toy as given
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashCard>
  )
}

// ── Pending Progress Reports (awaiting payment + email) ─────────────────────
interface PRDoc {
  id: string
  fileName: string
  mimeType: string | null
  department: string
  createdAt: string
  informedFrontDeskAt: string | null
  paidForAt: string | null
  paid: boolean
  emailedToPatientAt: string | null
  patient: { id: string; firstName: string; lastName: string; email: string | null }
}

// Days since an ISO timestamp, or null when it is missing.
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function PendingProgressReports({ onSummary }: { onSummary?: (s: ProgressSummary) => void }) {
  const [docs, setDocs] = useState<PRDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Display-only: a failed load used to read as "None".
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/progress-reports?status=pending')
      const d = await r.json()
      setDocs(d.docs || [])
      setError(r.ok ? null : (d.error || 'Couldn’t load progress reports.'))
    } catch {
      setError('Couldn’t load progress reports.')
    } finally { setLoading(false) }
  }
  React.useEffect(() => { load() }, [])

  async function togglePaid(d: PRDoc, paid: boolean) {
    setBusyId(d.id)
    try {
      const r = await fetch(`/api/progress-reports/${d.id}/paid`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed') }
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setBusyId(null) }
  }

  async function sendEmail(d: PRDoc) {
    if (!d.patient.email) { alert('Patient has no email on file'); return }
    if (d.emailedToPatientAt) {
      const when = new Date(d.emailedToPatientAt).toLocaleString()
      if (!confirm(`Already sent on ${when}. Send again?`)) return
    } else {
      if (!confirm(`Send PR to ${d.patient.email}?`)) return
    }
    setBusyId(d.id)
    try {
      const r = await fetch(`/api/progress-reports/${d.id}/email`, { method: 'POST' })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed') }
      alert('Email sent.')
      await load()
    } catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setBusyId(null) }
  }

  // Display-only tallies for the attention row.
  const paidUnsent = docs.filter(d => d.paid && !d.emailedToPatientAt)
  const staleUnsent = paidUnsent.filter(d => { const w = daysSince(d.paidForAt); return w !== null && w >= 7 }).length
  useEffect(() => {
    onSummary?.({ loading, error, count: docs.length, paidUnsent: paidUnsent.length, staleUnsent })
  }, [loading, error, docs.length, paidUnsent.length, staleUnsent, onSummary])

  return (
    <DashCard
      title="Progress reports — awaiting payment + email"
      icon={<FileText size={16} />}
      description="Tick “Paid for PR?” once paid, then email the report to the patient."
      action={!loading && !error ? <CountChip n={docs.length} tone={staleUnsent > 0 ? 'danger' : docs.length > 0 ? 'warn' : 'clear'} /> : undefined}
    >
      {loading && docs.length === 0 ? (
        <RowsSkeleton rows={3} />
      ) : error ? (
        <CardError message={error} onRetry={load} busy={loading} />
      ) : docs.length === 0 ? (
        <CaughtUp hint="No progress reports are waiting on payment or email." />
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--light-gray)', opacity: loading ? 0.6 : 1 }}>
          {docs.map(d => {
            const informed = d.informedFrontDeskAt ? new Date(d.informedFrontDeskAt).toLocaleDateString() : '—'
            return (
              <li key={d.id} className="py-3 first:pt-0 last:pb-0 space-y-2" style={{ borderColor: 'var(--light-gray)' }}>
                {/* Row 1 — name + file info */}
                <div>
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>
                    {d.patient.lastName}, {d.patient.firstName}
                  </p>
                  <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--mid-gray)' }}>
                    <a href={`/api/progress-reports/${d.id}/file`} target="_blank" rel="noreferrer" className="underline font-medium" style={{ color: 'var(--teal)' }}>
                      {d.fileName}
                    </a>
                    {' · '}{d.department}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Pill tone="neutral">Informed {informed}</Pill>
                    {/* Paid but still unsent — the money is in and the report is
                        the outstanding half, so it stays on the panel rather than
                        ageing off it. Past a week the badge turns red so a
                        forgotten report stands out instead of blending in. */}
                    {d.paid && !d.emailedToPatientAt && (() => {
                      const waiting = daysSince(d.paidForAt)
                      const stale = waiting !== null && waiting >= 7
                      return (
                        <Pill tone={stale ? 'danger' : 'warn'}
                          title={waiting === null
                            ? 'Paid, but the report has not been emailed yet'
                            : `Paid ${waiting} day${waiting === 1 ? '' : 's'} ago — not emailed yet`}>
                          Not emailed{waiting !== null && waiting > 0 ? ` · ${waiting}d` : ''}
                        </Pill>
                      )
                    })()}
                  </div>
                </div>
                {/* Row 2 — controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: 'var(--charcoal)' }}>
                    <input
                      type="checkbox"
                      checked={d.paid}
                      onChange={e => togglePaid(d, e.target.checked)}
                      disabled={busyId === d.id}
                      style={{ width: 16, height: 16, accentColor: '#244952' }}
                    />
                    Paid for PR?
                  </label>
                  <button
                    type="button"
                    onClick={() => sendEmail(d)}
                    disabled={!d.paid || busyId === d.id || !d.patient.email}
                    title={!d.patient.email ? 'No email on file' : !d.paid ? 'Tick "Paid for PR?" first' : 'Send PR via email'}
                    className={`${BTN_SM} ${d.paid && d.patient.email ? 'text-white hover:opacity-90' : ''}`}
                    style={{
                      background: d.paid && d.patient.email ? 'var(--teal)' : '#E2E8F0',
                      color: d.paid && d.patient.email ? '#fff' : '#94A3B8',
                      cursor: d.paid && d.patient.email && busyId !== d.id ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {busyId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Email PR
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashCard>
  )
}

// ── Past Progress Reports (already sent, searchable history) ────────────────
function PastProgressReports() {
  const [docs, setDocs] = useState<PRDoc[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Display-only: a failed load used to read as "None yet."
  const [error, setError] = useState<string | null>(null)

  const load = async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: 'past' })
      if (q) params.set('search', q)
      const r = await fetch('/api/progress-reports?' + params.toString())
      const d = await r.json()
      setDocs(d.docs || [])
      setError(r.ok ? null : (d.error || 'Couldn’t load past progress reports.'))
    } catch {
      setError('Couldn’t load past progress reports.')
    } finally { setLoading(false) }
  }

  React.useEffect(() => { load() }, [])

  // Debounced search
  React.useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function resend(d: PRDoc) {
    const when = d.emailedToPatientAt ? new Date(d.emailedToPatientAt).toLocaleString() : '—'
    if (!confirm(`Already sent on ${when}. Send again?`)) return
    setBusyId(d.id)
    try {
      const r = await fetch(`/api/progress-reports/${d.id}/email`, { method: 'POST' })
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Failed') }
      alert('Email re-sent.')
      await load(search.trim())
    } catch (e) { alert('Error: ' + (e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <DashCard
      title="Past progress reports"
      icon={<History size={16} />}
      description={loading ? 'Reports already emailed to patients.' : `${plural(docs.length, 'report')} already emailed to patients.`}
      action={
        <label className="relative block">
          <span className="sr-only">Search past progress reports by patient name</span>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
          <input
            type="text"
            placeholder="Search by patient name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-[200px] max-w-full pl-7 pr-2.5 rounded-lg text-xs outline-none focus:border-[var(--teal)]"
            style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--charcoal)' }}
          />
        </label>
      }
      flush
    >
      <div className="px-5 py-3">
        {loading && docs.length === 0 ? (
          <RowsSkeleton rows={3} />
        ) : error ? (
          <CardError message={error} onRetry={() => load(search.trim())} busy={loading} />
        ) : docs.length === 0 ? (
          <p className="text-[13px] py-2" style={{ color: 'var(--mid-gray)' }}>{search ? 'No matches.' : 'None yet.'}</p>
        ) : (
          <ul className="divide-y max-h-[320px] overflow-y-auto -mx-1 px-1" style={{ borderColor: 'var(--light-gray)', opacity: loading ? 0.6 : 1 }}>
            {docs.map(d => {
              const sent = d.emailedToPatientAt ? new Date(d.emailedToPatientAt).toLocaleDateString() : '—'
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5" style={{ borderColor: 'var(--light-gray)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--charcoal)' }}>
                      {d.patient.lastName}, {d.patient.firstName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      <a href={`/api/progress-reports/${d.id}/file`} target="_blank" rel="noreferrer"
                        className="text-xs underline font-medium break-all" style={{ color: 'var(--teal)' }}>
                        {d.fileName}
                      </a>
                      <Pill tone="clear">Sent {sent}</Pill>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => resend(d)}
                    disabled={busyId === d.id}
                    className={`${BTN_SM} hover:bg-gray-50`}
                    style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--teal)', cursor: busyId === d.id ? 'not-allowed' : 'pointer' }}
                  >
                    {busyId === d.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Resend
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DashCard>
  )
}
