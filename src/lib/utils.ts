import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Local calendar dates (YYYY-MM-DD) ────────────────────────────────────────
// NEVER use `new Date().toISOString().split('T')[0]` to get "today" — that
// converts to UTC first. The clinic runs in Manila (UTC+8), so between
// midnight and 8:00 AM local it yields YESTERDAY's date. That produced a
// Clinic Schedule that showed the previous day every morning, and a
// "Tomorrow" quick-filter that pointed at today.
//
// These read the LOCAL calendar fields instead, so they always match the
// date on the user's own wall clock.

export function toLocalDateStr(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function localTodayStr(): string {
  return toLocalDateStr(new Date())
}

/** Local calendar date `days` from today (negative = past). */
export function localDateStrOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toLocalDateStr(d)
}

export function localTomorrowStr(): string {
  return localDateStrOffset(1)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getAge(dob: Date | string): number {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export function isPediatric(dob: Date | string): boolean {
  return getAge(dob) < 18
}
