// Outbound email via the Resend HTTP API. SMTP ports are blocked on the VPS, so
// nodemailer/SMTP hangs — always use the HTTP API.
//
// The investor-facing address is main@sapphireclinicseast.org, but Resend only
// delivers from a *verified* domain. We try main@ first; if that domain isn't
// verified yet, we fall back to the verified relay and set reply-to main@.

const PREFERRED_FROM = 'Sapphire Clinics East Inc. <main@sapphireclinicseast.org>'
const FALLBACK_FROM = 'Sapphire Clinics East Inc. <noreply@do-not-reply.sapphireclinicseast.org>'
const REPLY_TO = 'main@sapphireclinicseast.org'

export interface MailAttachment { filename: string; content: string } // content = base64

async function send(from: string, replyTo: string | undefined, to: string, subject: string, html: string, attachments: MailAttachment[]) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: JSON.stringify({ from, ...(replyTo ? { reply_to: replyTo } : {}), to: [to], subject, html, ...(attachments.length ? { attachments } : {}) } as any),
  })
}

// Returns { ok, from, error }.
export async function sendInvestorEmail(opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] }): Promise<{ ok: boolean; from: string; error?: string }> {
  const attachments = opts.attachments || []
  // 1) try main@sapphireclinicseast.org
  let res = await send(PREFERRED_FROM, undefined, opts.to, opts.subject, opts.html, attachments)
  if (res.ok) return { ok: true, from: 'main@sapphireclinicseast.org' }
  const err = await res.json().catch(() => ({} as { message?: string }))
  const msg = (err.message || '').toLowerCase()
  // 2) if the apex domain isn't verified, fall back to the verified relay + reply-to main@
  if (msg.includes('domain') || msg.includes('verif') || res.status === 403) {
    res = await send(FALLBACK_FROM, REPLY_TO, opts.to, opts.subject, opts.html, attachments)
    if (res.ok) return { ok: true, from: 'noreply@do-not-reply.sapphireclinicseast.org (reply-to main@)' }
    const err2 = await res.json().catch(() => ({} as { message?: string }))
    return { ok: false, from: FALLBACK_FROM, error: err2.message || `Resend error ${res.status}` }
  }
  return { ok: false, from: PREFERRED_FROM, error: err.message || `Resend error ${res.status}` }
}
