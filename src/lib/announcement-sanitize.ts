// Sanitize announcement body HTML on the server before storage + before
// email send. The composer (class-portal/src/components/RichTextEditor)
// gives staff bold / italic / underline / strikethrough / lists / links.
// Everything else — scripts, inline styles, event handlers, framesets,
// images, forms — is stripped by this allowlist.
//
// We do not take a sanitize-html / DOMPurify dependency because the surface
// is small and well-defined, and because class-portal and src both have
// their own package.json. Keeping the allowlist as code lives in the repo.
//
// Called from:
//   src/app/api/public/class-portal/announcements/route.ts (on POST)
//   src/app/api/public/class-portal/announcements/[id]/email/route.ts
//     (on email send — only if the stored body already looks like HTML)

/** Inline formatting + list + link tags only. No block media, no forms. */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del',
  'br', 'p', 'div', 'span',
  'ul', 'ol', 'li',
  'a',
])

/** Per-tag attribute allowlist. Everything else is dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
}

/** Entire blocks (open-tag through close-tag INCLUDING their contents)
 *  that we remove outright. Script / style / media / interactive. */
const STRIP_BLOCK_RE = /<\s*(script|style|iframe|object|embed|svg|form|input|button|textarea|select|option|link|meta|noscript|template|audio|video|source|track|img|picture|canvas|map|area)\b[^]*?(?:<\s*\/\s*\1\s*>|$)/gi

/** Any tag whatsoever. We keep allowed ones + strip the rest. The
 *  surrounding text content is preserved (just the tags vanish). */
const TAG_RE = /<\s*(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)\/?\s*>/g

/** Attribute parse: name="value" | name='value' | name=value | name */
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function isSafeHref(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  // Allow absolute http/https/mailto/tel, protocol-relative //, and
  // same-document fragments / relative paths. Explicitly reject
  // anything that could execute script (javascript:, data:, vbscript:).
  if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:')) return false
  if (/^(https?:|mailto:|tel:|#|\/|\.{1,2}\/)/i.test(raw.trim())) return true
  // Reject anything that looks like a scheme we don't know.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.trim())) return false
  // Bare word / relative without a leading slash — accept as same-site.
  return true
}

/** Rebuild an opening tag with only the attributes we allow. */
function cleanOpenTag(tag: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tag]
  if (!allowed) return `<${tag}>`
  const out: string[] = []
  let m: RegExpExecArray | null
  ATTR_RE.lastIndex = 0
  while ((m = ATTR_RE.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase()
    if (!allowed.has(name)) continue
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    // href-specific validation
    if (name === 'href') {
      if (!isSafeHref(value)) continue
      const escaped = value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      out.push(`href="${escaped}"`)
    } else {
      const escaped = value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      out.push(`${name}="${escaped}"`)
    }
  }
  // Links open in a new tab + stop opener leakage.
  if (tag === 'a') {
    out.push('target="_blank"', 'rel="noopener noreferrer"')
  }
  return out.length ? `<${tag} ${out.join(' ')}>` : `<${tag}>`
}

/**
 * Returns a sanitized HTML string safe to render via
 * `dangerouslySetInnerHTML` and safe to drop into email HTML.
 *
 * Strategy:
 *   1. Remove whole dangerous blocks (script/style/iframe/… and content).
 *   2. Walk every remaining tag:
 *        - Allowed tag → emit cleaned opener (dropping stray attrs,
 *          validating href) or closer.
 *        - Disallowed tag → drop the tag; the surrounding text stays.
 *   3. Text between tags is passed through unchanged (no re-escaping —
 *      the composer already produced valid HTML, and double-escaping
 *      breaks entities like &amp; that are already correct).
 *
 * Caller is responsible for size + rate limiting — this does not bound
 * input length. The announcements route caps `body` at a reasonable
 * length before calling in.
 */
export function sanitizeAnnouncementHtml(input: string): string {
  if (!input) return ''
  // Pass 1: nuke blocks with executable or form behaviour.
  let s = String(input).replace(STRIP_BLOCK_RE, '')

  // Pass 2: tag-by-tag allowlist.
  const out: string[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(s)) !== null) {
    const [whole, slash, rawTag, rawAttrs] = m
    out.push(s.slice(lastIdx, m.index))
    const tag = rawTag.toLowerCase()
    const isClose = slash === '/'
    if (ALLOWED_TAGS.has(tag)) {
      if (isClose) {
        out.push(`</${tag}>`)
      } else {
        out.push(cleanOpenTag(tag, rawAttrs || ''))
      }
    }
    // else: drop the tag entirely (text content outside survives).
    lastIdx = m.index + whole.length
  }
  out.push(s.slice(lastIdx))

  return out.join('')
}

/** Legacy plain-text bodies (pre-rich-text) are stored without any HTML
 *  markup. Detect them with a cheap tag-presence check so email + modal
 *  renderers can decide whether to use HTML mode or plain-text mode. */
export function bodyLooksLikeHtml(body: string): boolean {
  if (!body) return false
  // Any opening tag with a known inline tag is enough to call it HTML.
  return /<\s*(b|strong|i|em|u|s|p|br|ul|ol|li|a|div|span)\b/i.test(body)
}

/** Convert a legacy plain-text body to safe HTML so it can be rendered
 *  through the same path as rich-text bodies. Preserves line breaks and
 *  blank-line paragraph separation. */
export function plainTextToHtml(text: string): string {
  const esc = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Double newlines → paragraph break, single newlines → <br>.
  return esc
    .split(/\n{2,}/)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Extract a plain-text version of (possibly) HTML body — used for the
 *  text/plain alternative on emails + for excerpt previews that live
 *  outside the HTML pipeline. */
export function htmlToPlainText(html: string): string {
  return String(html)
    // Block boundaries become double newlines.
    .replace(/<\s*\/\s*(p|div|li|ul|ol|br)\s*>/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    // Strip remaining tags.
    .replace(/<[^>]+>/g, '')
    // Decode a few common entities so plain-text readers see them.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse runs of blank lines.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
