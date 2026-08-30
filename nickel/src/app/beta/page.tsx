import BetaSimulator from './BetaSimulator'

export const metadata = { title: 'Nickel — Beta preview', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default function BetaPage() {
  return <BetaSimulator />
}
