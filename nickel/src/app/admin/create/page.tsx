import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/auth'
import AdminNav from '../AdminNav'
import CreateAccounts from './CreateAccounts'

export const metadata = { title: 'Create account' }
export const dynamic = 'force-dynamic'

export default async function AdminCreatePage() {
  if (!(await isAdmin())) redirect('/admin/login')
  return (
    <div className="animate-fade-up mx-auto max-w-5xl">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[color:var(--sky)]">JUO Operations · Superadmin</div>
      <h1 className="mb-4 text-[22px] font-semibold text-[color:var(--ink)]">Create account</h1>
      <AdminNav />
      <CreateAccounts />
    </div>
  )
}
