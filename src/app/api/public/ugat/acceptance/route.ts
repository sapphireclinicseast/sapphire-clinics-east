// The accepted fellow's Return Service Agreement signing (Part III).
//   GET  → { acceptance, uploadKinds, deadlines }
//   PUT  → save co-maker draft (partial)
//   POST → submit signed soft copy (validates co-maker + IDs + signature)
// Gated: scholar must be ACCEPTED and the admin must have "sent the contract".

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tokenFromRequest } from '@/lib/ugat-auth'
import { generateSignedRsaPdf } from '@/lib/ugat-rsa-pdf'
import { sendUgatSignedRsaEmail } from '@/lib/ugat-email'

export const dynamic = 'force-dynamic'

const TEXT_FIELDS = [
  'comakerFirstName', 'comakerMiddleName', 'comakerLastName', 'comakerEmail', 'comakerOccupation',
  'cmPermAddress1', 'cmPermAddress2', 'cmPermCity', 'cmPermRegion', 'cmPermZip',
  'cmPresAddress1', 'cmPresAddress2', 'cmPresCity', 'cmPresRegion', 'cmPresZip',
  'cmOccAddress1', 'cmOccAddress2', 'cmOccCity', 'cmOccRegion', 'cmOccZip',
] as const

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function ctx(req: Request) {
  const tok = await tokenFromRequest(req)
  if (!tok || tok.role !== 'SCHOLAR' || !tok.scholarId) return null
  const scholar = await prisma.ugatScholar.findUnique({
    where: { id: tok.scholarId },
    select: { id: true, status: true, application: { select: { academicYear: true } }, acceptance: true },
  })
  if (!scholar) return null
  return { scholarId: tok.scholarId, scholar }
}

function cleanBody(body: { comaker?: Record<string, unknown>; comakerBirthdate?: string; cmPresSameAsPerm?: boolean; truthAffirmed?: boolean }) {
  const data: Record<string, unknown> = {}
  const c = body.comaker || {}
  for (const f of TEXT_FIELDS) if (typeof c[f] === 'string') data[f] = str(c[f])
  if (typeof body.cmPresSameAsPerm === 'boolean') data.cmPresSameAsPerm = body.cmPresSameAsPerm
  if (typeof body.truthAffirmed === 'boolean') data.truthAffirmed = body.truthAffirmed
  if (body.comakerBirthdate) { const d = new Date(String(body.comakerBirthdate)); if (!Number.isNaN(d.getTime())) data.comakerBirthdate = d }
  return data
}

export async function GET(req: Request) {
  const c = await ctx(req)
  if (!c) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  const uploads = await prisma.ugatUpload.findMany({ where: { scholarId: c.scholarId }, select: { id: true, kind: true } })
  const uploadKinds = uploads.reduce<Record<string, string>>((m, u) => { m[u.kind] = u.id; return m }, {})
  const ay = c.scholar.application?.academicYear
  const cycle = ay ? await prisma.ugatApplicationCycle.findUnique({ where: { academicYear: ay }, select: { softCopyDeadline: true, hardCopyDeadline: true } }) : null
  return NextResponse.json({
    accepted: c.scholar.status === 'ACCEPTED',
    acceptance: c.scholar.acceptance,
    uploadKinds,
    deadlines: { softCopy: cycle?.softCopyDeadline || null, hardCopy: cycle?.hardCopyDeadline || null },
  })
}

