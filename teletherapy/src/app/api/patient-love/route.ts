import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractStrength } from '@/lib/patient-love'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = session.user.role === 'ADMIN'

  // Get all staffIds this clinician has (interbranch)
  const staffIds = isAdmin
    ? undefined // admin sees all? No — require specific staff for admin too via ?staffId
    : (session.user.branches ?? []).map((b: any) => b.staffId)

  // Optional staffId query param — for admin or branch switching
  const requestedStaffId = req.nextUrl.searchParams.get('staffId')

  const where: any = {}
  if (!isAdmin) {
    if (requestedStaffId && staffIds?.includes(requestedStaffId)) {
      where.staffId = requestedStaffId
    } else {
      where.staffId = { in: staffIds }
    }
  } else if (requestedStaffId) {
    where.staffId = requestedStaffId
  }

  try {
    // @ts-ignore — SurveyResponse model exists in marketing DB, not fully migrated
    const responses = await prisma.surveyResponse.findMany({
      where,
      select: {
        id: true,
        surveyType: true,
        respondentName: true,
        branch: true,
        responsesJson: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: 'desc' },
      take: 200,
    })

    // Extract strengths from each response
    const strengths: Array<{
      id: string
      text: string
      surveyType: string
      branch: string
      submittedAt: Date
      respondent: string | null
    }> = []

    for (const r of responses) {
      const text = extractStrength(r.surveyType, r.responsesJson)
      if (text) {
        strengths.push({
          id: r.id,
          text,
          surveyType: r.surveyType,
          branch: r.branch,
          submittedAt: r.submittedAt,
          respondent: null, // Always anonymous for confidentiality
        })
      }
    }

    return NextResponse.json({ strengths })
  } catch (err) {
    // Table might not exist yet in teletherapy DB
    return NextResponse.json({ strengths: [], error: 'Survey data unavailable' })
  }
}
