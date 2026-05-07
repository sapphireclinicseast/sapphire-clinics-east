/**
 * DELETE /api/patients/[id]/admin-wipe
 *
 * Admin-only "delete all clinical data" for a single patient. Wipes:
 *   - Every SessionNote on every schedule belonging to the patient
 *     (including all attachment files on disk referenced from each
 *     note's attachments JSON array).
 *   - Every PatientDocument for the patient (IE / PR / Other), and
 *     each document's file on disk.
 *
 * Schedules and the Patient record itself are intentionally NOT
 * deleted — only the clinical artifacts (notes + documents) are
 * removed, so the schedule history still exists for audit/billing.
 *
 * Locks (SessionNote.lockedAt / PatientDocument.lockedAt) do not
 * apply here — they're a clinician-level guard, not an admin guard.
 *
 * Body (optional):
 *   { confirmName: "FIRST LAST" }
 * If supplied, must match the patient's name exactly (case-insensitive,
 * trimmed). This is a soft second factor to make accidental wipes
 * harder; the server still requires admin role regardless.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

async function bestEffortUnlink(relPath: string | null | undefined) {
  if (!relPath) return
  try {
    await unlink(path.join(UPLOAD_DIR, relPath))
  } catch {
    // Files may already be gone on disk (manual cleanup, restored
    // from backup without files, etc.). Don't fail the wipe over a
    // missing file — the DB row removal is the source of truth.
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin-only. The session role comes from the JWT and is
  // populated from TherapistAccount.role at sign-in. Regular
  // clinicians (THERAPIST role) get a flat 403 with no fallthrough.
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Only the main admin can wipe a patient\'s clinical data.' },
      { status: 403 },
    )
  }

  const { id: patientId } = await params

  // Sanity-check the patient exists before the cascade so the response
  // can include the name in the audit log entry below.
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  // Optional name confirmation. Doesn't replace admin auth — it's a
  // second-factor against accidental clicks. We compare on uppercased,
  // collapsed whitespace so "Hannah Jara" and "  HANNAH   JARA " both
  // match.
  const body = await _req.json().catch(() => ({}))
  if (typeof body?.confirmName === 'string' && body.confirmName.length > 0) {
    const normalize = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim()
    const expected = normalize(`${patient.firstName} ${patient.lastName}`)
    const got = normalize(body.confirmName)
    if (expected !== got) {
      return NextResponse.json(
        { error: `Name confirmation mismatch — expected "${patient.firstName} ${patient.lastName}".` },
        { status: 400 },
      )
    }
  }

  // ── Gather file paths first so we can clean disk after the DB tx ──
  // We do disk cleanup after the transaction so a DB rollback (e.g.
  // unique constraint failure on a sibling table we didn't expect)
  // doesn't leave orphan-deleted files. Worst case if disk cleanup
  // fails: orphan files. That's recoverable; the inverse (DB still
  // referencing missing files) is not.
  const notes = await prisma.sessionNote.findMany({
    where: { schedule: { patientId } },
    select: { id: true, attachments: true },
  })

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore patientDocument is fine; tolerate stale generated client
  const docs = await prisma.patientDocument.findMany({
    where: { patientId },
    select: { id: true, filePath: true },
  })

  // Collect every attachment path across every note. Attachments are
  // stored as Json arrays of { fileName, filePath, ... } objects.
  const noteAttachmentPaths: string[] = []
  for (const n of notes) {
    if (!Array.isArray(n.attachments)) continue
    for (const att of n.attachments as Array<{ filePath?: string }>) {
      if (att && typeof att.filePath === 'string') {
        noteAttachmentPaths.push(att.filePath)
      }
    }
  }

  const docFilePaths = docs.map((d) => d.filePath).filter((p): p is string => !!p)

  // ── DB wipe in a single transaction ──
  await prisma.$transaction([
    prisma.sessionNote.deleteMany({
      where: { schedule: { patientId } },
    }),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore see above
    prisma.patientDocument.deleteMany({
      where: { patientId },
    }),
  ])

  // ── Best-effort disk cleanup AFTER successful DB wipe ──
  await Promise.all([
    ...noteAttachmentPaths.map(bestEffortUnlink),
    ...docFilePaths.map(bestEffortUnlink),
  ])

  // Lightweight audit trail — admin wipes are rare, log to stdout so
  // it lands in pm2's log files. If you ever need formal audit you
  // can swap this for a real AuditLog table.
  console.log(
    `[ADMIN-WIPE] patient=${patient.firstName} ${patient.lastName} (${patient.id}) ` +
    `by=${session.user.email ?? session.user.id} ` +
    `notes=${notes.length} docs=${docs.length} ` +
    `attachments=${noteAttachmentPaths.length}`,
  )

  return NextResponse.json({
    success: true,
    deleted: {
      sessionNotes: notes.length,
      patientDocuments: docs.length,
      attachmentFiles: noteAttachmentPaths.length,
    },
  })
}
