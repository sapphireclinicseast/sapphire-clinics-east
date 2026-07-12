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

const LOGO_BASE = 'https://accounting.sapphireclinicseast.org'
const peso = (n: number) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Branded, table-based, inline-CSS email shell (renders across Gmail/Outlook/Apple Mail).
export function emailShell(opts: { heading: string; subheading?: string; bodyHtml: string; preheader?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f5;">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;box-shadow:0 2px 10px rgba(15,23,42,0.06);">
        <tr><td style="padding:24px 24px 20px;border-bottom:1px solid #eceff2;">
          <table role="presentation" width="100%"><tr><td align="center">
            <img src="${LOGO_BASE}/scei-logo-full.png" alt="Sapphire Clinics East" height="38" style="height:38px;vertical-align:middle;margin:6px 12px;"/>
            <img src="${LOGO_BASE}/aura-logo.png" alt="Aura Health Rehab" height="38" style="height:38px;vertical-align:middle;margin:6px 12px;"/>
            <img src="${LOGO_BASE}/brand/verdana-logo.png" alt="Verdana" height="38" style="height:38px;vertical-align:middle;margin:6px 12px;"/>
          </td></tr></table>
        </td></tr>
        <tr><td style="height:5px;background:#0f766e;"></td></tr>
        <tr><td style="padding:30px 34px 6px;">
          <h1 style="margin:0;font-size:21px;line-height:1.3;color:#0f172a;font-weight:700;">${opts.heading}</h1>
          ${opts.subheading ? `<p style="margin:6px 0 0;font-size:13px;color:#64748b;">${opts.subheading}</p>` : ''}
        </td></tr>
        <tr><td style="padding:10px 34px 30px;font-size:14px;line-height:1.75;color:#334155;">${opts.bodyHtml}</td></tr>
        <tr><td style="padding:22px 34px;background:#f7f9fb;border-top:1px solid #eceff2;font-size:12px;line-height:1.6;color:#94a3b8;">
          <p style="margin:0 0 4px;color:#334155;font-weight:700;">Sapphire Clinics East Inc.</p>
          <p style="margin:0;">Aura Health Rehab · Verdana · main@sapphireclinicseast.org</p>
          <p style="margin:8px 0 0;">Please keep this email for your records. Replies reach us at main@sapphireclinicseast.org.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// Common-share dividend notice.
export function dividendEmailHtml(o: { name: string; perShare: number; shares: number; amount: number; date: Date; type: string }): string {
  const dt = o.type === 'SPECIAL' ? 'special' : 'regular'
  const dateStr = o.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  return emailShell({
    heading: 'Your dividend has been released',
    subheading: `${dt.charAt(0).toUpperCase() + dt.slice(1)} cash dividend · ${dateStr}`,
    preheader: `Your ${dt} dividend of ${peso(o.amount)} has been released.`,
    bodyHtml: `
      <p>Dear ${o.name},</p>
      <p>We are pleased to share that the Board has declared a <strong>${dt}</strong> cash dividend of <strong>${peso(o.perShare)}</strong> per share.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#475569;">Your common shares</td><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#0f172a;text-align:right;font-weight:700;">${o.shares.toLocaleString('en-PH')}</td></tr>
        <tr><td style="padding:12px 16px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">Dividend per share</td><td style="padding:12px 16px;font-size:13px;color:#0f172a;text-align:right;border-top:1px solid #e2e8f0;">${peso(o.perShare)}</td></tr>
        <tr><td style="padding:14px 16px;font-size:14px;color:#0f766e;font-weight:700;border-top:2px solid #0f766e;">Your total dividend</td><td style="padding:14px 16px;font-size:16px;color:#0f766e;text-align:right;font-weight:800;border-top:2px solid #0f766e;">${peso(o.amount)}</td></tr>
      </table>
      <p>Thank you for standing with us. Your partnership is a quiet but powerful part of everything we're able to do, and we don't take it for granted. We remain dedicated to growing this company thoughtfully and to keeping the trust you've shown us well-placed.</p>
      <p style="margin-bottom:0;">Your proof of deposit is attached. With gratitude,<br/><strong>Sapphire Clinics East Inc.</strong></p>`,
  })
}

// Advance repayment / deposit notice (shareholder advances).
export function advanceEmailHtml(o: { name: string; amount: number; date: Date }): string {
  const dateStr = o.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  return emailShell({
    heading: 'Your advance has been repaid',
    subheading: `Deposited ${dateStr}`,
    preheader: `${peso(o.amount)} toward your advance has been deposited.`,
    bodyHtml: `
      <p>Dear ${o.name},</p>
      <p>We're glad to confirm that <strong>${peso(o.amount)}</strong> toward your advance was deposited to your account today, <strong>${dateStr}</strong>.</p>
      <p>We don't take for granted what it means that you extended this support to Sapphire Clinics East. Your confidence in us is a responsibility we carry with real care, and honoring it — on time, in full, and transparently — is part of how we keep faith with the people who believed in us early. Thank you for standing with us; it genuinely helps us keep caring for the families and patients we serve.</p>
      <p style="margin-bottom:0;">Your proof of deposit is attached for your records. With sincere gratitude,<br/><strong>Sapphire Clinics East Inc.</strong></p>`,
  })
}

// Loan amortization / repayment notice — warm and grateful, mirrors the advance note.
export function loanPaymentEmailHtml(o: { name: string; amount: number; date: Date; principalPortion?: number; interestPortion?: number }): string {
  const dateStr = o.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  const p = Number(o.principalPortion || 0), i = Number(o.interestPortion || 0)
  const breakdown = (p > 0 || i > 0)
    ? `<p style="color:#475569;font-size:14px;">This payment covers ${p > 0 ? `<strong>${peso(p)}</strong> in principal` : ''}${p > 0 && i > 0 ? ' and ' : ''}${i > 0 ? `<strong>${peso(i)}</strong> in interest` : ''}.</p>`
    : ''
  return emailShell({
    heading: 'Your loan payment has been deposited',
    subheading: `Deposited ${dateStr}`,
    preheader: `${peso(o.amount)} toward your loan has been deposited.`,
    bodyHtml: `
      <p>Dear ${o.name},</p>
      <p>We're glad to confirm that <strong>${peso(o.amount)}</strong> toward your loan was deposited to your account on <strong>${dateStr}</strong>.</p>
      ${breakdown}
      <p>We don't take for granted what it means that you extended this support to Sapphire Clinics East. Your trust is a responsibility we carry with real care, and honoring it — on schedule, in full, and transparently — is part of how we keep faith with the people who believed in us early. Thank you for standing with us; it genuinely helps us keep caring for the families and patients we serve.</p>
      <p style="margin-bottom:0;">Your proof of payment is attached for your records. With sincere gratitude,<br/><strong>Sapphire Clinics East Inc.</strong></p>`,
  })
}

// Scholarship monthly-stipend release notice.
export function scholarshipEmailHtml(o: { name: string; amount: number; date: Date; periodLabel?: string; scholarshipType?: string | null }): string {
  const dateStr = o.date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  return emailShell({
    heading: 'Your scholarship stipend has been released',
    subheading: `${o.periodLabel ? o.periodLabel + ' · ' : ''}Deposited ${dateStr}`,
    preheader: `Your scholarship stipend of ${peso(o.amount)} has been deposited.`,
    bodyHtml: `
      <p>Dear ${o.name},</p>
      <p>We are pleased to let you know that your scholarship stipend${o.scholarshipType ? ` (<strong>${o.scholarshipType}</strong>)` : ''} of <strong>${peso(o.amount)}</strong> was deposited to your account on <strong>${dateStr}</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        ${o.periodLabel ? `<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#475569;">Covered month</td><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#0f172a;text-align:right;font-weight:700;">${o.periodLabel}</td></tr>` : ''}
        <tr><td style="padding:14px 16px;font-size:14px;color:#0f766e;font-weight:700;border-top:2px solid #0f766e;">Amount released</td><td style="padding:14px 16px;font-size:16px;color:#0f766e;text-align:right;font-weight:800;border-top:2px solid #0f766e;">${peso(o.amount)}</td></tr>
      </table>
      <p>Keep going — we're proud to walk this journey with you, and we can't wait to see all that you'll do. Study well, take care of yourself, and reach out anytime you need us.</p>
      <p style="margin-bottom:0;">Your proof of deposit is attached for your records. With warm encouragement,<br/><strong>Sapphire Clinics East Inc.</strong></p>`,
  })
}

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
