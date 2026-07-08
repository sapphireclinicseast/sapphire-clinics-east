import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// HR Hub "Templates" catalog — public, no-auth list of every form template
// (per department). Base URL defaults to the live templates subdomain so no
// extra env var is required on the VPS; override with HR_TEMPLATES_URL if needed.
const HR_TEMPLATES_URL = (process.env.HR_TEMPLATES_URL || 'https://templates.sapphireclinicseast.org').replace(/\/$/, '')

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const res = await fetch(`${HR_TEMPLATES_URL}/api/templates/public`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ templates: [] })
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = Array.isArray(data?.templates) ? (data.templates as any[]) : []
    const seen = new Set<string>()
    const templates = raw
      .map((t) => ({
        templateNo: String(t?.templateNo || '').trim(),
        templateName: String(t?.templateName || '').trim(),
        department: String(t?.department || '').trim() || 'Other',
        massProduced: /^y/i.test(String(t?.massProduced || '')),
      }))
      .filter((t) => t.templateNo || t.templateName)
      // De-dupe (the catalog has a few exact repeats, e.g. PT08).
      .filter((t) => {
        const k = `${t.templateNo}|${t.templateName}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ templates: [] })
  }
}
