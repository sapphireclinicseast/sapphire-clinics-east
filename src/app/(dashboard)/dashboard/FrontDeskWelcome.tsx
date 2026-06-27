'use client'

import React from 'react'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import DeskShortcutCard from '@/components/DeskShortcutCard'

type BirthdayPatient = { id: string; firstName: string; lastName: string; birthday: string; hasPhone: boolean }
type SmsState = 'idle' | 'sending' | 'sent' | 'error'
type EmailState = 'idle' | 'sending' | 'sent' | 'error'

// localStorage key for tracking sent birthday emails/SMS (resets each day)
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

// ── All CSS keyframes & class definitions ────────────────────────────────────
// Behavior cycle = 22s:
//   0–12%  → walking bob
//   14–23% → JUMP (squash → air → land) + happy face
//   23–44% → walking bob
//   45–71% → HIDE (sink below screen → peek face up → pop back)
//   71–100%→ walking bob
const ALPACA_CSS = `
  /* ── Walking ── */
  .aw-x {
    animation: awX 42s linear infinite;
  }
  .aw-flip {
    animation: awFlip 42s linear infinite;
    transform-origin: center;
    display: inline-block;
  }

  /* ── Jump / hide / bob (22s loop on behavior wrapper) ── */
  .aw-behave {
    animation: awBehave 22s ease-in-out infinite;
    display: inline-block;
  }

  /* ── Blink (4s loop on each eyelid element) ── */
  .aw-eyelid {
    transform-box: fill-box;
    transform-origin: 50% 0%;
    animation: awBlink 4s ease-in-out infinite;
  }

  /* ── Ear wiggle during jump (synced to awBehave 14–22%) ── */
  .aw-ear-l {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: awEarL 22s ease-in-out infinite;
  }
  .aw-ear-r {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: awEarR 22s ease-in-out infinite;
  }

  /* ── Happy expressions: appear during jump (14–23%) ── */
  .aw-smile-normal { animation: awSmileNormal 22s ease-in-out infinite; }
  .aw-smile-happy  { animation: awSmileHappy  22s ease-in-out infinite; }
  .aw-squint       { animation: awSmileHappy  22s ease-in-out infinite; }

  /* ── Speech bubble pulse ── */
  .aw-bubble {
    animation: awBubblePulse 3s ease-in-out infinite;
  }

  /* ─────────────── Keyframes ─────────────── */

  @keyframes awX {
    0%   { transform: translateX(calc(100vw + 250px)); }
    46%  { transform: translateX(-250px); }
    54%  { transform: translateX(-250px); }
    100% { transform: translateX(calc(100vw + 250px)); }
  }

  @keyframes awFlip {
    0%   { transform: scaleX(-1); }
    46%  { transform: scaleX(-1); }
    54%  { transform: scaleX(1); }
    100% { transform: scaleX(1); }
  }

  @keyframes awBehave {
    /* Walk bob */
    0%   { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    3%   { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    6%   { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    9%   { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    12%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }

    /* JUMP — squat → launch → peak → land → settle */
    14%  { transform: translateY(0px)   scaleX(1.1)  scaleY(0.85); }
    17%  { transform: translateY(-62px) scaleX(0.87) scaleY(1.16); }
    19%  { transform: translateY(-66px) scaleX(0.87) scaleY(1.16); }
    21%  { transform: translateY(-8px)  scaleX(1.13) scaleY(0.80); }
    23%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }

    /* Walk bob */
    27%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    31%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    35%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    39%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    43%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }

    /* HIDE — sink below screen → peek just the face → pop back */
    45%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    49%  { transform: translateY(200px) scaleX(1)    scaleY(1); }
    58%  { transform: translateY(200px) scaleX(1)    scaleY(1); }
    63%  { transform: translateY(122px) scaleX(1)    scaleY(1); }
    67%  { transform: translateY(122px) scaleX(1)    scaleY(1); }
    71%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }

    /* Walk bob */
    75%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    79%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    83%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    87%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    91%  { transform: translateY(-11px) scaleX(1)    scaleY(1); }
    95%  { transform: translateY(0px)   scaleX(1)    scaleY(1); }
    100% { transform: translateY(0px)   scaleX(1)    scaleY(1); }
  }

  /* Eyelid slides down from top of eye → closed → opens */
  @keyframes awBlink {
    0%, 82%, 100% { transform: scaleY(0); }   /* open */
    85%, 88%      { transform: scaleY(1); }   /* closed */
  }

  /* Normal smile hidden during jump, happy smile shown */
  @keyframes awSmileNormal {
    0%, 13%, 25%, 100% { opacity: 1; }
    15%, 22%           { opacity: 0; }
  }
  @keyframes awSmileHappy {
    0%, 13%, 25%, 100% { opacity: 0; }
    15%, 22%           { opacity: 1; }
  }

  /* Ears wiggle up when jumping */
  @keyframes awEarL {
    0%, 13%, 25%, 100% { transform: rotate(0deg); }
    15%, 20%           { transform: rotate(-24deg); }
  }
  @keyframes awEarR {
    0%, 13%, 25%, 100% { transform: rotate(0deg); }
    15%, 20%           { transform: rotate(24deg); }
  }

  @keyframes awBubblePulse {
    0%, 100% { opacity: 0.93; transform: translateX(-50%) scale(1); }
    50%      { opacity: 1;    transform: translateX(-50%) scale(1.02); }
  }
`

