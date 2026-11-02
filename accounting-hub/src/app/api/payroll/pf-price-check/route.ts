import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { consultantServices, rateIssues, ratesForService, sessionIssues } from '@/lib/payroll/pf-price-server'

const READ_ROLES = ['ADMIN', 'PAYROLL_OFFICER', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'VIEWER']
const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/payroll/pf-price-check[?since=YYYY-MM-DD]
 * PF (unit pay) above what the clinic charges: consultant rates set above the
 * price of a service they cover, and sessions since `since` (default Jan 1 this
 * year) whose PF came to more than they were charged.
 *
 * GET /api/payroll/pf-price-check?consultantId=…
 * The services each unit pay pays that consultant for, with prices — the rate
 * editor warns as a PF above one of them is typed.
 *
 * GET /api/payroll/pf-price-check?unitPayId=…&name=…&department=…&branch=…[&serviceId=…]
 * The consultants whose PF that service (as being edited) would pay, with their
 * rates — the Services page warns as a price below one of them is typed.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams

  const unitPayId = sp.get('unitPayId')
  if (unitPayId) {
    const rates = await ratesForService({
      id: sp.get('serviceId'), unitPayId,
      name: sp.get('name') || '', department: sp.get('department') || '', branch: sp.get('branch') || 'ALL',
    })
    return NextResponse.json({ rates })
  }

  const consultantId = sp.get('consultantId')
  if (consultantId) {
    const services = await consultantServices(consultantId)
    if (!services) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })
    return NextResponse.json({ services })
  }

  const thisYear = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4)
  const since = YMD.test(sp.get('since') || '') ? sp.get('since')! : `${thisYear}-01-01`
  const [rates, sessions] = await Promise.all([
    rateIssues(),
    sessionIssues(new Date(`${since}T00:00:00+08:00`)),
  ])
  return NextResponse.json({ since, rates, sessions })
}
