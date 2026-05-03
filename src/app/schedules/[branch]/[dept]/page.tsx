import { notFound } from 'next/navigation'
import PublicScheduleView from './PublicScheduleView'

const BRANCH_MAP: Record<string, string> = {
  sbea: 'SBEA',
  sbgh: 'SBGH',
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

  const branchCode = BRANCH_MAP[branch.toLowerCase()]
  const deptCode   = DEPT_MAP[dept.toLowerCase()]

  if (!branchCode || !deptCode) notFound()

  const branchLabel = branchCode === 'SBEA' ? 'Sandbox East' : 'Sandbox Greenhills'
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
