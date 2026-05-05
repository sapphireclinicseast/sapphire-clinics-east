'use client'

import { useEffect, useState } from 'react'
import { Heart, Loader2, MessageCircle, Sparkles, Info } from 'lucide-react'
import BranchSwitcher, { useBranchSwitcher } from '@/components/BranchSwitcher'

interface StrengthItem {
  id: string
  text: string
  surveyType: string
  branch: string
  submittedAt: string
  respondent: string | null
}

// Cute pastel colors for speech bubbles (rotates through these)
const BUBBLE_STYLES = [
  { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-900', tail: 'bg-pink-100 border-pink-300' },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', tail: 'bg-amber-100 border-amber-300' },
  { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-900', tail: 'bg-purple-100 border-purple-300' },
  { bg: 'bg-sky-100', border: 'border-sky-300', text: 'text-sky-900', tail: 'bg-sky-100 border-sky-300' },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', tail: 'bg-emerald-100 border-emerald-300' },
  { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900', tail: 'bg-rose-100 border-rose-300' },
  { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-900', tail: 'bg-orange-100 border-orange-300' },
  { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-900', tail: 'bg-violet-100 border-violet-300' },
]

// Cute emojis to scatter
const EMOJIS = ['💖', '⭐', '🌟', '✨', '💫', '🎉', '🌈', '🦋', '🌻', '🌸', '🥰', '😊']

// Survey responses round-tripped through JSON.stringify can carry literal
// backslash-n / backslash-r sequences (and stray control whitespace) at
// display time. Strip them so the speech bubble renders clean prose.
function cleanComment(s: string): string {
  return s
    .replace(/\\r\\n|\\n|\\r/g, ' ') // literal "\n" / "\r\n" pairs → space
    .replace(/[\r\n]+/g, ' ')        // real newlines collapse to space
    .replace(/\s{2,}/g, ' ')         // multiple spaces → one
    .trim()
}

function SpeechBubble({ text, index, submittedAt, surveyType }: { text: string; index: number; submittedAt: string; surveyType: string }) {
  const style = BUBBLE_STYLES[index % BUBBLE_STYLES.length]
  const emoji = EMOJIS[index % EMOJIS.length]
  const rotation = [-2, 1, -1, 2, 0, -1.5, 1.5][index % 7]
  const cleanedText = cleanComment(text)

  // Survey type → friendly label
  const typeLabel: Record<string, string> = {
    HR10: 'Pedia Patient',
    HR11: 'Adult Patient',
    HR12: 'Front Desk',
    HR16: 'Group Therapy',
  }

  return (
    <div
      className="relative animate-fade-up"
      style={{
        transform: `rotate(${rotation}deg)`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div
        className={`relative ${style.bg} ${style.border} border-2 rounded-3xl px-6 py-5 shadow-[0_4px_0_rgba(0,0,0,0.08)] hover:shadow-[0_6px_0_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-200`}
      >
        {/* Emoji badge in top-right corner */}
        <div className="absolute -top-3 -right-2 text-2xl drop-shadow-sm" style={{ transform: 'rotate(15deg)' }}>
          {emoji}
        </div>

        {/* Quote icon */}
        <MessageCircle size={16} className={`${style.text} opacity-40 mb-2`} fill="currentColor" />

        {/* The comment */}
        <p
          className={`${style.text} text-[15px] leading-relaxed font-medium`}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          &ldquo;{cleanedText}&rdquo;
        </p>

        {/* Meta info */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-current opacity-50">
          <span className={`${style.text} text-[11px] font-semibold`}>
            — Anonymous Patient
          </span>
          <span className={`${style.text} text-[10px] opacity-70`}>
            {typeLabel[surveyType] ?? surveyType}
          </span>
        </div>

        {/* Speech bubble tail */}
        <div
          className={`absolute ${style.tail} border-b-2 border-r-2 w-4 h-4 -bottom-2 left-8`}
          style={{ transform: 'rotate(45deg)' }}
        />
      </div>
    </div>
  )
}

export default function PatientsLovePage() {
  const [strengths, setStrengths] = useState<StrengthItem[]>([])
  const [loading, setLoading] = useState(true)
  const { branches, isMultiBranch, activeStaffId, switchBranch } = useBranchSwitcher()

  useEffect(() => {
    if (activeStaffId || !isMultiBranch) fetchStrengths()
  }, [activeStaffId, isMultiBranch])

  async function fetchStrengths() {
    setLoading(true)
    try {
      const staffParam = isMultiBranch && activeStaffId ? `?staffId=${activeStaffId}` : ''
      const res = await fetch(`/api/patient-love${staffParam}`)
      if (res.ok) {
        const data = await res.json()
        setStrengths(data.strengths ?? [])
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Branch switcher */}
      {isMultiBranch && (
        <div className="mb-4 animate-fade-up">
          <BranchSwitcher branches={branches} activeStaffId={activeStaffId} onSwitch={switchBranch} />
        </div>
      )}

      {/* Hero header */}
      <div
        className="relative rounded-3xl px-8 py-8 mb-6 overflow-hidden animate-fade-up"
        style={{
          background: 'linear-gradient(135deg, #A85C3D 0%, #C69849 100%)',
        }}
      >
        {/* Decorative floating hearts in bg */}
        <div className="absolute top-4 right-8 text-4xl opacity-20 animate-pulse" style={{ animationDuration: '3s' }}>💖</div>
        <div className="absolute bottom-6 right-20 text-3xl opacity-25" style={{ transform: 'rotate(-15deg)' }}>⭐</div>
        <div className="absolute top-12 right-32 text-2xl opacity-20" style={{ transform: 'rotate(20deg)' }}>✨</div>

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shadow-lg">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-white tracking-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
              What Patients Love About You
              <Sparkles size={20} className="text-yellow-200" />
            </h1>
            <p className="text-white/90 text-sm mt-1" style={{ fontFamily: 'var(--font-body)' }}>
              A wall of kind words from the people you&apos;ve helped ✨
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="animate-spin text-[var(--teal)]" />
          <p className="text-sm text-[var(--mid-gray)]">Gathering kind words...</p>
        </div>
      ) : strengths.length === 0 ? (
        <div className="card-static text-center py-16 animate-fade-up">
          <div className="text-6xl mb-4">🌱</div>
          <h2 className="text-lg font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            No feedback yet — but great things are coming!
          </h2>
          <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto">
            It&apos;s possible that your patients have not yet been chosen for the customer survey. Once they respond, their kind words will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Speech bubble grid — masonry-ish layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {strengths.map((s, i) => (
              <SpeechBubble
                key={s.id}
                text={s.text}
                index={i}
                submittedAt={s.submittedAt}
                surveyType={s.surveyType}
              />
            ))}
          </div>

          {/* Count stat */}
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#A85C3D]/10 text-[#A85C3D] text-[13px] font-semibold">
              <Heart size={14} fill="currentColor" />
              {strengths.length} kind {strengths.length === 1 ? 'word' : 'words'} from your patients
            </span>
          </div>
        </>
      )}

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-2xl bg-[var(--pale-teal)] border border-[var(--light-gray)] flex items-start gap-3">
        <Info size={16} className="text-[var(--deep-teal)] mt-0.5 shrink-0" />
        <div className="text-[12px] text-[var(--mid-gray)] leading-relaxed">
          <strong className="text-[var(--deep-teal)]">Note:</strong> These are actual comments from patients who were randomly chosen to participate in our customer survey. All responses are anonymous. If nothing appears here yet, it is possible that your patients have not yet been chosen for the survey, or they have not provided subjective feedback.
        </div>
      </div>
    </div>
  )
}
