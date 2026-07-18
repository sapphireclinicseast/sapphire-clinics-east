// Conservative allowlist HTML sanitizer for UGAT announcement bodies.
// Announcements are authored by trusted admins through a controlled rich-text
// editor, but they render on the PUBLIC landing page, so we strip everything
// outside a small safe subset (bold/italic/underline, lists, links, images)
// as defense-in-depth. Runs server-side (no DOM) on POST/PATCH.

const ALLOWED: Record<string, string[]> = {
  p: [], br: [], b: [], strong: [], i: [], em: [], u: [], s: [], strike: [],
  ul: [], ol: [], li: [], span: [], div: [], blockquote: [], h3: [], h4: [],
  a: ['href'],
  img: ['src', 'alt'],
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function safeUrl(url: string, kind: 'href' | 'src'): string | null {
  const u = url.trim()
  if (kind === 'src') {
    // Inline images (from the editor's downscaled data URLs) or remote https.
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u)) return u
    if (/^https:\/\//i.test(u)) return u
    return null
  }
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u
  return null
}

export function sanitizeAnnouncementHtml(input: string): string {
  if (!input) return ''
  let html = input
  // Drop whole dangerous blocks and comments outright.
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|title|head|noscript)[\s\S]*?<\/\1\s*>/gi, '')
  html = html.replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')

  // Rewrite every remaining tag, keeping only allowlisted tags + attributes.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash: string, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase()
    if (!(name in ALLOWED)) return '' // drop tag, keep inner text
    if (slash) return `</${name}>`
    const allowedAttrs = ALLOWED[name]
    const kept: string[] = []
    if (allowedAttrs.length) {
      const attrRe = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
      let am: RegExpExecArray | null
      while ((am = attrRe.exec(rawAttrs))) {
        const attr = am[1].toLowerCase()
        if (!allowedAttrs.includes(attr)) continue
        const val = am[3] ?? am[4] ?? am[5] ?? ''
        if (attr === 'href') {
          const safe = safeUrl(val, 'href'); if (!safe) continue
          kept.push(`href="${escapeAttr(safe)}"`)
        } else if (attr === 'src') {
          const safe = safeUrl(val, 'src'); if (!safe) return '' // drop the whole img with a bad src
          kept.push(`src="${escapeAttr(safe)}"`)
        } else if (attr === 'alt') {
          kept.push(`alt="${escapeAttr(val).slice(0, 200)}"`)
        }
      }
    }
    if (name === 'a' && kept.some((k) => k.startsWith('href'))) {
      kept.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
    }
    if (name === 'img') {
      if (!kept.some((k) => k.startsWith('src'))) return '' // img without a safe src is useless
      kept.push('style="max-width:100%;height:auto;border-radius:8px"')
    }
    return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}>`
  })

  return html.trim()
}

// Plain-text length of sanitized HTML (tags + data-URL images excluded), so
// the "is it empty?" check isn't fooled by <br>/<div> scaffolding.
export function announcementTextLength(html: string): number {
  return html
    .replace(/<img\b[^>]*>/gi, 'IMG')     // count an image as content
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length
}