// ── Alpaca SVG ───────────────────────────────────────────────────────────────
// True alpaca anatomy: long neck, upright banana ears, flat wide muzzle,
// fluffy teal topknot, slender legs, cream wool body.
// For richer animation, add lottie-react + a LottieFiles alpaca JSON instead.
function AlpacaSVG() {
  return (
    <svg width="160" height="260" viewBox="0 0 160 260" fill="none" xmlns="http://www.w3.org/2000/svg">

      {/* ── Back legs (far pair — drawn first, body covers tops) ── */}
      <rect x="50" y="192" width="15" height="58" rx="7.5" fill="#C4B8A4" />
      <rect x="85" y="194" width="15" height="56" rx="7.5" fill="#C4B8A4" />
      <rect x="50" y="238" width="15" height="12" rx="6" fill="#7A6A58" />
      <rect x="85" y="238" width="15" height="12" rx="6" fill="#7A6A58" />

      {/* ── Body (large fluffy wool oval) ── */}
      <ellipse cx="80" cy="192" rx="52" ry="46" fill="#EDE8D5" />
      {/* Wool texture bumps */}
      <ellipse cx="50"  cy="180" rx="13" ry="9"  fill="#E2DCC8" />
      <ellipse cx="110" cy="180" rx="13" ry="9"  fill="#E2DCC8" />
      <ellipse cx="65"  cy="162" rx="13" ry="9"  fill="#E2DCC8" />
      <ellipse cx="95"  cy="162" rx="13" ry="9"  fill="#E2DCC8" />
      <ellipse cx="80"  cy="155" rx="13" ry="8"  fill="#E2DCC8" />

      {/* ── Tail (small fluffy poof) ── */}
      <ellipse cx="128" cy="170" rx="12" ry="11" fill="#EDE8D5" />
      <ellipse cx="129" cy="169" rx="7"  ry="7"  fill="#E2DCC8" />

      {/* ── Front legs (near pair — slightly lighter) ── */}
      <rect x="57" y="195" width="15" height="57" rx="7.5" fill="#EAE4CE" />
      <rect x="82" y="197" width="15" height="55" rx="7.5" fill="#EAE4CE" />
      <rect x="57" y="240" width="15" height="12" rx="6" fill="#7A6A58" />
      <rect x="82" y="240" width="15" height="12" rx="6" fill="#7A6A58" />

      {/* ── Neck (long — the defining alpaca silhouette) ── */}
      <rect x="65" y="126" width="30" height="78" rx="15" fill="#EDE8D5" />
      {/* Neck shadow/depth on sides */}
      <rect x="65" y="130" width="6"  height="68" rx="3" fill="#E2DCC8" opacity="0.6" />
      <rect x="89" y="130" width="6"  height="68" rx="3" fill="#E2DCC8" opacity="0.6" />

      {/* ── Head (smaller oval — alpaca heads are compact) ── */}
      <ellipse cx="80" cy="108" rx="29" ry="27" fill="#EDE8D5" />

      {/* ── Topknot / forelock (teal fluffy tuft — brand colour accent) ── */}
      <circle cx="68"  cy="82"  r="13" fill="#4a8073" />
      <circle cx="80"  cy="76"  r="15" fill="#4a8073" />
      <circle cx="92"  cy="82"  r="13" fill="#4a8073" />
      <circle cx="73"  cy="72"  r="10" fill="#244952" />
      <circle cx="87"  cy="72"  r="10" fill="#244952" />
      <circle cx="80"  cy="68"  r="8"  fill="#5a9085" />
      <circle cx="80"  cy="65"  r="5"  fill="#6aaa97" opacity="0.7" />

      {/* ── Ears (upright banana — NOT round; this is the key alpaca feature) ── */}
      {/* Left ear */}
      <ellipse cx="55" cy="90" rx="9" ry="21" fill="#4a8073" className="aw-ear-l" />
      <ellipse cx="55" cy="93" rx="5" ry="14" fill="#244952" className="aw-ear-l" />
      {/* Right ear */}
      <ellipse cx="105" cy="90" rx="9" ry="21" fill="#4a8073" className="aw-ear-r" />
      <ellipse cx="105" cy="93" rx="5" ry="14" fill="#244952" className="aw-ear-r" />

      {/* ── Face patch (defines the long alpaca face area) ── */}
      <ellipse cx="80" cy="115" rx="21" ry="19" fill="#E4DBC8" />

      {/* ── Eyes (large, warm dark — drawn after face patch) ── */}
      {/* Left eye */}
      <circle cx="68" cy="106" r="10.5" fill="#1C0D04" />
      <circle cx="68" cy="106" r="7"    fill="#3D1A08" />
      <circle cx="72" cy="101" r="4"    fill="#FFFFFF" />
      <circle cx="65" cy="109" r="1.8"  fill="#FFFFFF" opacity="0.5" />
      {/* Right eye */}
      <circle cx="92" cy="106" r="10.5" fill="#1C0D04" />
      <circle cx="92" cy="106" r="7"    fill="#3D1A08" />
      <circle cx="96" cy="101" r="4"    fill="#FFFFFF" />
      <circle cx="89" cy="109" r="1.8"  fill="#FFFFFF" opacity="0.5" />

      {/* Happy squints (show during jump, cover eye bottoms) */}
      <ellipse cx="68" cy="114" rx="10.5" ry="8" fill="#E4DBC8" className="aw-squint" />
      <ellipse cx="92" cy="114" rx="10.5" ry="8" fill="#E4DBC8" className="aw-squint" />

      {/* Eyelids (blink scaleY 0→1 from top) */}
      <ellipse cx="68" cy="106" rx="10.5" ry="10.5" fill="#E4DBC8" className="aw-eyelid" />
      <ellipse cx="92" cy="106" rx="10.5" ry="10.5" fill="#E4DBC8" className="aw-eyelid" />

      {/* ── Snout (wide & flat — alpaca muzzle is broad, not button) ── */}
      <ellipse cx="80" cy="124" rx="16" ry="10" fill="#D0C0A0" />
      {/* Nostrils — wide apart (distinctly alpaca) */}
      <ellipse cx="73" cy="123" rx="4"   ry="3.2" fill="#7A5030" />
      <ellipse cx="87" cy="123" rx="4"   ry="3.2" fill="#7A5030" />
      <circle  cx="72" cy="122" r="1.4"  fill="#5A3018" />
      <circle  cx="86" cy="122" r="1.4"  fill="#5A3018" />

      {/* ── Normal smile ── */}
      <path d="M72 132 Q80 140 88 132"
        stroke="#7A5030" strokeWidth="2" fill="none" strokeLinecap="round"
        className="aw-smile-normal" />

      {/* ── Happy wide smile + teeth (during jump) ── */}
      <path d="M69 131 Q80 145 91 131 Q91 138 80 138 Q69 138 69 131 Z"
        fill="#FFFFFF" className="aw-smile-happy" />
      <path d="M69 131 Q80 145 91 131"
        stroke="#7A5030" strokeWidth="2.5" fill="none" strokeLinecap="round"
        className="aw-smile-happy" />

      {/* ── Sparkles (jump) ── */}
      <g className="aw-smile-happy">
        <line x1="34" y1="95"  x2="25" y2="87"  stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="32" y1="105" x2="22" y2="103" stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="34" y1="87"  x2="32" y2="78"  stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="126" y1="95"  x2="135" y2="87"  stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="128" y1="105" x2="138" y2="103" stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="126" y1="87"  x2="128" y2="78"  stroke="#c69849" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* ── Rosy cheeks ── */}
      <ellipse cx="55" cy="114" rx="10" ry="7" fill="#FF8888" opacity="0.20" />
      <ellipse cx="105" cy="114" rx="10" ry="7" fill="#FF8888" opacity="0.20" />
    </svg>
  )
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

