import { NextResponse } from 'next/server'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { readPartners, writePartners, publicPartner, type PartnerInvoice } from '@/lib/partners'

// Admin-only (guarded by middleware matcher /api/admin/*). Admin uploads a manually
// written sales invoice; it appears in that partner's portal for download.

const UPLOAD_ROOT = join(process.cwd(), 'public', 'uploads', 'partner-invoices')
const ALLOWED = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const partnerId = String(form.get('partnerId') || '')
    const file = form.get('file') as File | null
    if (!partnerId || !file) return NextResponse.json({ error: 'partnerId and file are required.' }, { status: 400 })

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED.includes(ext)) return NextResponse.json({ error: 'Allowed file types: PDF, JPG, PNG, WEBP.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 15MB).' }, { status: 400 })

    const partners = await readPartners()
    const idx = partners.findIndex((p) => p.id === partnerId)
    if (idx === -1) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })

    const token = randomBytes(8).toString('hex') // unguessable filename component
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60) || `invoice.${ext}`
    const stored = `${token}-${safe}`
    const dir = join(UPLOAD_ROOT, partnerId)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()))

    const invoice: PartnerInvoice = {
      id: token,
      filename: file.name,
      url: `/api/uploads/partner-invoices/${partnerId}/${stored}`,
      uploadedAt: new Date().toISOString(),
    }
    partners[idx].invoices = [invoice, ...(partners[idx].invoices || [])]
    await writePartners(partners)
    return NextResponse.json({ ok: true, partner: publicPartner(partners[idx]) })
  } catch (e) {
    console.error('Partner invoice upload error:', e)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const partnerId = searchParams.get('partnerId') || ''
    const invoiceId = searchParams.get('invoiceId') || ''
    const partners = await readPartners()
    const idx = partners.findIndex((p) => p.id === partnerId)
    if (idx === -1) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })

    const inv = (partners[idx].invoices || []).find((i) => i.id === invoiceId)
    partners[idx].invoices = (partners[idx].invoices || []).filter((i) => i.id !== invoiceId)
    await writePartners(partners)
    if (inv) {
      try { await unlink(join(process.cwd(), 'public', inv.url.replace('/api/uploads/', 'uploads/'))) } catch {}
    }
    return NextResponse.json({ ok: true, partner: publicPartner(partners[idx]) })
  } catch (e) {
    console.error('Partner invoice delete error:', e)
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 })
  }
}
