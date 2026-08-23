'use client'

// "Other Fees" section for Generate-RFP modals (e.g. online-transfer fees added on
// top of the payable being requested). Shared by Benefits Payable, Payroll
// (Salaries/Benefits Payable) and the Taxes tabs. Fees are stored on the RFP's
// meta.otherFees and included in its grossTotal; the per-branch prefill template
// is shared across all RFP types (/api/payroll/benefit-fee-template).
import { useEffect, useState } from 'react'
import { AccountPicker } from '@/components/AccountPicker'
import { Plus, Trash2, Save, CheckCircle2 } from 'lucide-react'

export interface RfpFee { accountTitle: string; description: string; requestor: string; grossAmount: string; vatable: string; hasEwt: boolean; ewtRate: string }
export interface CleanRfpFee { accountTitle: string; description: string; requestor: string; grossAmount: number; vatable: string; hasEwt: boolean; ewtRate: number | null }
interface CoaAccount { id: string; accountNumber: string; accountTitle: string }

export const emptyRfpFee = (): RfpFee => ({ accountTitle: '', description: '', requestor: '', grossAmount: '', vatable: 'NV', hasEwt: false, ewtRate: '' })

export const cleanRfpFees = (fees: RfpFee[]): CleanRfpFee[] => fees
  .map(f => ({ accountTitle: f.accountTitle.trim(), description: f.description.trim(), requestor: f.requestor.trim(), grossAmount: parseFloat(f.grossAmount) || 0, vatable: f.vatable, hasEwt: f.hasEwt, ewtRate: f.ewtRate ? parseFloat(f.ewtRate) : null }))
  .filter(f => f.grossAmount > 0)

export interface RfpOtherFeesState {
  withFees: boolean
  setWithFees: (v: boolean) => void
  fees: RfpFee[]
  setFees: (v: RfpFee[]) => void
  coa: CoaAccount[]
  savedTpl: boolean
  feesTotal: number
  loadTemplate: (branch: string) => Promise<void>
  saveTemplate: (branch: string) => Promise<void>
  cleaned: () => CleanRfpFee[]
}

export function useRfpOtherFees(): RfpOtherFeesState {
  const [withFees, setWithFees] = useState(false)
  const [fees, setFees] = useState<RfpFee[]>([emptyRfpFee()])
  const [coa, setCoa] = useState<CoaAccount[]>([])
  const [savedTpl, setSavedTpl] = useState(false)

  useEffect(() => {
    fetch('/api/chart-of-accounts?accountType=EXPENSE&pageSize=1000')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setCoa(Array.isArray(d) ? d : (d.data || [])))
      .catch(() => setCoa([]))
  }, [])

  // Preload the branch's saved "Other Fees" template (auto-ticks the box when one exists).
  const loadTemplate = async (branch: string) => {
    setSavedTpl(false)
    try {
      const r = await fetch(`/api/payroll/benefit-fee-template?branch=${branch}`)
      const d = r.ok ? await r.json() : { fees: [] }
      const tpl = Array.isArray(d.fees) ? d.fees : []
      if (tpl.length) {
        setFees(tpl.map((f: Partial<RfpFee>) => ({ ...emptyRfpFee(), ...f, grossAmount: String(f.grossAmount ?? ''), ewtRate: String(f.ewtRate ?? '') })))
        setWithFees(true)
      } else { setFees([emptyRfpFee()]); setWithFees(false) }
    } catch { setFees([emptyRfpFee()]); setWithFees(false) }
  }

  const saveTemplate = async (branch: string) => {
    try {
      await fetch('/api/payroll/benefit-fee-template', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch, fees: cleanRfpFees(fees) }) })
      setSavedTpl(true); setTimeout(() => setSavedTpl(false), 2500)
    } catch { /* non-fatal */ }
  }

  const feesTotal = withFees ? fees.reduce((s, f) => s + (parseFloat(f.grossAmount) || 0), 0) : 0
  const cleaned = () => withFees ? cleanRfpFees(fees) : []

  return { withFees, setWithFees, fees, setFees, coa, savedTpl, feesTotal, loadTemplate, saveTemplate, cleaned }
}

// Checkbox + fee cards + "Add another fee" / "Save template" — drop inside a modal.
export function RfpOtherFeesSection({ state, branch }: { state: RfpOtherFeesState; branch: string }) {
  const { withFees, setWithFees, fees, setFees, coa, savedTpl, saveTemplate } = state
  return (
    <>
      <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--charcoal)' }}>
        <input type="checkbox" checked={withFees} onChange={e => setWithFees(e.target.checked)} /> Other Fees (e.g. for online transfers)
      </label>

      {withFees && (
        <div className="space-y-2 mb-3">
          {fees.map((f, i) => (
            <div key={i} className="rounded-xl border p-3" style={{ borderColor: 'var(--light-gray)', background: 'var(--off-white)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--mid-gray)' }}>Fee {i + 1}</span>
                {fees.length > 1 && <button onClick={() => setFees(fees.filter((_, j) => j !== i))}><Trash2 size={13} className="text-red-500" /></button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>Account / Item</label>
                  <AccountPicker accounts={coa} value={f.accountTitle}
                    onChange={v => setFees(fees.map((x, j) => j === i ? { ...x, accountTitle: v } : x))}
                    placeholder="Select expense account…" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>Description</label>
                  <input value={f.description} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. Online transfer fee" />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>Payee</label>
                  <input value={f.requestor} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, requestor: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} placeholder="Bank / provider" />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>Amount (gross)</label>
                  <input type="number" value={f.grossAmount} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, grossAmount: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>VAT</label>
                  <select value={f.vatable} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, vatable: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--light-gray)' }}>
                    <option value="NV">Non-VAT</option><option value="VAT">VAT (12%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--mid-gray)' }}>EWT %</label>
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={f.hasEwt} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, hasEwt: e.target.checked } : x))} />
                    <input type="number" disabled={!f.hasEwt} value={f.ewtRate} onChange={e => setFees(fees.map((x, j) => j === i ? { ...x, ewtRate: e.target.value } : x))} className="w-full px-2 py-1.5 rounded-lg border text-xs disabled:opacity-40" style={{ borderColor: 'var(--light-gray)' }} placeholder="e.g. 2" />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={() => setFees([...fees, emptyRfpFee()])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }}>
              <Plus size={13} /> Add another fee
            </button>
            <button onClick={() => saveTemplate(branch)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: 'var(--light-gray)', color: 'var(--charcoal)' }}>
              {savedTpl ? <><CheckCircle2 size={13} className="text-green-600" /> Template saved</> : <><Save size={13} /> Save template</>}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
