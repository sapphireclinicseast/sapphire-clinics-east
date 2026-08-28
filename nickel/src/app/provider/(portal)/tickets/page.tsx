import { getSessionProvider } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TicketForm from './TicketForm'

export default async function TicketsPage() {
  const p = await getSessionProvider()
  if (!p) return null
  const tickets = await prisma.ticket.findMany({ where: { providerId: p.id }, orderBy: { createdAt: 'desc' } })

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="text-[16px] font-semibold">Raise a concern</h2>
        <p className="mb-3 mt-1 text-[12px] text-[color:var(--slate)]">Have a question or an issue? Send it to the Nickel team.</p>
        <TicketForm />
      </section>

      <section className="card">
        <h2 className="text-[16px] font-semibold">Your tickets</h2>
        {tickets.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--slate)]">No tickets yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-[color:var(--line)] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-[color:var(--ink)]">{t.subject}</span>
                  <span className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold ${t.status === 'RESOLVED' ? 'bg-green-100 text-green-700' : 'bg-[color:var(--mist-2)] text-[color:var(--steel-deep)]'}`}>{t.status}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-[color:var(--slate)]">{t.message}</p>
                {t.response && (
                  <div className="mt-2 rounded-lg bg-[color:var(--mist)] p-2 text-[13px]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--sky)]">Nickel team</div>
                    <p className="mt-0.5 whitespace-pre-wrap text-[color:var(--ink)]">{t.response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
