// Monochrome line icons for the event games — one stroke weight, round
// caps, currentColor — so every icon reads as one set (replaces the emoji).
import type { SVGProps } from 'react'

export type GIconName =
  | 'gift'
  | 'ticket'
  | 'confetti'
  | 'medal'
  | 'speech'
  | 'bird'
  | 'wrench'
  | 'refresh'
  | 'dizzy'
  | 'cherub'
  | 'monitor'
  | 'qr'

// 24×24 viewBox paths. Shared with the Flappy canvas (see CANVAS_PATHS).
export const ICON_PATHS: Record<GIconName, string[]> = {
  monitor: ['M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5z', 'M8 20h8', 'M12 16v4', 'M9 9.5l3-2 3 2-3 2z'],
  qr: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h2v2h-2z', 'M18 14h2v2h-2z', 'M14 18h2v2h-2z', 'M18 18h2v2h-2z'],
  gift: [
    'M3 8h18v4H3z',
    'M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8',
    'M12 8v13',
    'M12 8c-1.6 0-4.2-.6-4.2-2.6a2.1 2.1 0 0 1 4.2 0',
    'M12 8c1.6 0 4.2-.6 4.2-2.6a2.1 2.1 0 0 0-4.2 0',
  ],
  ticket: [
    'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5z',
    'M14 6.5v1.5M14 11v2M14 15.5v1.5',
  ],
  confetti: [
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    'M19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
    'M5 3.5l.5 1.5L7 5.5l-1.5.5L5 7.5l-.5-1.5L3 5.5l1.5-.5z',
  ],
  medal: ['M7 9a5 5 0 1 0 10 0a5 5 0 1 0-10 0', 'M9.2 13.3L7.5 21l4.5-2.4 4.5 2.4-1.7-7.7', 'M12 7.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z'],
  speech: ['M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z', 'M8.8 11.2h.4M11.8 11.2h.4M14.8 11.2h.4'],
  bird: [
    'M4.5 12.5a6.5 6.5 0 1 1 6.5 6.5H7.5l-3.5 2 1.2-4A6.5 6.5 0 0 1 4.5 12.5z',
    'M17.6 10.2l3.4 1.2-3.4 1.2',
    'M8 13.5c2.2 0 3.6-1.1 4.4-3.1',
    'M13.3 9.2h.3',
  ],
  wrench: [
    'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9L6.7 20.3a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  ],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  dizzy: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M8.5 16c1-1.1 2.2-1.7 3.5-1.7s2.5.6 3.5 1.7', 'M7.8 8.8l2.4 2.4M10.2 8.8l-2.4 2.4M13.8 8.8l2.4 2.4M16.2 8.8l-2.4 2.4'],
  cherub: [
    'M8 3.4a4 1.3 0 1 0 8 0a4 1.3 0 1 0-8 0',
    'M9 8.2a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M12 11.2v5.6',
    'M9.4 13.4c-2.3-1-3.8-3-4.3-6 2.6 1 4.2 3 4.3 6z',
    'M14.6 13.4c2.3-1 3.8-3 4.3-6-2.6 1-4.2 3-4.3 6z',
    'M9.4 20h5.2',
  ],
}

export function GIcon({
  name,
  size = 24,
  strokeWidth = 1.75,
  ...rest
}: { name: GIconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {ICON_PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
