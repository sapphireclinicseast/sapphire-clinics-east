import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  checkPng, isSignatureBranch, MAX_SIGNATURE_BYTES, readSignature, removeSignature, saveSignature,
  signatureStatus, SIGNATURE_BRANCHES, type SignatureBranch,
} from '@/lib/bir2307-signature-store'

/**
 * Taxes → Service Invoice → BIR 2307: the payor's e-signature, per branch.
 *
 *   GET    ?branch=SBGH            → the PNG stamped on that branch's 2307s
 *                                    (uploaded, else the one carried over from the HR hub)
 *   GET    ?status=1               → { signatures: { SBEA: { source, updatedAt }, … } }
 *   POST   multipart file + branches=SBEA,SBGH → store a new signature (PNG)
 *   DELETE ?branches=SBGH          → drop the upload, back to the carried-over one
 *
 * Reading is limited to the roles that can generate a 2307; replacing or
 * removing the signature is ADMIN only. Never served from public/ or /api/files.
 */

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const MANAGE_ROLES = ['ADMIN']

const parseBranches = (raw: string | null | undefined): SignatureBranch[] =>
  [...new Set(String(raw || '').split(',').map(s => s.trim()).filter(isSignatureBranch))]

export async function GET(req: Request) {
  const session = await auth()
  const role = session?.user?.role as string | undefined
  if (!session?.user || !role || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  if (sp.get('status')) {
    return NextResponse.json({ signatures: await signatureStatus(), canManage: MANAGE_ROLES.includes(role) })
  }
  const branch = sp.get('branch') || 'SBEA'
  if (!isSignatureBranch(branch)) return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })
  const sig = await readSignature(branch)
  if (!sig) return NextResponse.json({ error: 'No signature on file' }, { status: 404 })
  return new NextResponse(new Uint8Array(sig.bytes), {
    headers: {
      'Content-Type': 'image/png',
      // It can be replaced at any time — never let a browser keep an old copy.
      'Cache-Control': 'private, no-store',
      'X-Signature-Source': sig.source,
    },
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !MANAGE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only an admin can change the 2307 e-signature' }, { status: 403 })
  }
  try {
    const form = await req.formData()
    const file = form.get('file')
    const branches = parseBranches(form.get('branches') as string | null)
    if (!branches.length) return NextResponse.json({ error: `Pick at least one branch (${SIGNATURE_BRANCHES.join(', ')})` }, { status: 400 })
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No image uploaded' }, { status: 400 })
    if (file.size > MAX_SIGNATURE_BYTES) return NextResponse.json({ error: 'Signature image too large (max 2 MB)' }, { status: 400 })
    const buf = Buffer.from(await file.arrayBuffer())
    const check = checkPng(buf)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    await saveSignature(branches, buf)
    return NextResponse.json({ ok: true, branches, signatures: await signatureStatus() })
  } catch (e) {
    console.error('2307 signature upload error:', e)
    return NextResponse.json({ error: 'Failed to save the signature' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !MANAGE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Only an admin can change the 2307 e-signature' }, { status: 403 })
  }
  const branches = parseBranches(new URL(req.url).searchParams.get('branches'))
  if (!branches.length) return NextResponse.json({ error: 'Pick at least one branch' }, { status: 400 })
  try {
    await removeSignature(branches)
    return NextResponse.json({ ok: true, branches, signatures: await signatureStatus() })
  } catch (e) {
    console.error('2307 signature remove error:', e)
    return NextResponse.json({ error: 'Failed to remove the signature' }, { status: 500 })
  }
}
