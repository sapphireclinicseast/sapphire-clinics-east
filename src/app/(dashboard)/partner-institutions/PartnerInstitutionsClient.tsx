'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, X, CheckCircle2, AlertTriangle, HeartHandshake } from 'lucide-react'

interface Service { id: string; label: string }
interface Discount { serviceId: string; serviceLabel: string; discountType: string; value: number; note: string }

interface PartnerInstitution {
  id: string
  name: string
  type: string
  typeLabel: string
  pointOfContact: string | null
  email: string | null
  mobile: string | null
  telephone: string | null
  services: Service[]
  discounts: Discount[]
  agreementType: string
  effectivityFrom: string | null
  effectivityTo: string | null
  hasCommission: boolean
  commissionType: string
  commissionValue: number
  commissionNote: string | null
  hasDocument: boolean
  photoCount: number
  remarks: string | null
  active: boolean
  hrUpdatedAt: string
}

// Admin-tier roles that can trigger a sync — Front Desk sees the same
// page but view-only, matching HR Platform's own management boundary
// (this side never writes back to HR).
const SYNC_ROLES = ['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN']

function fmtDate(s: string | null) {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function valueText(discountType: string, value: number) {
  return discountType === 'percent' ? `${value}%` : `₱${value.toLocaleString()}`
}

function termsSummary(inst: PartnerInstitution) {
  const bits: string[] = []
  const withValue = inst.discounts.filter(d => d.value > 0)
  if (withValue.length) {
    const first = withValue[0]
    const label = `${first.serviceLabel} ${valueText(first.discountType, first.value)}`
    bits.push(withValue.length > 1 ? `${label} +${withValue.length - 1} more` : label)
  }
  if (inst.hasCommission) bits.push(`Commission ${valueText(inst.commissionType, inst.commissionValue)}`)
  return bits
}

export default function PartnerInstitutionsClient({ role }: { role: string }) {
  const [institutions, setInstitutions] = useState<PartnerInstitution[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<
    { synced: number; created: number; updated: number; deactivated: number; total: number; errors?: string[] } | null
  >(null)

  const canSync = SYNC_ROLES.includes(role)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/partner-institutions')
    if (res.ok) {
      const data = await res.json()
      setInstitutions(data.institutions ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/partner-institutions/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
        load()
      } else {
        alert('Sync failed: ' + (data.error || 'Unknown error') + ' (HTTP ' + res.status + ')')
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : String(err)))
    }
    setSyncing(false)
  }

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return institutions
      .filter(i => i.active)
      .filter(i => !q || i.name.toLowerCase().includes(q) || (i.pointOfContact ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [institutions, search])

  const withDiscount = institutions.filter(i => i.active && i.discounts.some(d => d.value > 0)).length
  const withCommission = institutions.filter(i => i.active && i.hasCommission).length

  const statCards = [
    { label: 'Active Partners', value: institutions.filter(i => i.active).length, icon: <Building2 size={18} style={{ color: 'var(--teal)' }} /> },
    { label: 'With Discount', value: withDiscount, icon: <HeartHandshake size={18} style={{ color: 'var(--teal)' }} /> },
    { label: 'With Referral Commission', value: withCommission, icon: <CheckCircle2 size={18} style={{ color: 'var(--teal)' }} /> },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--teal)' }}>
            Clinic Tools
          </p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            Partner Institutions
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--mid-gray)' }}>
            Schools, clinics, NGOs, and other institutions with a referral, discount, or MOA/MOU
            arrangement — synced read-only from the HR Platform, across all branches. Manage
            partnerships at <span style={{ color: 'var(--teal)', fontWeight: 600 }}>hr.sapphireclinicseast.org</span>
          </p>
        </div>
        {canSync && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--teal)', color: '#fff', opacity: syncing ? 0.7 : 1 }}
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync from HR'}
            </button>
          </div>
        )}
      </div>

      {syncResult && (syncResult.errors?.length ?? 0) > 0 && (
        <div className="rounded-xl px-5 py-3" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#991B1B' }}>
            {syncResult.errors!.length} thing{syncResult.errors!.length === 1 ? '' : 's'} the sync did not do
          </p>
          <ul className="text-[11px] list-disc pl-4" style={{ color: '#7F1D1D' }}>
            {syncResult.errors!.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {syncResult && (
        <div className="rounded-xl px-5 py-3 flex items-center gap-2"
          style={{ background: '#ECFDF5', border: '1px solid #BBF7D0' }}>
          <CheckCircle2 size={15} style={{ color: '#065F46' }} />
          <span className="text-xs font-semibold" style={{ color: '#065F46' }}>
            Sync complete: {syncResult.created} created, {syncResult.updated} updated{syncResult.deactivated > 0 ? `, ${syncResult.deactivated} deactivated (no longer in HR — records kept)` : ''} ({syncResult.total} from HR Platform)
          </span>
          <button onClick={() => setSyncResult(null)} className="ml-auto p-1 rounded hover:bg-green-100">
            <X size={13} style={{ color: '#065F46' }} />
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-3" style={{ background: '#fff', border: '1px solid var(--pale-teal)' }}>
            <div className="rounded-lg p-2" style={{ background: 'var(--pale-teal)' }}>{c.icon}</div>
            <div>
              <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{c.value}</div>
              <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by institution or point of contact..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 rounded-lg text-sm"
        style={{ border: '1px solid var(--pale-teal)' }}
      />

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--pale-teal)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--pale-teal)' }}>
                {['Institution', 'Type', 'Point of Contact', 'Terms', 'Agreement', 'Effectivity'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--charcoal)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>Loading…</td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>
                  {institutions.length === 0
                    ? (canSync ? 'No partner institutions yet — click "Sync from HR" to pull them in.' : 'No partner institutions yet.')
                    : 'No partner institutions match your search.'}
                </td></tr>
              ) : displayed.map(inst => {
                const terms = termsSummary(inst)
                const from = fmtDate(inst.effectivityFrom)
                const to = fmtDate(inst.effectivityTo)
                return (
                  <tr key={inst.id} style={{ borderTop: '1px solid var(--pale-teal)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--charcoal)' }}>{inst.name}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--mid-gray)' }}>{inst.typeLabel}</td>
                    <td className="px-4 py-3">
                      <div style={{ color: 'var(--charcoal)' }}>{inst.pointOfContact || '—'}</div>
                      {inst.email && <div className="text-xs" style={{ color: 'var(--mid-gray)' }}>{inst.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {terms.length ? terms.map((t, i) => <div key={i}>{t}</div>) : <span>None</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{
                        background: inst.agreementType === 'NA' ? '#F1F5F9' : 'var(--pale-teal)',
                        color: inst.agreementType === 'NA' ? 'var(--mid-gray)' : 'var(--teal)',
                      }}>{inst.agreementType}</span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>
                      {from || to ? `${from ?? '—'} – ${to ?? 'Open-ended'}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!canSync && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--mid-gray)' }}>
          <AlertTriangle size={13} />
          View only — partnerships are managed in HR Platform.
        </div>
      )}
    </div>
  )
}
