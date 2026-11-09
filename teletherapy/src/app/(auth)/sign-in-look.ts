// ── SCEI staff sign-in look ──────────────────────────────────────────────────
// Shared by every staff-facing hub (Operations, HR, Accounting, Staff Portal);
// this matches the Operations Hub sign-in (PR #999). Hex values on purpose —
// each app's CSS variables differ, the sign-in screens must not.
import type { CSSProperties } from 'react'

export const C = {
  narra: '#244952', moss: '#4A8073', ink: '#1A1A1A', muted: '#667085',
  line: '#D9E1CC',
}

const display: CSSProperties = { fontFamily: 'var(--font-display)' }

export const labelClass = 'block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]'
export const labelStyle = display

export const inputClass =
  'w-full h-11 px-3.5 rounded-lg text-sm bg-white text-[#1A1A1A] border border-[#D9E1CC] outline-none ' +
  'transition-[border-color,box-shadow] focus:border-[#4A8073] focus:shadow-[0_0_0_3px_rgba(74,128,115,0.18)]'
export const inputStyle: CSSProperties = { fontFamily: 'var(--font-body)' }

export const eyeButtonClass = 'absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#667085]'

export const errorClass = 'text-sm rounded-lg px-4 py-2.5 bg-[#FEF2F2] border border-[#FECACA] text-[#B42318]'

export const primaryButtonClass =
  'w-full h-11 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#244952] ' +
  'transition-opacity hover:opacity-90 disabled:opacity-55 disabled:cursor-not-allowed'
export const primaryButtonStyle = display

export const linkClass = 'text-sm font-medium text-[#4A8073] transition-opacity hover:opacity-80'

export const h2Style: CSSProperties = { ...display, fontSize: '1.125rem', fontWeight: 700, color: C.ink }
export const helperClass = 'text-sm leading-relaxed text-[#667085]'
