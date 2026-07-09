import AdminClient from './AdminClient'

export const metadata = {
  title: 'UGAT Fellowship — Admin Settings',
  robots: { index: false, follow: false },
}

export default function UgatAdminPage() {
  return <AdminClient />
}
