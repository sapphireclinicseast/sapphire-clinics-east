import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * UTC calendar date (YYYY-MM-DD) of an instant. This is a serialisation, NOT
 * "the clinic's today": between 00:00 and 08:00 Asia/Manila it returns
 * yesterday. For anything a person reads as a day, use manilaDateString().
 */
export function toDateString(date: Date | string): string {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

// Every clinic runs on Asia/Manila (UTC+8, no DST), whatever the browser's or
// server's own timezone is.
const MANILA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Manila calendar date (YYYY-MM-DD) of an instant — defaults to "today in Manila". */
export function manilaDateString(d: Date = new Date()): string {
  const parts = MANILA_DAY.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Shift a YYYY-MM-DD Manila day by whole days, without passing through UTC midnight. */
export function shiftDateString(s: string, days: number): string {
  const d = new Date(`${s}T00:00:00+08:00`)
  // Manila has no DST, so a day is always 24h.
  return manilaDateString(new Date(d.getTime() + days * 86_400_000))
}
