import { ProviderTermsBody } from '@/lib/provider-terms'

export const metadata = { title: 'Provider Terms of Service · Nickel' }

export default function ProviderTermsPage() {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <div className="card">
        <ProviderTermsBody />
        <div className="mt-6 border-t border-[color:var(--line)] pt-4">
          <a href="/provider/signup" className="font-semibold text-[color:var(--steel)] hover:underline">← Back to sign up</a>
        </div>
      </div>
    </div>
  )
}
