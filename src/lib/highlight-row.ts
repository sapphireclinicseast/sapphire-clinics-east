// Scroll a specific row into view and flash it, for notification deep links.
//
// Clicking a notification used to land on the list page with no indication of
// which row it was about — on a page of 25 patients that is no better than not
// linking at all. The notification knows the id; this puts the eye on it.

const HIGHLIGHT_MS = 2600

/**
 * Finds `[data-row-id="<id>"]`, scrolls it into view and flashes it.
 *
 * Retries because the row is almost never in the DOM when the deep link is
 * read: the list is still being fetched, and on a paginated page the caller
 * also has to switch page first. Gives up rather than polling forever — a row
 * that never appears (deleted, or filtered out) must not spin in the background.
 *
 * Returns a cleanup function so React effects can cancel a pending search.
 */
export function flashRow(id: string, opts: { attempts?: number; intervalMs?: number } = {}): () => void {
  const attempts = opts.attempts ?? 40          // ~8s at the default interval
  const intervalMs = opts.intervalMs ?? 200
  let tries = 0
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let clearHighlight: ReturnType<typeof setTimeout> | undefined

  function attempt() {
    if (cancelled) return
    // CSS.escape guards ids with quotes or brackets; not all older browsers
    // have it, so fall back to the raw id rather than throwing.
    const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    const el = document.querySelector<HTMLElement>(`[data-row-id="${safe}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const prev = { outline: el.style.outline, offset: el.style.outlineOffset, transition: el.style.transition }
      el.style.transition = 'outline-color 300ms ease'
      el.style.outline = '2px solid var(--teal, #0F766E)'
      el.style.outlineOffset = '-2px'
      clearHighlight = setTimeout(() => {
        // Restore exactly what was there: these rows already carry their own
        // background/border styling (converted, partner, new), and blanking the
        // properties outright would strip it.
        el.style.outline = prev.outline
        el.style.outlineOffset = prev.offset
        el.style.transition = prev.transition
      }, HIGHLIGHT_MS)
      return
    }
    if (++tries >= attempts) return
    timer = setTimeout(attempt, intervalMs)
  }

  attempt()

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
    if (clearHighlight) clearTimeout(clearHighlight)
  }
}
