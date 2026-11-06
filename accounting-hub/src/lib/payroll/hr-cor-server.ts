import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { planCorSync, type HrCorFile, type HrCorStaff } from '@/lib/payroll/hr-cor'

const HR_PLATFORM_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY || ''
const headers = () => ({ Authorization: `Bearer ${EXTERNAL_API_KEY}` })

/** Who has a COR in the HR Hub, or null when the HR Hub can't be read. */
export async function fetchHrCorStaff(): Promise<HrCorStaff[] | null> {
  try {
    const res = await fetch(`${HR_PLATFORM_URL}/staff/external/cor`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!res.ok) { console.error(`[hr-cor] HR Hub returned ${res.status}`); return null }
    const data = await res.json()
    return data?.ok === true && Array.isArray(data.staff) ? data.staff : null
  } catch (e) {
    console.error('[hr-cor] HR Hub fetch error:', e)
    return null
  }
}

/**
 * Brings consultants' CORs in line with the HR Hub. Never throws, and changes
 * nothing when the HR Hub can't be read, so an outage can't take a COR away.
 */
export async function syncCorFromHr(): Promise<{ updated: number; unmatched: string[] } | null> {
  const hrStaff = await fetchHrCorStaff()
  if (!hrStaff) return null
  try {
    const consultants = await prisma.consultant.findMany({ select: { id: true, name: true, corUrl: true, corUploadedAt: true, no2303At: true } })
    const { updates, unmatched } = planCorSync(consultants, hrStaff)
    for (const u of updates) await prisma.consultant.update({ where: { id: u.id }, data: u.data })
    return { updated: updates.length, unmatched }
  } catch (e) {
    console.error('[hr-cor] Sync failed:', e)
    return null
  }
}

export async function fetchHrCorFile(staffId: string, file: HrCorFile): Promise<Uint8Array | null> {
  const res = await fetch(`${HR_PLATFORM_URL}/staff/external/cor/${encodeURIComponent(staffId)}/${encodeURIComponent(file.id)}`, {
    headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(20000),
  })
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
}

/**
 * A COR is often several photos of one form. Everything that shows a COR has one
 * link, so pages are combined into one PDF. Null when a page can't be combined
 * (a format pdf-lib can't read), so the caller can fall back to the first file.
 */
export async function combineCorPages(pages: { bytes: Uint8Array; file: HrCorFile }[]): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.create()
    for (const { bytes, file } of pages) {
      const name = file.originalName.toLowerCase()
      if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
        const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
        for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page)
        continue
      }
      const image = file.mimetype === 'image/png' || name.endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      const scale = Math.min(1, 612 / image.width, 792 / image.height)
      const width = image.width * scale
      const height = image.height * scale
      pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
    }
    return await pdf.save()
  } catch (e) {
    console.error('[hr-cor] Could not combine pages:', e)
    return null
  }
}
