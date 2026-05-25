import type { Metadata } from 'next'

// Server-component shell so the underlying client-component /sign-in
// page can still surface its own SEO metadata. Sign-in is crawlable
// (low priority) because parents Google "Aura Academy for Learning
// sign in" and expect a direct landing.
export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to your Aura Academy for Learning class portal — for students/parents, teachers, branch admins, and clinic front-desk staff.',
  alternates: { canonical: 'https://class.sapphireclinicseast.org/sign-in' },
}

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children
}
