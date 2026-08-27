// RFC 2047 encoding for email headers.
//
// RFC 5322 header fields are ASCII-only. A display name or subject containing
// anything else — most commonly the en dash in "Aura Health Rehab – Greenhills"
// — cannot be written into the header raw: the receiving client reads the
// UTF-8 bytes as Latin-1 and renders mojibake ("Aura Health Rehab Ã¢Â€Â"
// Greenhills"). Declaring charset=utf-8 on the BODY parts does not help,
// because headers carry no charset of their own.
//
// This was fixed once, inline, in the birthday sender and nowhere else, so
// every other sender kept reintroducing it. It lives here now.

/**
 * Encode a header value as an RFC 2047 base64 word if it needs it.
 *
 * Pure-ASCII values are returned untouched — encoding them would work but
 * makes headers unreadable in logs and mail clients that show raw source,
 * and needlessly inflates them.
 */
export function encodeHeaderWord(value: string): string {
  if (!value) return ''
  // Printable ASCII only (no control chars, which are illegal in headers).
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

/**
 * Build a From header value: `Display Name <addr@example.com>`.
 *
 * Only the display name is encoded — the address itself must stay literal or
 * the message is undeliverable.
 */
export function formatFromHeader(displayName: string, address: string): string {
  const name = encodeHeaderWord(displayName || '')
  return name ? `${name} <${address}>` : address
}
