import { NextResponse, NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const HR_URL = process.env.HR_PLATFORM_URL || 'http://127.0.0.1:3457'
const HR_KEY = process.env.HR_PLATFORM_API_KEY || process.env.EXTERNAL_API_KEY || ''

async function getParams(params: Promise<{ formId: string; responseId: string }>) {
  return params
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ formId: string; responseId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { formId, responseId } = await params
  try {
    const res = await fetch(`${HR_URL}/forms/external/${formId}/responses/${responseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${HR_KEY}` },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ formId: string; responseId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { formId, responseId } = await params
  const body = await req.json()
  try {
    const res = await fetch(`${HR_URL}/forms/external/${formId}/responses/${responseId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${HR_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
