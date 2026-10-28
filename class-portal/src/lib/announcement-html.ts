// Shared client helpers for announcement bodies — detect plain text vs
// HTML, convert, and sanitize before rendering through
// dangerouslySetInnerHTML. The server-side ops-hub also sanitizes; this
// is defense in depth for the client (and for the rare case where a
// stored body was created before the server sanitizer existed).
//
// The allowlist mirrors src/lib/announcement-sanitize.ts on the ops hub.

/** Inline formatting + list + link tags only. */
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'BR', 'P', 'DIV', 'SPAN',
  'UL', 'OL', 'LI',
  'A',
])

/** Per-tag allowed attributes. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href']),
}

function isSafeHref(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:')) return false
  if (/^(https?:|mailto:|tel:|#|\/|\.{1,2}\/)/i.test(raw.trim())) return true
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.trim())) return false
  return true
}

/** DOM-walking sanitizer. Removes disallowed tags (keeping their text
 *  content), strips stray attributes, validates href, and forces
 *  target+rel on links. Walks the tree depth-first and mutates in
 *  place. Safe to call on any innerHTML. */
export function sanitizeHtml(input: string): string {
  if (typeof document === 'undefined') return input // SSR passthrough; server does the real work
  const wrapper = document.createElement('div')
  wrapper.innerHTML = input
  walk(wrapper)
  return wrapper.innerHTML
}

function walk(node: Node): void {
  // Copy children before iterating because we mutate the tree.
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as HTMLElement
      const tag = el.tagName
      if (!ALLOWED_TAGS.has(tag)) {
        // Replace this element with its unwrapped text content
        // (recursively sanitized first).
        walk(el)
        const parent = el.parentNode
        if (!parent) continue
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
        continue
      }
      // Strip disallowed attributes.
      const allowed = ALLOWED_ATTRS[tag] ?? null
      const attrs = Array.from(el.attributes)
      for (const a of attrs) {
        const name = a.name.toLowerCase()
        if (!allowed || !allowed.has(name)) {
          el.removeAttribute(a.name)
          continue
        }
        if (name === 'href' && !isSafeHref(a.value)) {
          el.removeAttribute('href')
          continue
        }
      }
      if (tag === 'A') {
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      walk(el)
    }
    // Text / comment nodes pass through (comments are harmless; browser
    // renders nothing).
  }
}

/** Cheap tag-presence check — matches the server-side bodyLooksLikeHtml.
 *  Any opening tag of a known inline tag is enough. */
export function bodyLooksLikeHtml(body: string): boolean {
  if (!body) return false
  return /<\s*(b|strong|i|em|u|s|p|br|ul|ol|li|a|div|span)\b/i.test(body)
}

/** Escape plain text for safe injection into HTML. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Convert a legacy plain-text body into HTML with the same visual
 *  shape as before: paragraphs on blank lines, single newlines as
 *  <br>. */
export function plainTextToHtml(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Produce the HTML string a modal / list card can hand straight to
 *  dangerouslySetInnerHTML. Takes a stored body (plain or HTML) and
 *  returns sanitized HTML. */
export function renderAnnouncementBodyHtml(body: string): string {
  if (!body) return ''
  const html = bodyLooksLikeHtml(body) ? body : plainTextToHtml(body)
  return sanitizeHtml(html)
}
