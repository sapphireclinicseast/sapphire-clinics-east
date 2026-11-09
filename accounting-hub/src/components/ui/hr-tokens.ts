// HR Hub palette tokens and page frame, without 'use client', so server
// components (e.g. the Dashboard) can use them too. hr-look.tsx re-exports these.
import type { CSSProperties } from 'react'

export const HR_VARS = {
  '--off-white': '#F6F8EE',   // paper
  '--light-gray': '#DDE6CC',  // border
  '--mid-gray': '#55616A',    // secondary text
  '--charcoal': '#233038',    // text
  '--teal': '#4A8073',        // Aura green (buttons, accents)
  '--deep-teal': '#3C6A5F',
  '--pale-teal': '#EDF3D9',
  '--hr-line': '#E9EFDC',     // row lines
  '--hr-faint': '#8A9AA0',
  '--hr-head': '#f8faf6',     // table header / toolbar
} as CSSProperties

/** Root wrapper: fills the dashboard's content area (its padding included) with the HR paper. */
export const HR_PAGE_CLASS = '-m-4 lg:-m-6 p-4 lg:p-6 space-y-4 min-h-[calc(100%+2rem)] lg:min-h-[calc(100%+3rem)]'
export const HR_PAGE_STYLE: CSSProperties = { ...HR_VARS, background: 'var(--off-white)', color: 'var(--charcoal)' }
