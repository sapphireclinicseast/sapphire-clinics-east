import { NextResponse } from 'next/server'
import { getSessionPatient } from '@/lib/auth'

export async function GET() {
  const p = await getSessionPatient()
  if (!p) return NextResponse.json({ patient: null })
  return NextResponse.json({ patient: { id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, city: p.city } })
}
