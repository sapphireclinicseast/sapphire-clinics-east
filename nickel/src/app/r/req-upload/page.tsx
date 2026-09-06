import { verifyRequestUpload } from '@/lib/auth'
import ReqUpload from './ReqUpload'

export const metadata = { title: 'Attach referral', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ReqUploadPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const valid = !!verifyRequestUpload(t)
  return (
    <div className="animate-fade-up mx-auto max-w-sm">
      {valid && t
        ? <ReqUpload token={t} />
        : <div className="card text-center"><h1 className="text-[17px] font-semibold text-[color:var(--ink)]">Link expired</h1><p className="mt-1 text-[13px] text-[color:var(--slate)]">This upload link has expired. Reopen the QR code from your request on the other device and scan it again.</p></div>}
    </div>
  )
}
