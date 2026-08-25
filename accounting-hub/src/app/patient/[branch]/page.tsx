import { notFound } from 'next/navigation'
import { resolvePatientViewBranch, PATIENT_VIEW_BRANCHES } from '@/lib/patient-view'
import PatientViewClient from './PatientViewClient'

/**
 * Patient-facing tablet view, one address per branch (/patient/east,
 * /patient/greenhills).
 *
 * Lives outside the (dashboard) group, so it carries no session and no
 * navigation — a tablet on the counter opens the URL once and stays there.
 */

export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return PATIENT_VIEW_BRANCHES.map(b => ({ branch: b.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: slug } = await params
  const branch = resolvePatientViewBranch(slug)
  return {
    title: branch ? `Welcome — ${branch.shortName}` : 'Welcome',
    // A counter tablet should not end up in search results.
    robots: { index: false, follow: false },
  }
}

export default async function PatientViewPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: slug } = await params
  const branch = resolvePatientViewBranch(slug)
  if (!branch) notFound()

  return <PatientViewClient slug={branch.slug} branchName={branch.name} shortName={branch.shortName} />
}
