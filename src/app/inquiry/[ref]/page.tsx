import ThreadClient from './ThreadClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your enquiry — Aura Health Rehab' }

export default async function Page({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  return <ThreadClient refNo={ref} />
}
