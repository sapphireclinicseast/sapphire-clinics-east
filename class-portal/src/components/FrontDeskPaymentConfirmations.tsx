'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getFrontDeskPaymentsServer,
  type FrontDeskPaymentRow, type PaymentPlan, type FrontDeskMethodDetail,
} from '@/lib/session'
import {
  DashCard, KpiCard, KpiSkeleton, RowsSkeleton, EmptyState, StatusPill, Tag, Icon,
  CONTROL, CONTROL_STYLE, BTN_SECONDARY, SECONDARY_STYLE, TH, TH_STYLE, TD, TR, TR_STYLE,
} from '@/components/hub/ui'

interface FdpProps {
  /** Kept for existing callers; payments can no longer be deleted here. */
  canDelete?: boolean
}

function fmt(cents: number) {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function planLabel(p: PaymentPlan) {
  return p === 'ANNUAL' ? 'Annual' : p === 'BIANNUAL' ? 'Bi-annual' : 'Monthly'
}
const METHOD_DETAIL_LABEL: Record<FrontDeskMethodDetail, string> = {
  CASH: 'Cash', CREDIT_CARD: 'Credit Card', DEBIT_CARD: 'Debit Card', GCASH: 'GCash', PAYMAYA: 'PayMaya',
}
function methodLabel(m: FrontDeskPaymentRow['method'], detail?: FrontDeskMethodDetail | null) {
  if (m === 'BANK_DEPOSIT') return 'Bank deposit'
  if (m === 'FRONT_DESK_CASH') return `Frontdesk payment (${METHOD_DETAIL_LABEL[detail ?? 'CASH'] ?? 'Cash'})`
  if (m === 'PAYMONGO') return 'PayMongo'
  return 'Unspecified'
}
const PartialTag = () => (
  <span className="ml-1.5"><Tag tone="warn" title="Partial payment — the rest of the period is still due">Partial</Tag></span>
)

/**
 * Tuition payments, surfaced inside /frontdesk and /admin → Payments.
 * Read-only: tuition is recorded only at the Accounting Hub POS (Hannah,
 * 2026-10-31), and the POS writes each completed sale here. Corrections are
 * made on the sale in the Accounting Hub (void, reopen or edit), which keeps
 * this list in step.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function FrontDeskPaymentConfirmations(_props: FdpProps = {}) {
  const [rows, setRows] = useState<FrontDeskPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      setRows(await getFrontDeskPaymentsServer())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  // Rows from before the POS became the only place to record tuition can
  // still be waiting in the POS queue.
  const pending = rows.filter(r => r.status === 'PENDING')
  const recordedAll = useMemo(() => rows
    .filter(r => r.status === 'CONVERTED')
    .sort((a, b) => new Date(b.convertedAt ?? b.createdAt).getTime() - new Date(a.convertedAt ?? a.createdAt).getTime()), [rows])
  const recorded = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recordedAll
    return recordedAll.filter(r => `${r.studentName ?? ''} ${r.studentEmail ?? ''} ${r.plan ?? ''} ${r.period ?? ''} ${r.method ?? ''} ${r.branch ?? ''}`.toLowerCase().includes(q))
  }, [recordedAll, search])

  const head = (cols: string[]) => (
    <thead className="sticky top-0 z-[1]">
      <tr>
        {cols.map(c => <th key={c} className={`${TH}${c === 'Amount' ? ' text-right' : ''}`} style={TH_STYLE}>{c}</th>)}
      </tr>
    </thead>
  )
  const studentCell = (r: FrontDeskPaymentRow) => (
    <td className={TD} style={{ minWidth: 180 }}>
      <div className="font-semibold" style={{ color: 'var(--charcoal)' }}>{r.studentName}</div>
      <div className="text-[11px] text-[color:var(--mid-gray)] break-all">{r.studentEmail}</div>
    </td>
  )
  const totalCentavos = recordedAll.reduce((sum, r) => sum + r.tuitionCentavos + r.miscCentavos, 0)
  const partialCount = recordedAll.filter(r => r.isPartialPayment).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading && rows.length === 0 ? <KpiSkeleton /> : (
          <>
            <KpiCard label="Payments recorded" icon={<Icon name="check" />} value={recordedAll.length} sub="Completed at the POS" />
            <KpiCard label="Amount recorded" icon={<Icon name="wallet" />} value={fmt(totalCentavos)} sub="Tuition + misc, this list" />
            <KpiCard label="Partial payments" icon={<Icon name="clock" />} accent="var(--clay)" value={partialCount} sub="Rest of period still due" />
            <KpiCard label="In POS queue" icon={<Icon name="refresh" />} accent="var(--slate)" value={pending.length} sub={pending.length ? 'Waiting for the cashier' : 'Nothing waiting'} />
          </>
        )}
      </div>

      <DashCard
        flush
        title="Tuition payments"
        icon={<Icon name="wallet" size={15} />}
        description={<>Tuition is recorded at the <span className="font-semibold">Accounting Hub POS</span> (POS → Tuition) and shows here as soon as the sale is completed. To correct a payment, void, reopen or edit the sale in the Accounting Hub — this list follows it.</>}
      >
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2" style={{ borderBottom: '1px solid var(--light-gray)' }}>
          <label className="relative flex-1 min-w-0 sm:max-w-[340px]">
            <span className="sr-only">Search payments</span>
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--mid-gray)' }} />
            <input className={`${CONTROL} w-full pl-8`} style={CONTROL_STYLE} placeholder="Search name, email, plan, period, method, branch" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <button onClick={() => void load()} className={BTN_SECONDARY} style={SECONDARY_STYLE} disabled={loading}>
            <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {loading ? (
          <RowsSkeleton rows={4} label="Loading payments" />
        ) : recordedAll.length === 0 ? (
          <EmptyState icon="wallet" title="No payments recorded yet." hint="Completed tuition sales from the Accounting Hub POS appear here." />
        ) : recorded.length === 0 ? (
          <EmptyState icon="search" title={`No payments match “${search}”.`} hint="Try a name, email, plan or period." />
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 460 }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
              {head(['Student', 'Plan', 'Period', 'Method', 'Branch', 'Amount', 'Recorded', 'Status'])}
              <tbody>
                {recorded.map(r => (
                  <tr key={r.id} className={TR} style={TR_STYLE}>
                    {studentCell(r)}
                    <td className={`${TD} text-[12.5px]`}>{planLabel(r.plan)}</td>
                    <td className={`${TD} text-[12.5px] whitespace-nowrap`}>{r.period}</td>
                    <td className={`${TD} text-[12.5px]`}>{methodLabel(r.method, r.methodDetail)}</td>
                    <td className={`${TD} text-[12.5px]`}>{r.branch}</td>
                    <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold`} style={{ color: 'var(--charcoal)' }}>{fmt(r.tuitionCentavos + r.miscCentavos)}{r.isPartialPayment && <PartialTag />}</td>
                    <td className={`${TD} text-[12.5px] text-[color:var(--mid-gray)] whitespace-nowrap`}>{r.convertedAt ? new Date(r.convertedAt).toLocaleString() : '—'}</td>
                    <td className={TD}><StatusPill tone="success">Paid</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      {pending.length > 0 && (
        <DashCard
          flush
          title="Waiting in the POS queue"
          icon={<Icon name="clock" size={15} />}
          description="Submitted before tuition was recorded only at the POS. The cashier completes each one from the Accounting Hub POS queue; it then moves to the list above."
          action={<StatusPill tone="warn">{pending.length} waiting</StatusPill>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 820 }}>
              {head(['Student', 'Plan', 'Period', 'Method', 'Branch', 'Amount', 'Submitted'])}
              <tbody>
                {pending.map(r => (
                  <tr key={r.id} className={TR} style={TR_STYLE}>
                    {studentCell(r)}
                    <td className={`${TD} text-[12.5px]`}>{planLabel(r.plan)}</td>
                    <td className={`${TD} text-[12.5px] whitespace-nowrap`}>{r.period}</td>
                    <td className={`${TD} text-[12.5px]`}>{methodLabel(r.method, r.methodDetail)}</td>
                    <td className={`${TD} text-[12.5px]`}>{r.branch}</td>
                    <td className={`${TD} text-right tabular-nums whitespace-nowrap font-semibold`} style={{ color: 'var(--charcoal)' }}>{fmt(r.tuitionCentavos + r.miscCentavos)}{r.isPartialPayment && <PartialTag />}</td>
                    <td className={`${TD} text-[12.5px] text-[color:var(--mid-gray)] whitespace-nowrap`}>{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      )}
    </div>
  )
}