export async function PUT(req: Request) {
  const c = await ctx(req)
  if (!c) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  if (c.scholar.status !== 'ACCEPTED' || !c.scholar.acceptance?.contractSentAt) {
    return NextResponse.json({ error: 'Your contract is not ready to sign yet.' }, { status: 403 })
  }
  if (c.scholar.acceptance?.softCopySignedAt) return NextResponse.json({ error: 'Your agreement has already been signed.' }, { status: 409 })
  let body: Parameters<typeof cleanBody>[0]
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const data = cleanBody(body)
  await prisma.ugatAcceptance.update({ where: { scholarId: c.scholarId }, data })
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const c = await ctx(req)
  if (!c) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  if (c.scholar.status !== 'ACCEPTED' || !c.scholar.acceptance?.contractSentAt) {
    return NextResponse.json({ error: 'Your contract is not ready to sign yet.' }, { status: 403 })
  }
  if (c.scholar.acceptance?.softCopySignedAt) return NextResponse.json({ error: 'Your agreement has already been signed.' }, { status: 409 })
  let body: Parameters<typeof cleanBody>[0]
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const data = cleanBody(body)

  // Required co-maker fields.
  const same = data.cmPresSameAsPerm ?? c.scholar.acceptance?.cmPresSameAsPerm ?? false
  const merged = { ...c.scholar.acceptance, ...data } as Record<string, unknown>
  const required: Record<string, unknown> = {
    "Co-maker's first name": merged.comakerFirstName,
    "Co-maker's last name": merged.comakerLastName,
    "Co-maker's birthdate": merged.comakerBirthdate,
    "Co-maker's email": merged.comakerEmail,
    "Co-maker's occupation": merged.comakerOccupation,
    'Permanent address line 1': merged.cmPermAddress1,
    'Permanent city': merged.cmPermCity,
    'Permanent region': merged.cmPermRegion,
    'Permanent zip': merged.cmPermZip,
    'Occupation address line 1': merged.cmOccAddress1,
    'Occupation city': merged.cmOccCity,
    'Occupation region': merged.cmOccRegion,
    'Occupation zip': merged.cmOccZip,
  }
  if (!same) {
    required['Present address line 1'] = merged.cmPresAddress1
    required['Present city'] = merged.cmPresCity
    required['Present region'] = merged.cmPresRegion
    required['Present zip'] = merged.cmPresZip
  }
  for (const [label, v] of Object.entries(required)) {
    if (!v || (typeof v === 'string' && !v.trim())) return NextResponse.json({ error: `${label} is required.` }, { status: 400 })
  }

  const uploads = await prisma.ugatUpload.findMany({ where: { scholarId: c.scholarId }, select: { kind: true } })
  const kinds = new Set(uploads.map((u) => u.kind))
  const missing: string[] = []
  if (!kinds.has('VALID_ID_1')) missing.push('your Valid ID #1')
  if (!kinds.has('VALID_ID_2')) missing.push('your Valid ID #2')
  if (!kinds.has('COMAKER_ID_1')) missing.push("your co-maker's Valid ID #1")
  if (!kinds.has('COMAKER_ID_2')) missing.push("your co-maker's Valid ID #2")
  if (!kinds.has('RSA_SIGNATURE')) missing.push('your signature')
  if (missing.length) return NextResponse.json({ error: `Please provide: ${missing.join(', ')}.` }, { status: 400 })

  if (!(data.truthAffirmed ?? c.scholar.acceptance?.truthAffirmed)) {
    return NextResponse.json({ error: 'Please tick the agreement statement.' }, { status: 400 })
  }

  const signedAt = new Date()
  await prisma.ugatAcceptance.update({
    where: { scholarId: c.scholarId },
    data: { ...data, cmPresSameAsPerm: !!same, truthAffirmed: true, softCopySignedAt: signedAt },
  })

  // Generate the signed-copy PDF, store it, and email it to the fellow.
  // Best-effort: never fail the signing if PDF/email has trouble.
  try {
    const sch = await prisma.ugatScholar.findUnique({
      where: { id: c.scholarId },
      select: { firstName: true, middleName: true, lastName: true, professionalEmail: true, personalEmail: true, track: true, program: true, school: true, awardMonthly: true, awardMonths: true },
    })
    const sig = await prisma.ugatUpload.findFirst({ where: { scholarId: c.scholarId, kind: 'RSA_SIGNATURE' }, select: { data: true, mimeType: true } })
    if (sch) {
      const fellowName = [sch.firstName, sch.middleName, sch.lastName].filter(Boolean).join(' ')
      const comakerName = [merged.comakerFirstName, merged.comakerMiddleName, merged.comakerLastName].filter(Boolean).map(String).join(' ')
      const pdf = await generateSignedRsaPdf({
        track: sch.track, fellowName, program: sch.program, school: sch.school,
        monthly: sch.awardMonthly, months: sch.awardMonths, comakerName,
        signaturePng: sig?.data ? Buffer.from(sig.data) : null, signatureMime: sig?.mimeType || null,
        dateSigned: signedAt,
      })
      if (pdf) {
        await prisma.ugatUpload.deleteMany({ where: { scholarId: c.scholarId, kind: 'RSA_PDF' } })
        await prisma.ugatUpload.create({ data: { scholarId: c.scholarId, kind: 'RSA_PDF', filename: 'UGAT-Return-Service-Agreement-Signed.pdf', mimeType: 'application/pdf', data: pdf } })
        const emails = [...new Set([sch.personalEmail, sch.professionalEmail].filter(Boolean))]
        if (emails.length) {
          try { await sendUgatSignedRsaEmail({ to: emails, firstName: sch.firstName, track: sch.track, pdf }) }
          catch (e) { console.error('[ugat] signed-RSA email failed:', e) }
        }
      }
    }
  } catch (e) {
    console.error('[ugat] signed-RSA PDF step failed:', e)
  }

  return NextResponse.json({ ok: true, signed: true })
}
