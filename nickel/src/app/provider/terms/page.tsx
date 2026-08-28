import { ProviderTermsBody } from '@/lib/provider-terms'

export const metadata = { title: 'Provider Terms of Service · Nickel' }

export default function ProviderTermsPage() {
  return (
    <div className="animate-fade-up mx-auto max-w-3xl">
      <div className="card">
        <ProviderTermsBody />
        <div className="mt-5 rounded-xl border border-[color:var(--line)] bg-[color:var(--mist)] p-4">
          <p className="text-[12.5px] text-[color:var(--slate)]">The following Annexes form part of these Terms under Clause 1.3:</p>
          <a href="/provider/terms/annexes" className="mt-1 inline-block text-[13px] font-semibold text-[color:var(--steel)] hover:underline">Read Annexes A–D (Fees · Code of Conduct · Privacy · Travel) →</a>
        </div>
        <div className="mt-5 border-t border-[color:var(--line)] pt-4">
          <a href="/provider/signup" className="font-semibold text-[color:var(--steel)] hover:underline">← Back to sign up</a>
        </div>
      </div>
    </div>
  )
}
