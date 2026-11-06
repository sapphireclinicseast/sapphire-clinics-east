import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { HR_COR_ROLES } from '@/lib/payroll/hr-cor'
import { combineCorPages, fetchHrCorFile, fetchHrCorStaff } from '@/lib/payroll/hr-cor-server'

export const dynamic = 'force-dynamic'

const VIEWABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

function fileResponse(bytes: Uint8Array, contentType: string, filename: string) {
  const viewable = VIEWABLE.includes(contentType)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': viewable ? contentType : 'application/octet-stream',
      'Content-Disposition': `${viewable ? 'inline' : 'attachment'}; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// GET — a consultant's COR as held in the HR Hub, shown through this hub's own login.
export async function GET(_req: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const session = await auth()
  if (!session?.user || !HR_COR_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { staffId } = await params
  const hrStaff = await fetchHrCorStaff()
  if (!hrStaff) return NextResponse.json({ error: 'Could not reach the HR Hub. Try again shortly.' }, { status: 502 })
  const person = hrStaff.find(s => s.hrId === staffId)
  if (!person?.files.length) return NextResponse.json({ error: 'This COR is no longer in the HR Hub' }, { status: 404 })

  try {
    const pages = await Promise.all(person.files.map(async file => ({ file, bytes: await fetchHrCorFile(staffId, file) })))
    const readable = pages.filter((p): p is { file: typeof p.file; bytes: Uint8Array } => !!p.bytes)
    if (!readable.length) return NextResponse.json({ error: 'The COR file could not be read from the HR Hub' }, { status: 502 })
    const first = readable[0]
    if (readable.length > 1) {
      const combined = await combineCorPages(readable)
      if (combined) return fileResponse(combined, 'application/pdf', `COR-${person.lastName}.pdf`)
    }
    return fileResponse(first.bytes, first.file.mimetype, first.file.originalName)
  } catch (e) {
    console.error('[hr-cor] File fetch failed:', e)
    return NextResponse.json({ error: 'The COR file could not be read from the HR Hub' }, { status: 502 })
  }
}
