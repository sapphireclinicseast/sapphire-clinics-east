import { getSessionProvider } from '@/lib/auth'
import ProfileForm from './ProfileForm'

export default async function ProfilePage() {
  const p = await getSessionProvider()
  if (!p) return null
  return (
    <ProfileForm
      email={p.email}
      init={{
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone ?? '',
        profession: p.profession,
        photo: p.photo ?? '',
        citiesCovered: (p.citiesCovered ?? []).join(', '),
      }}
    />
  )
}