// ── Main component ───────────────────────────────────────────────────────────
export default function FrontDeskWelcome({
  name,
  branch,
  birthdayPatients = [],
}: {
  name?: string
  branch?: string
  birthdayPatients?: BirthdayPatient[]
}) {
  const [quote, setQuote] = useState<{ text: string; author: string } | null>(null)
  const [smsState, setSmsState] = useState<Record<string, SmsState>>({})
  const [emailState, setEmailState] = useState<Record<string, EmailState>>({})
  const [sentEmailIds, setSentEmailIds] = useState<Set<string>>(new Set())
  const [sentSmsIds, setSentSmsIds] = useState<Set<string>>(new Set())
  const [slotAlerts, setSlotAlerts] = useState<{ nearingNoShow: any[]; subjectNoShow: any[]; nearingCancel: any[]; subjectCancel: any[] }>({ nearingNoShow: [], subjectNoShow: [], nearingCancel: [], subjectCancel: [] })
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null)

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
    setSentEmailIds(loadSentEmails())
    setSentSmsIds(loadSent('sms'))

    // Fetch slot removal alerts
    const branchParam = branch === 'SBEA' ? 'SANDBOX_EAST' : branch === 'SBGH' ? 'SANDBOX_GREENHILLS' : ''
    Promise.all([
      fetch(`/api/patient-relationship?tab=noshow&branch=${branchParam}`).then(r => r.json()).catch(() => ({ patients: [] })),
      fetch(`/api/patient-relationship?tab=cancellation&branch=${branchParam}`).then(r => r.json()).catch(() => ({ patients: [] })),
    ]).then(([ns, ca]) => {
      setSlotAlerts({
        nearingNoShow: (ns.patients || []).filter((p: any) => p.noShowCount === 2),
        subjectNoShow: (ns.patients || []).filter((p: any) => p.noShowCount >= 3),
        nearingCancel: (ca.patients || []).filter((p: any) => p.cancellationsUsed >= 10 && p.cancellationsUsed < 12),
        subjectCancel: (ca.patients || []).filter((p: any) => p.cancellationsUsed >= 12),
      })
    })
  }, [branch])

  const branchLabel =
    branch === 'SBEA' ? 'Aura Health East'
    : branch === 'SBGH' ? 'Aura Health Greenhills'
    : undefined

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 'calc(100vh - 60px)',
        overflowX: 'hidden',
        background: 'linear-gradient(155deg, #f4f8f5 0%, #edf3d9 55%, #f4f8f5 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '3rem',
        gap: '1.5rem',
      }}
    >
      <style>{ALPACA_CSS}</style>

      {/* ── Timed reminder popup ── */}
      {activeReminder && (
        <ReminderModal
          reminder={activeReminder}
          onDismiss={() => setActiveReminder(null)}
        />
      )}

      {/* ── Top row: greeting (center) + reminder cards (right) ── */}
      <div style={{ width: '100%', maxWidth: '1200px', padding: '0 1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* Center column: logo + greeting + quote + branch badge */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>

          {/* Logo */}
          <Image
            src="/aura-health-logo.png"
            alt="Aura Health Rehab Clinic"
            width={180}
            height={101}
            style={{ objectFit: 'contain' }}
            unoptimized
          />

          {/* Greeting */}
          <div style={{ textAlign: 'center', maxWidth: '560px', padding: '0 2rem' }}>
            <p style={{
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#4a8073', marginBottom: '0.4rem',
            }}>
              Welcome back
            </p>
            <h1 style={{
              fontSize: 'clamp(1.4rem, 2.5vw, 2.2rem)', fontWeight: 800, lineHeight: 1.2,
              color: '#1A1A1A', marginBottom: '1.25rem',
              fontFamily: 'var(--font-display, system-ui)',
            }}>
              Good {getGreeting()},{' '}
              <span style={{ color: '#4a8073' }}>{name ?? 'there'}</span>! 👋
            </h1>

            {quote && (
              <div style={{
                background: 'rgba(36,73,82,0.07)',
                border: '1px solid rgba(36,73,82,0.18)',
                borderRadius: '0.875rem',
                padding: '1rem 1.4rem',
              }}>
                <p style={{
                  fontSize: '1rem', fontWeight: 500, lineHeight: 1.7,
                  color: '#1a3a35', fontStyle: 'italic', margin: 0,
                }}>
                  &ldquo;{quote.text}&rdquo;
                </p>
                <p style={{
                  fontSize: '0.78rem', fontWeight: 600, color: '#4a8073',
                  marginTop: '0.5rem', marginBottom: 0,
                }}>
                  — {quote.author}
                </p>
              </div>
            )}
          </div>

          {/* Branch badge */}
          {branchLabel && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
              background: '#4a8073', color: '#fff',
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.07em',
              padding: '0.3rem 1rem', borderRadius: '99px',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#ffffff', display: 'inline-block', flexShrink: 0,
              }} />
              {branchLabel}
            </div>
          )}
        </div>

        {/* Right column: DESK reminder card only */}
        <div style={{ width: '272px', flexShrink: 0 }}>
          <DeskShortcutCard />
        </div>

      </div>{/* end top row */}

      {/* ── PACT card + Birthday + Slot Alerts ── */}
      <div style={{ width: '100%', maxWidth: '1200px', padding: '0 1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* PACT Cancellation Reminder — left-most column */}
        <div style={{ width: '272px', flexShrink: 0 }}>
          <PactCancellationReminder />
        </div>

      {/* ── Birthday Reminder ── */}
      <div style={{ flex: '1 1 340px', minWidth: 0 }}>
        <div style={{
          background: '#fff',
          border: '1px solid #EDE5D8',
          borderRadius: '0.875rem',
          overflow: 'hidden',
          boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #244952, #4a8073)',
            padding: '0.7rem 1.1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1rem' }}>🎂</span>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.78rem', margin: 0, letterSpacing: '0.04em' }}>
              Birthdays This Week
            </p>
            <span style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              borderRadius: '99px',
              padding: '0.12rem 0.55rem',
              fontSize: '0.68rem',
              fontWeight: 700,
            }}>
              {birthdayPatients.length} patient{birthdayPatients.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '0.65rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {birthdayPatients.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#AAA', padding: '0.6rem 0', margin: 0 }}>
                No patient birthdays this week 🌿
              </p>
            ) : (
              birthdayPatients.map(p => {
                const dobDate = new Date(p.birthday)
                const today = new Date()
                const isToday =
                  dobDate.getUTCDate() === today.getDate() &&
                  dobDate.getUTCMonth() === today.getMonth()
                const dayLabel = isToday
                  ? 'Today! 🎉'
                  : dobDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
                const clinicName =
                  branch === 'SBEA' ? 'Aura Health East'
                  : branch === 'SBGH' ? 'Aura Health Greenhills'
                  : 'Aura Health Rehab Clinic'
                const msg = `Happy Birthday, ${p.firstName}! 🎂 Wishing you a wonderful day filled with joy and good health! From all of us at ${clinicName}. 💚`
                const sms = smsState[p.id] ?? 'idle'
                const email = emailState[p.id] ?? 'idle'
                const alreadySent = sentEmailIds.has(p.id)
                const alreadySentSms = sentSmsIds.has(p.id)

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

                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    background: isToday ? '#FFF7F0' : '#FAFAFA',
                    border: `1px solid ${isToday ? '#F5B48A' : '#EDE5D8'}`,
                    borderRadius: '0.6rem',
                    padding: '0.55rem 0.8rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1A1A1A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.firstName} {p.lastName}
                      </p>
                      <p style={{ fontSize: '0.67rem', color: isToday ? '#4a8073' : '#999', margin: 0, fontWeight: isToday ? 600 : 400 }}>
                        {dayLabel}
                      </p>
                    </div>
                    {/* Send Email */}
                    <button
                      onClick={() => sendEmail(false)}
                      disabled={email === 'sending'}
                      title={
                        alreadySent || email === 'sent'
                          ? 'Email already sent today — click to resend'
                          : 'Send birthday greeting email'
                      }
                      style={{
                        background: (alreadySent || email === 'sent') ? '#22C55E' : email === 'error' ? '#EF4444' : '#fff',
                        color: (alreadySent || email === 'sent') ? '#fff' : email === 'error' ? '#fff' : '#4a8073',
                        border: `1px solid ${(alreadySent || email === 'sent') ? '#22C55E' : email === 'error' ? '#EF4444' : '#4a8073'}`,
                        borderRadius: '0.4rem',
                        padding: '0.32rem 0.7rem', fontSize: '0.67rem', fontWeight: 600,
                        cursor: email === 'sending' ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                        opacity: email === 'sending' ? 0.7 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      {email === 'sending' ? 'Sending…'
                        : (alreadySent || email === 'sent') ? '✓ Email Sent'
                        : email === 'error' ? '✕ Failed'
                        : '✉ Send Email'}
                    </button>
                    {/* Send SMS */}
                    {p.hasPhone && (
                      <button
                        onClick={sendSms}
                        disabled={sms === 'sending' || sms === 'sent' || alreadySentSms}
                        title={sms === 'error' ? 'Failed — tap to retry' : alreadySentSms ? 'SMS already sent today' : 'Send SMS birthday greeting'}
                        style={{
                          background:
                            (alreadySentSms || sms === 'sent') ? '#22C55E'
                            : sms === 'error' ? '#EF4444'
                            : '#4a8073',
                          color: '#fff', border: 'none', borderRadius: '0.4rem',
                          padding: '0.32rem 0.7rem', fontSize: '0.67rem', fontWeight: 600,
                          cursor: (sms === 'sending' || sms === 'sent' || alreadySentSms) ? 'default' : 'pointer',
                          whiteSpace: 'nowrap', flexShrink: 0,
                          opacity: sms === 'sending' ? 0.7 : 1,
                          transition: 'all 0.2s',
                        }}
                      >
                        {sms === 'sending' ? 'Sending…'
                          : (alreadySentSms || sms === 'sent') ? '✓ SMS Sent!'
                          : sms === 'error'   ? '✕ Failed'
                          : '📱 Send SMS'}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Text prompt hint */}
          {birthdayPatients.length > 0 && (
            <div style={{
              borderTop: '1px solid #F0E8DC',
              padding: '0.5rem 0.875rem',
              fontSize: '0.65rem', color: '#AAA', fontStyle: 'italic',
            }}>
              &ldquo;Send Email&rdquo; sends a birthday greeting to the patient&apos;s email (requires email on file). &ldquo;Send SMS&rdquo; sends it to their phone (requires phone number on file).
            </div>
          )}
        </div>
      </div>

      {/* ── Slot Removal Alerts + PR widgets (right column — always shown) ── */}
      <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DC2626', marginBottom: '0.5rem' }}>
              Subject to Slot Removal — No-Shows ({slotAlerts.subjectNoShow.length})
            </div>
            {slotAlerts.subjectNoShow.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#991B1B', fontStyle: 'italic', padding: '0.2rem 0' }}>None</div>
            ) : slotAlerts.subjectNoShow.map((p: any) => (
              <div key={p.id} style={{ fontSize: '0.82rem', color: '#991B1B', fontWeight: 600, padding: '0.2rem 0' }}>
                {p.lastName}, {p.firstName} <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#DC2626' }}>— {p.noShowCount}/3</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#D97706', marginBottom: '0.5rem' }}>
              Nearing Slot Removal — No-Shows ({slotAlerts.nearingNoShow.length})
            </div>
            {slotAlerts.nearingNoShow.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#92400E', fontStyle: 'italic', padding: '0.2rem 0' }}>None</div>
            ) : slotAlerts.nearingNoShow.map((p: any) => (
              <div key={p.id} style={{ fontSize: '0.82rem', color: '#92400E', fontWeight: 600, padding: '0.2rem 0' }}>
                {p.lastName}, {p.firstName} <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#D97706' }}>— {p.noShowCount}/3</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#DC2626', marginBottom: '0.5rem' }}>
              Subject to Slot Removal — Cancellations ({slotAlerts.subjectCancel.length})
            </div>
            {slotAlerts.subjectCancel.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#991B1B', fontStyle: 'italic', padding: '0.2rem 0' }}>None</div>
            ) : slotAlerts.subjectCancel.map((p: any) => (
              <div key={p.id} style={{ fontSize: '0.82rem', color: '#991B1B', fontWeight: 600, padding: '0.2rem 0' }}>
                {p.lastName}, {p.firstName} <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#DC2626' }}>— {p.cancellationsUsed}/12</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#D97706', marginBottom: '0.5rem' }}>
              Nearing Slot Removal — Cancellations ({slotAlerts.nearingCancel.length})
            </div>
            {slotAlerts.nearingCancel.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#92400E', fontStyle: 'italic', padding: '0.2rem 0' }}>None</div>
            ) : slotAlerts.nearingCancel.map((p: any) => (
              <div key={p.id} style={{ fontSize: '0.82rem', color: '#92400E', fontWeight: 600, padding: '0.2rem 0' }}>
                {p.lastName}, {p.firstName} <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#D97706' }}>— {p.cancellationsUsed}/12</span>
              </div>
            ))}
          </div>

          {/* Progress Reports — pending PRs awaiting Paid + Email */}
          <PendingProgressReports />

          {/* Past Progress Reports — searchable history */}
          <PastProgressReports />
        </div>

      </div>{/* end side-by-side wrapper */}

      {/* ── Alpaca section — sits below the PACT/Birthday/Alerts row ── */}
      <div style={{ width: '100%', position: 'relative', marginTop: '0.5rem' }}>

        {/* Speech bubble — centred above the alpaca strip */}
        <div
          className="aw-bubble"
          style={{
            position: 'absolute',
            bottom: '268px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff',
            border: '2px solid #4a8073',
            borderRadius: '0.875rem',
            padding: '0.55rem 1.1rem',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: '#333',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            boxShadow: '0 3px 14px rgba(0,0,0,0.1)',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        >
          Welcome to your workstation!{' '}
          <span style={{ fontWeight: 400, color: '#666' }}>
            Choose options on the left panel to start!
          </span>
          <span style={{
            position: 'absolute', bottom: '-14px', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '10px solid transparent',
            borderRight: '10px solid transparent',
            borderTop: '14px solid #4a8073',
          }} />
          <span style={{
            position: 'absolute', bottom: '-10px', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '10px solid #fff',
          }} />
        </div>

        {/* ── Walking alpaca strip ────────────────────────────────────────────
             Height = 310px.  Alpaca is 260px tall, bottom: 8px.
             Normal top = 310 - 8 - 260 = 42px from strip top.
             Jump peak  = 42 - 66 = -24 → clipped by overflow:hidden (fine).
             Hide +200  = 42 + 200 = 242px → only 68px visible = hair tips ✓
             Peek +122  = 42 + 122 = 164px → 146px visible = face ✓
        ── */}
        <div style={{
          width: '100%',
          height: '310px',
          overflow: 'hidden',
          pointerEvents: 'none',
          position: 'relative',
        }}>
          {/* Ground line */}
          <div style={{
            position: 'absolute', bottom: '6px', left: 0, right: 0, height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(36,73,82,0.15) 20%, rgba(36,73,82,0.15) 80%, transparent)',
          }} />
          {/* X movement → flip direction → behavior (bob / jump / hide) */}
          <div className="aw-x" style={{ position: 'absolute', bottom: '8px' }}>
            <div className="aw-flip">
              <div className="aw-behave">
                <AlpacaSVG />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}


// ── Pending Progress Reports (orange — awaiting payment + email) ─────────────
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

function PendingProgressReports() {
  const [docs, setDocs] = useState<PRDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/progress-reports?status=pending')
      const d = await r.json()
      setDocs(d.docs || [])
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

  return (
    <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C2410C', marginBottom: '0.6rem' }}>
        Progress Reports — Awaiting Payment + Email ({docs.length})
      </div>
      {loading ? (
        <div style={{ fontSize: '0.78rem', color: '#9A3412', fontStyle: 'italic' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: '#9A3412', fontStyle: 'italic', padding: '0.2rem 0' }}>None</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {docs.map(d => {
            const informed = d.informedFrontDeskAt ? new Date(d.informedFrontDeskAt).toLocaleDateString() : '—'
            return (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #FED7AA', borderRadius: '0.6rem', padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {/* Row 1 — name + file info */}
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7C2D12' }}>
                    {d.patient.lastName}, {d.patient.firstName}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9A3412', marginTop: 1 }}>
                    <a href={`/api/progress-reports/${d.id}/file`} target="_blank" rel="noreferrer" style={{ color: '#C2410C', textDecoration: 'underline' }}>
                      {d.fileName}
                    </a>
                    {' · '}{d.department}
                    {' · '}<span style={{ background: '#FFEDD5', color: '#9A3412', padding: '1px 6px', borderRadius: 99, fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase' }}>Informed {informed}</span>
                  </div>
                </div>
                {/* Row 2 — controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600, color: '#7C2D12', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={d.paid}
                      onChange={e => togglePaid(d, e.target.checked)}
                      disabled={busyId === d.id}
                      style={{ width: 16, height: 16, accentColor: '#0EA5E9' }}
                    />
                    Paid for PR?
                  </label>
                  <button
                    onClick={() => sendEmail(d)}
                    disabled={!d.paid || busyId === d.id || !d.patient.email}
                    title={!d.patient.email ? 'No email on file' : !d.paid ? 'Tick "Paid for PR?" first' : 'Send PR via email'}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: '0.4rem', border: 'none',
                      background: d.paid && d.patient.email ? '#059669' : '#E2E8F0',
                      color: d.paid && d.patient.email ? '#fff' : '#94A3B8',
                      fontSize: '0.78rem', fontWeight: 700,
                      cursor: d.paid && d.patient.email && busyId !== d.id ? 'pointer' : 'not-allowed',
                    }}
                  >
                    📧 Email PR
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Past Progress Reports (green — already sent, searchable history) ─────────
function PastProgressReports() {
  const [docs, setDocs] = useState<PRDoc[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: 'past' })
      if (q) params.set('search', q)
      const r = await fetch('/api/progress-reports?' + params.toString())
      const d = await r.json()
      setDocs(d.docs || [])
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
    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.875rem', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#15803D' }}>
          Past Progress Reports ({docs.length})
        </div>
        <input
          type="text"
          placeholder="Search by patient name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, maxWidth: 260,
            padding: '0.3rem 0.6rem', borderRadius: 6,
            border: '1.5px solid #BBF7D0', background: '#fff',
            fontSize: '0.78rem', outline: 'none',
          }}
        />
      </div>
      {loading ? (
        <div style={{ fontSize: '0.78rem', color: '#15803D', fontStyle: 'italic' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: '#15803D', fontStyle: 'italic' }}>{search ? 'No matches.' : 'None yet.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
          {docs.map(d => {
            const sent = d.emailedToPatientAt ? new Date(d.emailedToPatientAt).toLocaleDateString() : '—'
            return (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #BBF7D0', borderRadius: '0.5rem', padding: '0.5rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#14532D' }}>
                    {d.patient.lastName}, {d.patient.firstName}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#15803D', marginTop: 1 }}>
                    <a href={`/api/progress-reports/${d.id}/file`} target="_blank" rel="noreferrer" style={{ color: '#15803D', textDecoration: 'underline' }}>
                      {d.fileName}
                    </a>
                    {' · '}<span style={{ background: '#BBF7D0', color: '#14532D', padding: '1px 6px', borderRadius: 99, fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase' }}>Sent {sent}</span>
                  </div>
                </div>
                <button
                  onClick={() => resend(d)}
                  disabled={busyId === d.id}
                  style={{
                    padding: '0.3rem 0.65rem', borderRadius: '0.4rem', border: '1px solid #BBF7D0',
                    background: '#fff', color: '#14532D', fontSize: '0.7rem', fontWeight: 700,
                    cursor: busyId === d.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  Resend
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

