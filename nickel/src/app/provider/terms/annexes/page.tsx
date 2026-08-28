import { ProviderAnnexesBody } from '@/lib/provider-annexes'

export const metadata = { title: 'Provider Terms — Annexes A–D · Nickel' }

export default function ProviderAnnexesPage() {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <div className="card">
        <ProviderAnnexesBody />
        <div className="mt-6 border-t border-[color:var(--line)] pt-4">
          <a href="/provider/terms" className="font-semibold text-[color:var(--steel)] hover:underline">← Back to the Terms of Service</a>
        </div>
      </div>
    </div>
  )
}
