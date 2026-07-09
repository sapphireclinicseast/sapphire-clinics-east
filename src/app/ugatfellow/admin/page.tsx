import { redirect } from 'next/navigation'

export const metadata = {
  title: 'UGAT Fellowship — Admin',
  robots: { index: false, follow: false },
}

// Admin is now folded into the unified /ugatfellow portal shell: sign in as
// `main` (or a staff-admin account) and use the Settings / User Access
// sections. This legacy route just forwards there.
export default function UgatAdminPage() {
  redirect('/ugatfellow')
}
