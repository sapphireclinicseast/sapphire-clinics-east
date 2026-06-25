import { notFound, redirect } from 'next/navigation'
import PublicScheduleView from './PublicScheduleView'

// URL slug → internal branch enum code. Aura Health slugs (ahea/ahgh) are
// canonical; the enum codes stay SBEA/SBGH (do not rename — they're the DB enum).
const BRANCH_MAP: Record<string, string> = {
  ahea: 'SBEA',
  ahgh: 'SBGH',
}

// Legacy Sandbox slugs → current Aura slugs. Old shared links redirect here
// instead of 404ing.
const LEGACY_BRANCH_REDIRECT: Record<string, string> = {
  sbea: 'ahea',
  sbgh: 'ahgh',
}

const DEPT_MAP: Record<string, string> = {
  ot:       'OT',
  pt:       'PT',
  slp:      'SLP',
  md:       'MD',
  sped:     'SPED',
  psych:    'PSYCHOLOGY',
  orthosis: 'ORTHOSIS',
}

const DEPT_LABEL: Record<string, string> = {
  ot:       'Occupational Therapy',
  pt:       'Physical Therapy',
  slp:      'Speech-Language Pathology',
  md:       'Medical',
  sped:     'Special Education',
  psych:    'Psychology',
  orthosis: 'Orthosis',
}

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ branch: string; dept: string }>
}) {
  const { branch, dept } = await params
  const branchSlug = branch.toLowerCase()

  // Redirect legacy Sandbox slugs (sbea/sbgh) to the Aura equivalents.
  const legacyTarget = LEGACY_BRANCH_REDIRECT[branchSlug]
  if (legacyTarget) redirect(`/schedules/${legacyTarget}/${dept.toLowerCase()}`)

  const branchCode = BRANCH_MAP[branchSlug]
  const deptCode   = DEPT_MAP[dept.toLowerCase()]

  if (!branchCode || !deptCode) notFound()

  const branchLabel = branchCode === 'SBEA' ? 'Aura Health Rehab – East' : 'Aura Health Rehab – Greenhills'
  const deptLabel   = DEPT_LABEL[dept.toLowerCase()]

  return (
    <PublicScheduleView
      branchCode={branchCode}
      deptCode={deptCode}
      branchLabel={branchLabel}
      deptLabel={deptLabel}
    />
  )
}
