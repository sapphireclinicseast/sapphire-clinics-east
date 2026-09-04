// Icons for the LOA upload buttons.
//
// Inline SVG rather than emoji: 📷 and 📎 render as full-colour pictures that
// differ on every platform (and on some Android builds sit on their own
// baseline, knocking the label out of line). These are monochrome, inherit the
// button's colour through currentColor, and sit on the text baseline.
//
// Not lucide-react, though it is already a dependency: these are public,
// unauthenticated pages a patient loads on mobile data, and two paths are
// cheaper than pulling an icon package into that bundle.

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  style: { flexShrink: 0 },
}

export function CameraIcon() {
  return (
    <svg {...base}>
      <path d="M14.5 4h-5L8 6.5H4.5A1.5 1.5 0 0 0 3 8v10a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V8a1.5 1.5 0 0 0-1.5-1.5H16Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

export function PaperclipIcon() {
  return (
    <svg {...base}>
      <path d="M20 11.5 12.4 19a4.5 4.5 0 0 1-6.4-6.4l7.7-7.6a3 3 0 1 1 4.3 4.2l-7.6 7.7a1.5 1.5 0 1 1-2.2-2.1l6.9-6.9" />
    </svg>
  )
}

/** Icon + label on one baseline, centred — the shape both buttons want. */
export function ButtonLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem' }}>
      {icon}
      {children}
    </span>
  )
}
