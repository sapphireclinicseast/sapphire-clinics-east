import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendGmail, gmailConfigured, type Mailbox } from '@/lib/gmail'

const WRITE_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

const MARKETING_HUB_URL = process.env.MARKETING_HUB_URL || 'https://operations.sapphireclinicseast.org'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''

const HR_MAILBOX: Record<string, Mailbox> = {
  SBEA: 'hr.east', SANDBOX_EAST: 'hr.east',
  SBGH: 'hr.gh', SANDBOX_GREENHILLS: 'hr.gh',
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DEPT_SERVICE: Record<string, string> = {
  PT: 'physical therapy services', OT: 'occupational therapy services', SLP: 'speech therapy services',
  SPED: 'special education services', MD: 'medical consultation services', PSYCHOLOGY: 'psychological services',
  ORTHOSIS: 'orthosis and prosthesis services', EDU: 'training services',
}
const peso = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function cutoffLabel(cp: string): string {
  const [y, m, h] = cp.split('-')
  return `${MONTHS[parseInt(m) - 1]} ${y} (${h === '1' ? '1st' : '2nd'} half)`
}

/**
 * POST /api/payroll/si-reminder
 *   { consultantId, cutoffPeriods: string[], channel?: 'EMAIL' | 'SMS', preview?: true }
 *
 * Computes the Service Invoice breakdown for the chosen cutoffs — the figures
 * the consultant should put on their BIR Service Invoice (gross professional
 * fees, the expanded withholding we deducted, net, and a description of the
 * services) — from their finalized payroll entries, then sends it as an email
 * or SMS reminder. preview:true returns the breakdown without sending, so the
 * tab can show the computation (and the multi-month selector drives which
 * cutoffs make up one invoice when a consultant files several months at once).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { consultantId, cutoffPeriods, channel, preview } = await req.json()
    if (!consultantId) return NextResponse.json({ error: 'consultantId is required' }, { status: 400 })
    const cutoffs: string[] = Array.isArray(cutoffPeriods) ? cutoffPeriods.filter(c => /^\d{4}-\d{2}-[12]$/.test(String(c))) : []
    if (!cutoffs.length) return NextResponse.json({ error: 'Pick at least one cutoff' }, { status: 400 })

    const consultant = await prisma.consultant.findUnique({
      where: { id: consultantId },
      select: { id: true, name: true, department: true, branch: true, email: true, phone: true, tinNumber: true, corUrl: true },
    })
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

    // Finalized figures only — a reminder must quote what payroll actually paid.
    const entries = await prisma.payrollEntry.findMany({
      where: { consultantId, cutoffPeriod: { in: cutoffs }, status: { in: ['LOCKED', 'FINAL'] } },
      select: { cutoffPeriod: true, grossPay: true, taxAmount: true, netPay: true },
      orderBy: { cutoffPeriod: 'asc' },
    })
    if (!entries.length) {
      return NextResponse.json({ error: 'No finalized payroll for the selected cutoff(s) — generate/finalize payroll first.' }, { status: 400 })
    }

    const gross = entries.reduce((s, e) => s + Number(e.grossPay), 0)
    const ewt = entries.reduce((s, e) => s + Number(e.taxAmount), 0)
    const net = gross - ewt
    const ewtRate = gross > 0 ? Math.round((ewt / gross) * 1000) / 10 : 0
    const periods = [...new Set(entries.map(e => e.cutoffPeriod))].sort()
    const periodLabels = periods.map(cutoffLabel).join(', ')
    const service = DEPT_SERVICE[consultant.department] || 'professional services'
    const description = `Professional fees — ${service} rendered to Aura Health Rehab, ${periodLabels}`
    const breakdown = {
      consultant: consultant.name,
      periods, periodLabels,
      gross: Math.round(gross * 100) / 100,
      ewt: Math.round(ewt * 100) / 100,
      ewtRate,
      net: Math.round(net * 100) / 100,
      description,
      coveredEntries: entries.length,
      email: consultant.email || null,
      phone: consultant.phone || null,
    }
    if (preview === true) return NextResponse.json({ preview: true, breakdown })

    const firstName = (consultant.name.split(',')[1] || consultant.name).trim().split(' ')[0] || consultant.name

    if (channel === 'SMS') {
      if (!consultant.phone) return NextResponse.json({ error: 'No phone number on file for this consultant.' }, { status: 400 })
      if (!EXTERNAL_API_KEY) return NextResponse.json({ error: 'SMS relay is not configured (EXTERNAL_API_KEY missing).' }, { status: 503 })
      const message =
        `Hi ${firstName}! Friendly reminder from Aura Health Rehab to issue your BIR Service Invoice for your professional fees — ${periodLabels}. ` +
        `Gross: P${peso(breakdown.gross)} | Less EWT (${ewtRate}%): P${peso(breakdown.ewt)} | Net: P${peso(breakdown.net)}. ` +
        `Description: ${description}. Please submit the invoice to the clinic admin. Thank you!`
      const smsBranch = consultant.branch === 'SBGH' ? 'SBGH' : 'SBEA'
      const res = await fetch(`${MARKETING_HUB_URL}/api/sms/external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EXTERNAL_API_KEY}` },
        body: JSON.stringify({ branch: smsBranch, to: consultant.phone, message }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return NextResponse.json({ error: d.error || `SMS relay returned ${res.status}` }, { status: 502 })
      return NextResponse.json({ sent: true, channel: 'SMS', to: consultant.phone, breakdown })
    }

    // Default: email.
    if (!consultant.email) return NextResponse.json({ error: 'No email address on file for this consultant.' }, { status: 400 })
    if (!gmailConfigured()) return NextResponse.json({ error: 'Email is not configured on the server.' }, { status: 503 })
    const row = (label: string, value: string, strong = false) =>
      `<tr><td style="padding:6px 12px;border:1px solid #e3e8e8;color:#333;">${label}</td><td style="padding:6px 12px;border:1px solid #e3e8e8;text-align:right;font-family:monospace;${strong ? 'font-weight:700;color:#244952;' : 'color:#333;'}">${value}</td></tr>`
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#edf3d9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:linear-gradient(135deg,#244952,#4a8073);padding:32px 40px;text-align:center;">
      <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase;">Aura Health Rehab</p>
    </div>
    <div style="padding:36px 40px;">
      <h1 style="color:#244952;font-size:20px;margin:0 0 16px;">Dear ${firstName},</h1>
      <p style="color:#333;line-height:1.7;font-size:15px;margin:0 0 16px;">
        This is a friendly reminder to issue your <strong>BIR Service Invoice</strong> for your professional
        fees covering <strong>${periodLabels}</strong>, per your Certificate of Registration.
      </p>
      <p style="color:#333;line-height:1.7;font-size:15px;margin:0 0 10px;">For your invoice, here is the computation from our records:</p>
      <table style="border-collapse:collapse;width:100%;margin:0 0 16px;">
        ${row('Gross professional fees', `₱${peso(breakdown.gross)}`)}
        ${row(`Less: Expanded Withholding Tax (${ewtRate}%)`, `₱${peso(breakdown.ewt)}`)}
        ${row('Net amount received', `₱${peso(breakdown.net)}`, true)}
      </table>
      <p style="color:#333;line-height:1.7;font-size:14px;margin:0 0 16px;">
        <strong>Suggested description of services:</strong><br>${description}
      </p>
      <p style="color:#333;line-height:1.7;font-size:14px;margin:0 0 16px;">
        Kindly submit the Service Invoice to the clinic administration. The withheld tax above is remitted by the
        clinic on your behalf and your BIR Form 2307 is available on request.
      </p>
      <p style="color:#244952;font-weight:700;font-size:15px;margin:0;">The Aura Health Rehab Administration Team</p>
    </div>
  </div></body></html>`
    const mailbox = HR_MAILBOX[consultant.branch] || 'main'
    const res = await sendGmail({
      to: consultant.email,
      mailbox,
      subject: `Service Invoice reminder — ${periodLabels} | Aura Health Rehab`,
      html,
    })
    if (!res.ok) return NextResponse.json({ error: res.error || 'Email send failed' }, { status: 502 })
    return NextResponse.json({ sent: true, channel: 'EMAIL', to: consultant.email, from: res.from, breakdown })
  } catch (e) {
    console.error('SI reminder error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to send reminder' }, { status: 500 })
  }
}
