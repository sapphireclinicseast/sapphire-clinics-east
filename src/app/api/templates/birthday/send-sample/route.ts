/**
 * POST /api/templates/birthday/send-sample
 *
 * Sends a test/sample birthday greeting email to a given address so admins can
 * preview how it looks. Renders an email-client-friendly Aura Health Rehab card
 * (solid colors + table layout) with the staff photo embedded inline (cid), and
 * sends it through the connected Gmail account.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient, getLegacyRefreshToken } from '@/lib/email'
import { BRANCHES } from '@/lib/image-gen'
import { getBranchNotifyConfig, getBranchSender } from '@/lib/branch-notify-config'

const esc = (s: string) =>
  String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function buildEmailHtml(name: string, message: string, signoff: string, hasPhoto: boolean): string {
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const photoCell = hasPhoto
    ? `<img src="cid:photo" width="150" height="150" alt="${esc(name)}" style="display:block;width:150px;height:150px;border-radius:50%;border:5px solid #c69849;object-fit:cover;" />`
    : `<table cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" valign="middle" width="150" height="150" style="width:150px;height:150px;border-radius:50%;border:5px solid #c69849;background:#1c3a42;color:#edf3d9;font-family:Arial,sans-serif;font-size:48px;font-weight:bold;">${esc(initials)}</td></tr></table>`
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0c1a16;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0c1a16;padding:28px 12px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;background:#244952;border-radius:18px;overflow:hidden;">
        <tr><td align="center" style="padding:42px 32px 6px;">${photoCell}</td></tr>
        <tr><td align="center" style="padding:18px 32px 0;font-family:Arial,Helvetica,sans-serif;color:#c69849;font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:bold;">&#10024; Happy Birthday &#10024;</td></tr>
        <tr><td align="center" style="padding:8px 24px 0;font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:34px;line-height:1.15;font-weight:bold;">${esc(name)}</td></tr>
        <tr><td align="center" style="padding:16px 0;"><table cellpadding="0" cellspacing="0" role="presentation"><tr><td style="width:54px;height:3px;background:#c69849;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
        <tr><td align="center" style="padding:0 42px 6px;font-family:Arial,Helvetica,sans-serif;color:#e8eef0;font-size:15px;line-height:1.65;">${esc(message)}</td></tr>
        <tr><td align="center" style="padding:10px 42px 0;font-family:Arial,Helvetica,sans-serif;color:rgba(232,238,240,0.75);font-size:14px;line-height:1.6;">${esc(signoff)}</td></tr>
        <tr><td align="center" style="padding:26px 32px 34px;margin-top:14px;font-family:Arial,Helvetica,sans-serif;color:#edf3d9;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">Aura Health Rehab</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, staffName, caption, photoDataUrl, branch } = await req.json()
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return NextResponse.json({ error: 'A valid recipient email is required.' }, { status: 400 })
  }
  if (!staffName?.trim()) {
    return NextResponse.json({ error: 'Staff name is required.' }, { status: 400 })
  }

  const branchData = BRANCHES.find(b => b.id === branch) ?? BRANCHES[0]
  const message = (caption && String(caption).trim())
    || `Wishing ${staffName} a wonderful birthday filled with joy and good health!`
  const signoff = branchData.greeting

  // Inline photo (cid) when a data URL is supplied
  let imgB64 = ''
  let imgMime = 'image/jpeg'
  const m = typeof photoDataUrl === 'string' && photoDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (m) { imgMime = m[1]; imgB64 = m[2] }
  const hasPhoto = !!imgB64

  const html = buildEmailHtml(staffName, message, signoff, hasPhoto)

  // Resolve Gmail credentials (branch mailbox, else any connected account, else
  // legacy env token). This is the PREVIEW of the real birthday greeting, so it
  // has to come from the same address the real one does — otherwise the sample
  // arrives from main@ and the actual send from east@, which is exactly the
  // mismatch that made the sender bug hard to spot.
  // BRANCHES here uses its own ids ('east'/'greenhills'), not the SBEA/SBGH
  // short codes the notify config keys on.
  const SAMPLE_BRANCH_CODE: Record<string, string> = { east: 'SBEA', greenhills: 'SBGH' }
  let refreshToken: string | null = null
  let senderEmail = 'noreply@sapphireclinicseast.org'
  const sampleCode = SAMPLE_BRANCH_CODE[branchData.id]
  const gmailAcct = sampleCode
    ? await getBranchSender(await getBranchNotifyConfig(sampleCode))
    : await prisma.gmailAccount.findFirst()
  if (gmailAcct) { refreshToken = gmailAcct.refreshToken; senderEmail = gmailAcct.email }
  if (!refreshToken) refreshToken = getLegacyRefreshToken()
  if (!refreshToken) return NextResponse.json({ error: 'No Gmail account connected.' }, { status: 500 })

  const gmail = await getGmailClient(refreshToken)

  const subjectText = `Sample — Staff Birthday Greeting (${staffName})`
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subjectText, 'utf-8').toString('base64')}?=`
  const wrap = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n')
  const htmlB64 = wrap(Buffer.from(html, 'utf-8').toString('base64'))

  let raw: string
  if (hasPhoto) {
    const boundary = 'aurabday_' + Date.now().toString(36)
    const lines = [
      `From: Aura Health Rehab <${senderEmail}>`,
      `To: ${email}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlB64,
      `--${boundary}`,
      `Content-Type: ${imgMime}`,
      'Content-Transfer-Encoding: base64',
      'Content-ID: <photo>',
      'Content-Disposition: inline; filename="photo.jpg"',
      '',
      wrap(imgB64),
      `--${boundary}--`,
    ]
    raw = Buffer.from(lines.join('\r\n')).toString('base64url')
  } else {
    const lines = [
      `From: Aura Health Rehab <${senderEmail}>`,
      `To: ${email}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlB64,
    ]
    raw = Buffer.from(lines.join('\r\n')).toString('base64url')
  }

  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Send failed: ' + msg }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
