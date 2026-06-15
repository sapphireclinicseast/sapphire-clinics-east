'use client'

import { useEffect, useState } from 'react'
import { HeartHandshake, Loader2, MessageCircle, Sparkles, Info } from 'lucide-react'

interface StrengthItem {
  id: string
  text: string
  branch: string
  submittedAt: string
}

const BUBBLE_STYLES = [
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', tail: 'bg-emerald-100 border-emerald-300' },
  { bg: 'bg-teal-100', border: 'border-teal-300', text: 'text-teal-900', tail: 'bg-teal-100 border-teal-300' },
  { bg: 'bg-sky-100', border: 'border-sky-300', text: 'text-sky-900', tail: 'bg-sky-100 border-sky-300' },
  { bg: 'bg-lime-100', border: 'border-lime-300', text: 'text-lime-900', tail: 'bg-lime-100 border-lime-300' },
  { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-900', tail: 'bg-cyan-100 border-cyan-300' },
  { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-900', tail: 'bg-green-100 border-green-300' },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', tail: 'bg-amber-100 border-amber-300' },
  { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-900', tail: 'bg-indigo-100 border-indigo-300' },
]

const EMOJIS = ['🤝', '🌟', '✨', '💚', '👏', '🙌', '💫', '🏆', '🌻', '😊', '🥰', '⭐']

function cleanComment(s: string): string {
  return s
    .replace(/\\r\\n|\\n|\\r/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function SpeechBubble({ text, index }: { text: string; index: number }) {
  const style = BUBBLE_STYLES[index % BUBBLE_STYLES.length]
  const emoji = EMOJIS[index % EMOJIS.length]
  const rotation = [-2, 1, -1, 2, 0, -1.5, 1.5][index % 7]
  const cleanedText = cleanComment(text)

  return (
    <div className="relative animate-fade-up" style={{ transform: `rotate(${rotation}deg)`, animationDelay: `${index * 80}ms` }}>
      <div className={`relative ${style.bg} ${style.border} border-2 rounded-3xl px-6 py-5 shadow-[0_4px_0_rgba(0,0,0,0.08)] hover:shadow-[0_6px_0_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-200`}>
        <div className="absolute -top-3 -right-2 text-2xl drop-shadow-sm" style={{ transform: 'rotate(15deg)' }}>{emoji}</div>
        <MessageCircle size={16} className={`${style.text} opacity-40 mb-2`} fill="currentColor" />
        <p className={`${style.text} text-[15px] leading-relaxed font-medium`} style={{ fontFamily: 'var(--font-body)' }}>
          &ldquo;{cleanedText}&rdquo;
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-current opacity-50">
          <span className={`${style.text} text-[11px] font-semibold`}>— A Colleague</span>
          <span className={`${style.text} text-[10px] opacity-70`}>Peer Evaluation</span>
        </div>
        <div className={`absolute ${style.tail} border-b-2 border-r-2 w-4 h-4 -bottom-2 left-8`} style={{ transform: 'rotate(45deg)' }} />
      </div>
    </div>
  )
}

export default function PeersLovePage() {
  const [strengths, setStrengths] = useState<StrengthItem[]>([])
  const [loading, setLoading] = useState(true)
  // Aggregate across ALL of this clinician's branches (e.g. East + Greenhills).
  useEffect(() => {
    fetchStrengths()
  }, [])

  async function fetchStrengths() {
    setLoading(true)
    try {
      const res = await fetch(`/api/peers-love`)
      if (res.ok) {
        const data = await res.json()
        setStrengths(data.strengths ?? [])
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero header */}
      <div className="relative rounded-3xl px-8 py-8 mb-6 overflow-hidden animate-fade-up"
        style={{ background: 'linear-gradient(135deg, #244952 0%, #4a8073 100%)' }}>
        <div className="absolute top-4 right-8 text-4xl opacity-20 animate-pulse" style={{ animationDuration: '3s' }}>🤝</div>
        <div className="absolute bottom-6 right-20 text-3xl opacity-25" style={{ transform: 'rotate(-15deg)' }}>🌟</div>
        <div className="absolute top-12 right-32 text-2xl opacity-20" style={{ transform: 'rotate(20deg)' }}>✨</div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shadow-lg">
            <HeartHandshake className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-white tracking-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
              What your Peers Love About You
              <Sparkles size={20} className="text-yellow-200" />
            </h1>
            <p className="text-white/90 text-sm mt-1" style={{ fontFamily: 'var(--font-body)' }}>
              Kind words and strengths your colleagues shared about you 💚
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="animate-spin text-[var(--teal)]" />
          <p className="text-sm text-[var(--mid-gray)]">Gathering kind words...</p>
        </div>
      ) : strengths.length === 0 ? (
        <div className="card-static text-center py-16 animate-fade-up">
          <div className="text-6xl mb-4">🌱</div>
          <h2 className="text-lg font-bold text-[var(--charcoal)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            No peer feedback yet — but great things are coming!
          </h2>
          <p className="text-[13px] text-[var(--mid-gray)] max-w-md mx-auto">
            Once your peers complete their evaluations, the strengths they highlight about you will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {strengths.map((s, i) => (
              <SpeechBubble key={s.id} text={s.text} index={i} />
            ))}
          </div>
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4a8073]/10 text-[#4a8073] text-[13px] font-semibold">
              <HeartHandshake size={14} />
              {strengths.length} kind {strengths.length === 1 ? 'word' : 'words'} from your peers
            </span>
          </div>
        </>
      )}

      <div className="mt-8 p-4 rounded-2xl bg-[var(--pale-teal)] border border-[var(--light-gray)] flex items-start gap-3">
        <Info size={16} className="text-[var(--deep-teal)] mt-0.5 shrink-0" />
        <div className="text-[12px] text-[var(--mid-gray)] leading-relaxed">
          <strong className="text-[var(--deep-teal)]">Note:</strong> These are the &ldquo;Strengths&rdquo; comments from your peer evaluations. They are shown anonymously and only the positive strengths are surfaced here — areas for improvement are not shown.
        </div>
      </div>
    </div>
  )
}
