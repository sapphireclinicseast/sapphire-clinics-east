'use client'

// `<Portal>` renders its children at `document.body` instead of inline
// in the React tree. That escapes any `transform`'d ancestor (e.g. the
// `animate-fade-up` wrapper used on /classes and /classes/[id]), which
// would otherwise become the containing block for `position: fixed`
// descendants and re-anchor modals to wherever the page is scrolled
// instead of the viewport — forcing the user to scroll up to see the
// modal's top after opening it from a section far down the page.
//
// Usage:
//   return (
//     <Portal>
//       <div className="fixed inset-0 z-50 …">…</div>
//     </Portal>
//   )

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Portal({ children }: { children: ReactNode }) {
  // Defer the portal mount until after hydration. SSR has no document,
  // and rendering the portal during SSR throws.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
