import type { Metadata } from 'next'

// Shared report links are private-by-link: never indexed, and the token never
// leaves in a Referer header.
export const metadata: Metadata = {
  title: 'Shared financial report · Sapphire Clinics East',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default function SharedReportLayout({ children }: { children: React.ReactNode }) {
  return children
}
