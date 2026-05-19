'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  words: string[]
  /** ms each word stays visible before cycling. */
  intervalMs?: number
  className?: string
}

/**
 * Inline rotating word — vertically slides between options with a CSS
 * transition. Pattern inspired by 21st.dev / tommyjepsen / animated-hero.
 *
 * Implementation chose CSS over framer-motion intentionally — under React
 * Strict Mode + Next.js Suspense the framer-motion AnimatePresence variant
 * was getting stuck mid-transition. CSS transforms behave consistently here.
 *
 * Sizing: an invisible spacer set to the widest word in the list keeps the
 * surrounding line width stable while the active word is absolutely
 * positioned on top.
 */
export function RotatingWord({ words, intervalMs = 2500, className }: Props) {
  const [index, setIndex] = useState(0)
  // Use a ref instead of dependent state to avoid re-running the effect
  // when words is a new array literal each render.
  const lenRef = useRef(words.length)
  lenRef.current = words.length

  useEffect(() => {
    if (lenRef.current < 2) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % lenRef.current)
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  const widest = words.reduce((a, b) => (b.length > a.length ? b : a), '')

  return (
    <span className="relative inline-block overflow-hidden align-baseline">
      <span aria-hidden className="invisible whitespace-nowrap">{widest}</span>
      {words.map((w, i) => {
        const offset = i === index ? '0%' : i < index ? '-110%' : '110%'
        return (
          <span
            key={w}
            aria-hidden={i !== index}
            className={`absolute top-0 inset-x-0 text-center whitespace-nowrap ${className ?? ''}`}
            style={{
              transform: `translate3d(0, ${offset}, 0)`,
              opacity: i === index ? 1 : 0,
              transition: 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 350ms ease-out',
              willChange: 'transform, opacity',
            }}
          >
            {w}
          </span>
        )
      })}
    </span>
  )
}
