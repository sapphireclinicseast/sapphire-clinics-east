import { getSessionProvider } from '@/lib/auth'
import ProfileForm from './ProfileForm'
import type { CoverageArea } from './CityCoveragePicker'

export default async function ProfilePage() {
  const p = await getSessionProvider()
  if (!p) return null

  // Prefer the richer coverageAreas; fall back to legacy citiesCovered (names only).
  let coverageAreas: CoverageArea[] = []
  if (Array.isArray(p.coverageAreas)) {
    coverageAreas = (p.coverageAreas as unknown[])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({ city: String(a.city ?? ''), province: String(a.province ?? ''), region: String(a.region ?? ''), zip: String(a.zip ?? '') }))
      .filter((a) => a.city)
  }
  if (coverageAreas.length === 0 && (p.citiesCovered ?? []).length > 0) {
    coverageAreas = p.citiesCovered.map((c) => ({ city: c, province: '', region: '', zip: '' }))
  }

  return (
    <ProfileForm
      email={p.email}
      init={{
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone ?? '',
        profession: p.profession,
        photo: p.photo ?? '',
        coverageAreas,
      }}
    />
  )
}
