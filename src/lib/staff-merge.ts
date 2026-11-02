// Staff merge — fold one Staff profile into another and delete the loser.
//
// Lives here rather than in the route so it can be exercised against a scratch
// database without going through auth (Next route files may only export their
// HTTP handlers).
//
// The usual case is an interbranch clinician who was entered once per branch.
// The model for those (Eunice de la Fuente, Sheena Therese Daya) is ONE Staff
// row whose extraBranches lists the other branch and whose branchEmployment has
// an entry per branch, each with its own bio employeeId. So the merge unions
// both of those from the losing profile instead of throwing its branch away.
//
// Deleting a Staff row is the dangerous part. Almost every foreign key onto
// Staff is ON DELETE CASCADE in the live database — PatientBooking included,
// whatever the Prisma schema says — so anything not moved first is destroyed
// without a word. Several more tables hold a staff id with no foreign key at
// all, and some of those belong to the staff portal (teletherapy), which shares
// this database but not this Prisma schema; those are written with raw SQL.
// Every one is handled below, and before the delete a check against the
// Postgres catalogue refuses to go on while any foreign-keyed row still points
// at the losing profile — so a relation added later fails loudly here instead
// of cascading.
//
// History: until 2026-11-02 the route moved only Schedule, Survey*, Decking*
// and AssessmentTarget. The Janelle Gamba (#204→#202) and Joan Athena Yap
// (#201→#098) merges that day were done by hand in SQL because of it;
// zz_backup_20261102_staff_merge in sapphire_marketing records what moved.
//
// Two systems this cannot reach, reported back as notes:
//  - HR Platform. The nightly staff sync is driven by HR's feed. If HR still
//    lists the losing profile on its own, the sync recreates it as a new, empty
//    row and resets the kept row's branches to HR's view. Merge in HR as well.
//  - Accounting Hub. Its Consultant rows mirror Staff via externalStaffId. Its
//    consultant sync retires the losing profile's Consultant as a "merged twin"
//    once that id leaves the staff feed. Payslips stay on that Consultant row.
import type { Prisma, Staff } from '@prisma/client'

/** A merge that was stopped before anything was written. */
export class StaffMergeRefused extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

