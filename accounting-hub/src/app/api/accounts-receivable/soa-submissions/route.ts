import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nextSoaReferenceNo, soaBranchCode, soaHmoCode } from '@/lib/soa-ref'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
// The HMO officer owns this record, so the write list includes that role even
// though they cannot record payments.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

const asUrlArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const walletId = searchParams.get('walletId')

  try {
    const submissions = await prisma.soaSubmission.findMany({
      where: walletId ? { walletId } : {},
      orderBy: { submittedDate: 'desc' },
      take: 500,
      select: {
        id: true,
        referenceNo: true,
        walletId: true,
        submittedDate: true,
        transmittalUrls: true,
        documentUrls: true,
        notes: true,
        branch: true,
        createdAt: true,
        createdBy: { select: { name: true } },
        wallet: { select: { patientName: true } },
        items: {
          select: {
            orderId: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                transactionDate: true,
                arCustomDate: true,
                patientName: true,
                items: { select: { name: true } },
                payments: { where: { method: 'HMO' }, select: { amount: true, walletId: true } },
              },
            },
          },
        },
      },
    })
    const scoped = submissions.map(sub => ({
      ...sub,
      items: sub.items.map(i => ({
        ...i,
        order: { ...i.order, payments: i.order.payments.filter(pay => pay.walletId === sub.walletId) },
      })),
    }))
    return NextResponse.json({ submissions: scoped })
  } catch (e) {
    console.error('SOA submissions GET failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { walletId, submittedDate, transmittalUrls, documentUrls, notes, branch, orderIds } = await req.json()
    if (!walletId || !submittedDate) {
      return NextResponse.json({ error: 'HMO provider and date submitted are required' }, { status: 400 })
    }

    const ids: string[] = Array.isArray(orderIds) ? [...new Set(orderIds.filter(Boolean))] : []

    // Every tagged session must actually be billed to the chosen provider.
    // The UI already scopes its list, but a stale tab could post an order that
    // has since moved, and a submission naming the wrong provider is worse than
    // a rejected save.
    if (ids.length > 0) {
      const valid = await prisma.order.count({
        where: { id: { in: ids }, status: { not: 'VOIDED' }, payments: { some: { method: 'HMO', walletId } } },
      })
      if (valid !== ids.length) {
        return NextResponse.json(
          { error: 'Some tagged sessions do not belong to this HMO provider. Reload and try again.' },
          { status: 400 },
        )
      }
    }

    // Reference number is assigned the moment a submission exists:
    // BR-YYYYMMDD-HMO-000x, sequence per exact prefix (no duplicates).
    const [wallet, settings] = await Promise.all([
      prisma.digitalWallet.findUnique({ where: { id: walletId }, select: { patientName: true, branch: true } }),
      prisma.soaSettings.findUnique({ where: { id: 'singleton' }, select: { hmoCodes: true } }),
    ])
    const created = await prisma.$transaction(async (tx) => {
      const referenceNo = await nextSoaReferenceNo(
        tx,
        soaBranchCode(branch || wallet?.branch),
        new Date(submittedDate),
        soaHmoCode(settings?.hmoCodes, walletId, wallet?.patientName || ''),
      )
      return tx.soaSubmission.create({
        data: {
          referenceNo,
          walletId,
          submittedDate: new Date(submittedDate),
          transmittalUrls: asUrlArray(transmittalUrls),
          documentUrls: asUrlArray(documentUrls),
          notes: notes || null,
          branch: branch || null,
          createdById: session.user.id as string,
          items: ids.length ? { create: ids.map(orderId => ({ orderId })) } : undefined,
        },
        select: { id: true, referenceNo: true },
      })
    })

    return NextResponse.json({ id: created.id, referenceNo: created.referenceNo }, { status: 201 })
  } catch (e) {
    console.error('SOA submission POST failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const { id, submittedDate, transmittalUrls, documentUrls, notes, orderIds } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.soaSubmission.findUnique({ where: { id }, select: { walletId: true } })
    if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const ids: string[] | null = Array.isArray(orderIds) ? [...new Set(orderIds.filter(Boolean))] : null
    if (ids && ids.length > 0) {
      const valid = await prisma.order.count({
        where: { id: { in: ids }, status: { not: 'VOIDED' }, payments: { some: { method: 'HMO', walletId: existing.walletId } } },
      })
      if (valid !== ids.length) {
        return NextResponse.json(
          { error: 'Some tagged sessions do not belong to this HMO provider. Reload and try again.' },
          { status: 400 },
        )
      }
    }

    await prisma.$transaction(async tx => {
      await tx.soaSubmission.update({
        where: { id },
        data: {
          ...(submittedDate ? { submittedDate: new Date(submittedDate) } : {}),
          ...(transmittalUrls !== undefined ? { transmittalUrls: asUrlArray(transmittalUrls) } : {}),
          ...(documentUrls !== undefined ? { documentUrls: asUrlArray(documentUrls) } : {}),
          ...(notes !== undefined ? { notes: notes || null } : {}),
        },
      })
      // Replace the tag set wholesale — the screen always posts the full list.
      if (ids) {
        await tx.soaSubmissionItem.deleteMany({ where: { submissionId: id } })
        if (ids.length) {
          await tx.soaSubmissionItem.createMany({ data: ids.map(orderId => ({ submissionId: id, orderId })) })
        }
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('SOA submission PATCH failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    await prisma.soaSubmission.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('SOA submission DELETE failed', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
