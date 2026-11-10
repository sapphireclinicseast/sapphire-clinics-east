import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchFormTemplates } from '@/lib/form-templates'

// HR Hub "Templates" catalog — every form template (per department).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ templates: await fetchFormTemplates() })
}
