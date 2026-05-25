import type { Metadata } from 'next'

// Server-component shell so the underlying client-component /enroll
// page can still surface its own SEO metadata.
export const metadata: Metadata = {
  title: 'Enroll',
  description:
    'Enroll your child at Aura Academy for Learning. Open for Nursery, Kindergarten, and Grades 1–12. DepEd-accredited; LRN issued through Light Bearer Christian Academy.',
  alternates: { canonical: 'https://class.sapphireclinicseast.org/enroll' },
  openGraph: {
    title: 'Enroll at Aura Academy for Learning',
    description:
      'Open for Nursery to Grade 12. DepEd-accredited. Small, attentive classes with SPED-inclusive support.',
    url: 'https://class.sapphireclinicseast.org/enroll',
  },
}

export default function EnrollLayout({ children }: { children: React.ReactNode }) {
  return children
}
