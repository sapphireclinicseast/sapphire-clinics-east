'use client'

// Deep-linking from global search.
//
// A search hit navigates to `/section?focus=<identifier>`. The destination page
// calls useFocusTarget() to learn which record to reveal, then calls done() once
// it has revealed it — which strips ?focus= from the URL. Clearing matters for
// two reasons: a refresh shouldn't re-trigger the jump, and searching the same
// record twice must produce a URL that differs from the current one, otherwise
// the router treats it as a no-op and nothing happens.
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function useFocusTarget(): { focus: string; done: () => void } {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get('focus') || ''
  const [focus, setFocus] = useState(raw)

  useEffect(() => { setFocus(raw) }, [raw])

  const done = useCallback(() => {
    setFocus('')
    const next = new URLSearchParams(Array.from(params.entries()))
    next.delete('focus')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  return { focus, done }
}

/** Scroll a row into view and flash it, so the eye lands on the right line. */
export function revealRow(el: HTMLElement | null) {
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('focus-flash')
  window.setTimeout(() => el.classList.remove('focus-flash'), 2600)
}