export interface StaffMergeResult {
  kept: { id: string; name: string; branch: string; extraBranches: string[] }
  removed: { id: string; name: string; branch: string }
  /** Rows re-pointed from the losing profile to the kept one, by table. */
  moved: Record<string, number>
  /** Losing-profile rows deleted because the kept profile already had the
   *  equivalent (a unique key would otherwise collide), by table. */
  dropped: Record<string, number>
  notes: string[]
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

// Same shape HR sends per branch (see HRBranchEmployment in staff-sync.ts).
function ownBranchEntry(s: Staff) {
  return {
    employmentType: s.employmentType,
    employeeId:     s.employeeId,
    department:     s.department,
    jobTitle:       s.jobTitle,
    arrangement:    s.workArrangement,
  }
}

function fullName(s: Staff) {
  return `${s.firstName} ${s.lastName}`
}

export async function mergeStaff(
  tx: Prisma.TransactionClient,
  keepId: string,
  deleteId: string,
): Promise<StaffMergeResult> {
  const moved: Record<string, number> = {}
  const dropped: Record<string, number> = {}
  const tally = (into: Record<string, number>, table: string, n: number) => {
    if (n > 0) into[table] = (into[table] ?? 0) + n
  }

  // Lock both rows so two merges, or a merge and a sync, cannot interleave.
  await tx.$queryRaw`SELECT id FROM "Staff" WHERE id IN (${keepId}, ${deleteId}) FOR UPDATE`
  const keep = await tx.staff.findUnique({ where: { id: keepId } })
  const lose = await tx.staff.findUnique({ where: { id: deleteId } })
  if (!keep || !lose) {
    throw new StaffMergeRefused('One of the two staff profiles no longer exists. Reload the page and try again.', 404)
  }

  // ── Staff portal login (TherapistAccount, ON DELETE RESTRICT) ────────────
  // A Staff row can have one login, and the login carries its own session
  // notes, patient assignments and settings. Two logins cannot be folded into
  // one automatically, so that case stops here before anything is written.
  const accounts = await tx.$queryRaw<{ staffId: string; email: string }[]>`
    SELECT "staffId", email FROM "TherapistAccount" WHERE "staffId" IN (${keepId}, ${deleteId})`
  const keepAccount = accounts.find(a => a.staffId === keepId)
  const loseAccount = accounts.find(a => a.staffId === deleteId)
  if (keepAccount && loseAccount) {
    throw new StaffMergeRefused(
      `Both profiles have their own staff portal login (${keepAccount.email} for ${keep.branch}, ` +
      `${loseAccount.email} for ${lose.branch}). A profile can only have one, and each login has its ` +
      `own session notes and patient assignments, so one of them has to be retired by hand first. ` +
      `Nothing was changed.`,
    )
  }
  if (loseAccount) {
    tally(moved, 'TherapistAccount', await tx.$executeRaw`
      UPDATE "TherapistAccount" SET "staffId" = ${keepId}, "updatedAt" = now() WHERE "staffId" = ${deleteId}`)
    // Mentor availability is keyed by the login (which just moved) plus a
    // display copy of the staff id.
    tally(moved, 'AvailabilitySlot', await tx.$executeRaw`
      UPDATE "AvailabilitySlot" SET "staffId" = ${keepId} WHERE "staffId" = ${deleteId}`)
  }

  // Sessions from before Schedule.branch existed have it null, and readers
  // fall back to the clinician's profile branch. On the kept profile that
  // would read as the kept profile's branch, so fill in the branch they were
  // booked under while it is still knowable: when the losing profile only
  // ever covered the one branch.
  if (lose.branch !== keep.branch && lose.extraBranches.length === 0) {
    tally(moved, 'Schedule (legacy, branch filled in)', (await tx.schedule.updateMany({
      where: { staffId: deleteId, branch: null }, data: { branch: lose.branch },
    })).count)
  }

  // ── Plain re-points: no unique key involves the staff id ─────────────────
  tally(moved, 'Schedule',        (await tx.schedule.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'Schedule.intern',  (await tx.schedule.updateMany({ where: { internStaffId: deleteId }, data: { internStaffId: keepId } })).count)
  tally(moved, 'SurveyAssignment', (await tx.surveyAssignment.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'SurveyResponse',   (await tx.surveyResponse.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'DeckingSlot',      (await tx.deckingSlot.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'PatientBooking',   (await tx.patientBooking.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'CancellationLog',  (await tx.cancellationLog.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'NoShowLog',        (await tx.noShowLog.updateMany({ where: { staffId: deleteId }, data: { staffId: keepId } })).count)
  tally(moved, 'ClassPortalUser',  (await tx.classPortalUser.updateMany({ where: { linkedStaffId: deleteId }, data: { linkedStaffId: keepId } })).count)
  tally(moved, 'BalikTanaw', await tx.$executeRaw`
    UPDATE "BalikTanaw" SET "internStaffId" = ${keepId} WHERE "internStaffId" = ${deleteId}`)

  // A patient's alternate picks on a booking are {staffId, date, ...} objects.
  // Approving one reads that staffId, so a dangling id would break it.
  tally(moved, 'PatientBooking.alternateChoices', await tx.$executeRaw`
    UPDATE "PatientBooking"
    SET "alternateChoices" = (
      SELECT jsonb_agg(
        CASE WHEN e->>'staffId' = ${deleteId}
             THEN jsonb_set(e, '{staffId}', to_jsonb(${keepId}::text))
             ELSE e END
        ORDER BY ord)
      FROM jsonb_array_elements("alternateChoices") WITH ORDINALITY AS t(e, ord)
    )
    WHERE jsonb_typeof("alternateChoices") = 'array'
      AND "alternateChoices" @> jsonb_build_array(jsonb_build_object('staffId', ${deleteId}::text))`)

  // ── DeckingTherapistConfig — unique on (staffId, branch, deliveryMode) ───
  // Where the kept profile already has a config for the same branch AND the
  // same service, the kept one wins (it is the live one). deliveryMode can be
  // null (the general schedule); Prisma matches that as IS NULL, which the
  // unique index itself would not catch, so the check has to be done here.
  for (const cfg of await tx.deckingTherapistConfig.findMany({ where: { staffId: deleteId } })) {
    const existing = await tx.deckingTherapistConfig.findFirst({
      where: { staffId: keepId, branch: cfg.branch, deliveryMode: cfg.deliveryMode },
    })
    if (existing) {
      await tx.deckingTherapistConfig.delete({ where: { id: cfg.id } })
      tally(dropped, 'DeckingTherapistConfig', 1)
    } else {
      await tx.deckingTherapistConfig.update({ where: { id: cfg.id }, data: { staffId: keepId } })
      tally(moved, 'DeckingTherapistConfig', 1)
    }
  }

  // ── AssessmentTarget — unique on (staffId, year): add the counts together ─
  for (const target of await tx.assessmentTarget.findMany({ where: { staffId: deleteId } })) {
    const existing = await tx.assessmentTarget.findFirst({ where: { staffId: keepId, year: target.year } })
    if (existing) {
      await tx.assessmentTarget.update({
        where: { id: existing.id },
        data: {
          targetCount: existing.targetCount + target.targetCount,
          completed:   existing.completed   + target.completed,
        },
      })
      await tx.assessmentTarget.delete({ where: { id: target.id } })
      tally(dropped, 'AssessmentTarget (summed into kept)', 1)
    } else {
      await tx.assessmentTarget.update({ where: { id: target.id }, data: { staffId: keepId } })
      tally(moved, 'AssessmentTarget', 1)
    }
  }

  // ── PeerEvalAdminConfig — one per staff ──────────────────────────────────
  const loseAdminCfg = await tx.peerEvalAdminConfig.findUnique({ where: { staffId: deleteId } })
  if (loseAdminCfg) {
    if (await tx.peerEvalAdminConfig.findUnique({ where: { staffId: keepId } })) {
      await tx.peerEvalAdminConfig.delete({ where: { id: loseAdminCfg.id } })
      tally(dropped, 'PeerEvalAdminConfig', 1)
    } else {
      await tx.peerEvalAdminConfig.update({ where: { id: loseAdminCfg.id }, data: { staffId: keepId } })
      tally(moved, 'PeerEvalAdminConfig', 1)
    }
  }

  // ── PeerEvalAssignment — unique on (assessor, assessee, form, year, month) ─
  // Branch is not part of that key, so the East and Greenhills profiles of one
  // person can each hold a row that becomes the same row once merged. A row
  // that has not been answered yet is expendable; a submitted one is not. Two
  // submitted evaluations that collide cannot both survive, so that stops the
  // merge rather than choosing which evaluation to throw away.
  const peerRows = await tx.peerEvalAssignment.findMany({
    where: { OR: [{ assessorId: deleteId }, { assesseeId: deleteId }] },
    include: { response: { select: { id: true } } },
  })
  for (const a of peerRows) {
    const assessorId = a.assessorId === deleteId ? keepId : a.assessorId
    const assesseeId = a.assesseeId === deleteId ? keepId : a.assesseeId
    const answered = a.status === 'COMPLETED' || !!a.response

    // The two profiles were set to evaluate each other: after the merge that
    // is someone rating themselves. Drop it unless it was already submitted.
    if (assessorId === assesseeId && !answered) {
      await tx.peerEvalAssignment.delete({ where: { id: a.id } })
      tally(dropped, 'PeerEvalAssignment (self, unanswered)', 1)
      continue
    }

    const clash = await tx.peerEvalAssignment.findFirst({
      where: {
        assessorId, assesseeId,
        formType: a.formType, periodYear: a.periodYear, periodMonth: a.periodMonth,
        NOT: { id: a.id },
      },
      include: { response: { select: { id: true } } },
    })
    if (clash) {
      const clashAnswered = clash.status === 'COMPLETED' || !!clash.response
      if (!answered) {
        await tx.peerEvalAssignment.delete({ where: { id: a.id } })
        tally(dropped, 'PeerEvalAssignment (duplicate, unanswered)', 1)
        continue
      }
      if (clashAnswered) {
        const period = a.periodMonth === 0 ? `full year ${a.periodYear}` : `${a.periodYear}-${String(a.periodMonth).padStart(2, '0')}`
        throw new StaffMergeRefused(
          `Both profiles have a submitted ${a.formType} peer evaluation for the same pairing and period ` +
          `(${period}). Only one can be kept after a merge, so decide which in Peer Evaluation first. ` +
          `Nothing was changed.`,
        )
      }
      await tx.peerEvalAssignment.delete({ where: { id: clash.id } })
      tally(dropped, 'PeerEvalAssignment (duplicate, unanswered)', 1)
    }
    await tx.peerEvalAssignment.update({ where: { id: a.id }, data: { assessorId, assesseeId } })
    tally(moved, 'PeerEvalAssignment', 1)
  }
  // Responses carry their own copy of both ids.
  tally(moved, 'PeerEvalResponse', (await tx.peerEvalResponse.updateMany({ where: { assessorId: deleteId }, data: { assessorId: keepId } })).count)
  tally(moved, 'PeerEvalResponse', (await tx.peerEvalResponse.updateMany({ where: { assesseeId: deleteId }, data: { assesseeId: keepId } })).count)

  // ── PeerEvalEmailLog — unique on (assessor, branch, year, month) ─────────
  // Only a record that the reminder went out; where both have one, keep one.
  for (const log of await tx.peerEvalEmailLog.findMany({ where: { assessorId: deleteId } })) {
    const existing = await tx.peerEvalEmailLog.findFirst({
      where: { assessorId: keepId, branch: log.branch, periodYear: log.periodYear, periodMonth: log.periodMonth },
    })
    if (existing) {
      await tx.peerEvalEmailLog.delete({ where: { id: log.id } })
      tally(dropped, 'PeerEvalEmailLog', 1)
    } else {
      await tx.peerEvalEmailLog.update({ where: { id: log.id }, data: { assessorId: keepId } })
      tally(moved, 'PeerEvalEmailLog', 1)
    }
  }

  // ── Intern supervision (staff portal tables, no foreign keys) ────────────
  // InternGrade is one grade per (intern, supervisor) and LearningProfile one
  // per intern. Where both profiles have one, the more recently edited stands.
  // (updatedAt, id) is a strict order, so exactly one of each pair goes.
  tally(dropped, 'InternGrade (older duplicate)', await tx.$executeRaw`
    DELETE FROM "InternGrade" AS older
    USING "InternGrade" AS newer
    WHERE older."internStaffId" IN (${keepId}, ${deleteId})
      AND newer."internStaffId" IN (${keepId}, ${deleteId})
      AND older."internStaffId" <> newer."internStaffId"
      AND older."supervisorAccountId" = newer."supervisorAccountId"
      AND (older."updatedAt", older.id) < (newer."updatedAt", newer.id)`)
  tally(moved, 'InternGrade', await tx.$executeRaw`
    UPDATE "InternGrade" SET "internStaffId" = ${keepId} WHERE "internStaffId" = ${deleteId}`)
  tally(dropped, 'LearningProfile (older duplicate)', await tx.$executeRaw`
    DELETE FROM "LearningProfile" AS older
    USING "LearningProfile" AS newer
    WHERE older."internStaffId" IN (${keepId}, ${deleteId})
      AND newer."internStaffId" IN (${keepId}, ${deleteId})
      AND older."internStaffId" <> newer."internStaffId"
      AND (older."updatedAt", older.id) < (newer."updatedAt", newer.id)`)
  tally(moved, 'LearningProfile', await tx.$executeRaw`
    UPDATE "LearningProfile" SET "internStaffId" = ${keepId} WHERE "internStaffId" = ${deleteId}`)

  // Supervision / mentorship meetings list invitees as parallel id and name
  // arrays. Accounting's mentorship payroll reads these ids, so a dangling one
  // would show as "(unknown)". If both profiles were invited, keep one entry.
  const meetings = await tx.$queryRaw<{ id: string; inviteeStaffIds: string[]; inviteeNames: string[] }[]>`
    SELECT id, "inviteeStaffIds", "inviteeNames" FROM "SupervisionMeeting"
    WHERE ${deleteId} = ANY ("inviteeStaffIds")`
  for (const m of meetings) {
    const ids: string[] = []
    const names: string[] = []
    m.inviteeStaffIds.forEach((raw, i) => {
      const id = raw === deleteId ? keepId : raw
      if (ids.includes(id)) return
      ids.push(id)
      if (i < m.inviteeNames.length) names.push(m.inviteeNames[i])
    })
    await tx.$executeRaw`
      UPDATE "SupervisionMeeting" SET "inviteeStaffIds" = ${ids}::text[], "inviteeNames" = ${names}::text[]
      WHERE id = ${m.id}`
    tally(moved, 'SupervisionMeeting.invitees', 1)
  }

  // Mentors elsewhere whose mentee list names the losing profile.
  const mentors = await tx.staff.findMany({
    where: { menteeIds: { has: deleteId }, id: { notIn: [keepId, deleteId] } },
    select: { id: true, menteeIds: true },
  })
  for (const m of mentors) {
    await tx.staff.update({
      where: { id: m.id },
      data: { menteeIds: [...new Set(m.menteeIds.map(id => (id === deleteId ? keepId : id)))] },
    })
    tally(moved, 'Staff.menteeIds', 1)
  }

  // ── Make the kept profile interbranch ────────────────────────────────────
  const keepEmployment = jsonObject(keep.branchEmployment)
  const loseEmployment = jsonObject(lose.branchEmployment)
  // A row synced before HR sent per-branch details has {} here. Give each
  // profile's own branch an entry from its staff-level fields first, so the
  // merged row still knows which bio ID belongs to which branch.
  if (!keepEmployment[keep.branch]) keepEmployment[keep.branch] = ownBranchEntry(keep)
  if (!loseEmployment[lose.branch]) loseEmployment[lose.branch] = ownBranchEntry(lose)
  // A branch both profiles claim keeps the kept profile's entry.
  const branchEmployment = { ...keepEmployment }
  for (const [branch, entry] of Object.entries(loseEmployment)) {
    if (!(branch in branchEmployment)) branchEmployment[branch] = entry
  }

  const extraBranches = [...new Set([...keep.extraBranches, lose.branch, ...lose.extraBranches])]
    .filter(b => b && b !== keep.branch)

  // Operations' own per-branch role overrides, same rule: add branches only.
  const keepRoles = jsonObject(keep.employmentByBranch)
  const addedRoles = Object.entries(jsonObject(lose.employmentByBranch)).filter(([b]) => !(b in keepRoles))

  await tx.staff.update({
    where: { id: keepId },
    data: {
      extraBranches,
      branchEmployment: branchEmployment as Prisma.InputJsonValue,
      ...(addedRoles.length
        ? { employmentByBranch: { ...keepRoles, ...Object.fromEntries(addedRoles) } as Prisma.InputJsonValue }
        : {}),
      menteeIds: [...new Set([...keep.menteeIds, ...lose.menteeIds])].filter(id => id !== keepId && id !== deleteId),
      isClinicalMentor:       keep.isClinicalMentor || lose.isClinicalMentor,
      isInternshipSupervisor: keep.isInternshipSupervisor || lose.isInternshipSupervisor,
      active:                 keep.active || lose.active,
      // Without an HR id the sync cannot match the kept row and would create
      // the person again from HR's record of the losing one.
      hrPlatformId: keep.hrPlatformId ?? lose.hrPlatformId,
      employeeId:   keep.employeeId ?? lose.employeeId,
    },
  })

  // ── Last line of defence before the delete ───────────────────────────────
  // Every foreign key onto Staff, read from the catalogue rather than a list
  // in this file, so one added after this was written is still caught.
  const fks = await tx.$queryRaw<{ tbl: string; col: string }[]>`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = '"Staff"'::regclass`
  const leftovers: string[] = []
  for (const { tbl, col } of fks) {
    // tbl comes back from regclass already quoted where it needs to be.
    const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${tbl} WHERE "${col.replace(/"/g, '""')}" = $1`,
      deleteId,
    )
    if (rows[0]?.n) leftovers.push(`${rows[0].n} in ${tbl}.${col}`)
  }
  if (leftovers.length) {
    throw new StaffMergeRefused(
      `The losing profile is still referenced by rows the merge does not know how to move ` +
      `(${leftovers.join('; ')}). Deleting it would destroy them, so nothing was changed.`,
      500,
    )
  }

  await tx.staff.delete({ where: { id: deleteId } })

  const notes: string[] = []
  if (lose.hrPlatformId && lose.hrPlatformId !== keep.hrPlatformId) {
    notes.push(
      `HR Platform: if HR still lists ${fullName(lose)} (${lose.branch}) as a separate profile, the nightly ` +
      `staff sync will recreate it and reset this profile's branches. Merge the two in HR Platform as well.`,
    )
  }
  notes.push(
    `Accounting Hub: the removed profile's consultant record is retired as a merged duplicate on the next ` +
    `consultant sync. Its past payslips stay on that record.`,
  )

  return {
    kept: { id: keep.id, name: fullName(keep), branch: keep.branch, extraBranches },
    removed: { id: lose.id, name: fullName(lose), branch: lose.branch },
    moved,
    dropped,
    notes,
  }
}
