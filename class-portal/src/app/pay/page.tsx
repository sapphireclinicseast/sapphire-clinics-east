export const metadata = {
  title: 'Pay tuition fee — SCEI Class Portal',
}

export default function PayPage() {
  return (
    <div className="max-w-xl mx-auto animate-fade-up">
      <div className="card-static text-center">
        <div className="inline-flex w-14 h-14 rounded-full bg-[color:var(--sun-tint)] items-center justify-center mb-4 text-[color:var(--clay)] text-2xl">$</div>
        <h1 className="text-[26px] leading-tight text-[color:var(--deep-teal)] mb-2">Pay tuition fee</h1>
        <p className="text-sm text-[color:var(--mid-gray)] mb-6">
          Online tuition payment isn&apos;t available yet — this page is a placeholder. Once it&apos;s wired up, you&apos;ll be able to pay your tuition here.
        </p>
        <div className="flex items-center justify-center gap-2">
          <a href="/profile" className="btn-secondary">← Back to my profile</a>
        </div>
      </div>
    </div>
  )
}
