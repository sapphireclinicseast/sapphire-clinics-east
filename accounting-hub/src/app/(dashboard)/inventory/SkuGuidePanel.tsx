'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, RefreshCw, Package } from 'lucide-react'

interface SkuDef {
  id: string
  skuCode: string
  department: string
  mainCategory: string
  subcategory: string
  details: string | null
  productCount: number
}
interface SkuProduct {
  id: string; sku: string; name: string; branch: string; quantity: number; sellingPrice: number; isActive: boolean
}

const BRANCH_LABEL: Record<string, string> = {
  SANDBOX_EAST: 'East', SANDBOX_GREENHILLS: 'Greenhills', VERDANA_STORE: 'Verdana', AURA_INSTITUTE: 'Aura Health Institute',
}
const blank = { id: '', skuCode: '', department: '', mainCategory: '', subcategory: '', details: '' }

export default function SkuGuidePanel({ canWrite }: { canWrite: boolean }) {
  const [defs, setDefs] = useState<SkuDef[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<typeof blank | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [productsFor, setProductsFor] = useState<SkuDef | null>(null)
  const [products, setProducts] = useState<SkuProduct[] | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/inventory/sku-guide'); setDefs(r.ok ? await r.json() : []) }
    catch { setDefs([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openProducts = async (d: SkuDef) => {
    setProductsFor(d); setProducts(null)
    try { const r = await fetch(`/api/inventory/sku-guide?products=${encodeURIComponent(d.skuCode)}`); setProducts(r.ok ? await r.json() : []) }
    catch { setProducts([]) }
  }

  const save = async () => {
    if (!form) return
    setSaving(true); setError('')
    try {
      const method = form.id ? 'PUT' : 'POST'
      const r = await fetch('/api/inventory/sku-guide', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { setError((await r.json()).error || 'Failed to save'); return }
      setForm(null); await load()
    } finally { setSaving(false) }
  }

  const backfill = async () => {
    setBackfilling(true)
    try {
      const r = await fetch('/api/inventory/sku-guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'backfill' }) })
      if (r.ok) { const d = await r.json(); await load(); alert(`Pre-created ${d.created} SKU${d.created === 1 ? '' : 's'} from existing products.`) }
    } finally { setBackfilling(false) }
  }

  const doDelete = async (id: string) => {
    await fetch(`/api/inventory/sku-guide?id=${id}`, { method: 'DELETE' }); setDeleteId(null); await load()
  }

  const q = search.toLowerCase()
  const shown = defs.filter(d => !q || d.skuCode.toLowerCase().includes(q) || d.department.toLowerCase().includes(q) || d.mainCategory.toLowerCase().includes(q) || d.subcategory.toLowerCase().includes(q) || (d.details || '').toLowerCase().includes(q))

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <p className="text-sm" style={{ color: 'var(--mid-gray)' }}>
          A dictionary of SKU classification codes. Each shows how many products use it — click the count to see them.
        </p>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button onClick={backfill} disabled={backfilling} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border disabled:opacity-50" style={{ borderColor: 'var(--light-gray)', color: 'var(--teal)' }} title="Create a SKU entry for every distinct code already used by products">
              {backfilling ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Pre-fill from products
            </button>
            <button onClick={() => { setForm({ ...blank }); setError('') }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--teal)' }}>
              <Plus size={15} /> Add SKU
            </button>
          </div>
        )}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU code, department, category…" className="w-full sm:w-96 mb-4 px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: 'var(--light-gray)' }} />

      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--light-gray)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--off-white)', borderBottom: '1px solid var(--light-gray)' }}>
              {['SKU Code', 'Department', 'Main Category', 'Subcategory', 'Details', '# Products'].map((h, i) => (
                <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${i === 5 ? 'text-center' : 'text-left'}`} style={{ color: 'var(--mid-gray)' }}>{h}</th>
              ))}
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canWrite ? 7 : 6} className="px-4 py-10 text-center"><Loader2 size={18} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={canWrite ? 7 : 6} className="px-4 py-12 text-center" style={{ color: 'var(--mid-gray)' }}>
                <Package size={30} className="mx-auto mb-2 opacity-40" />
                <p>No SKU classifications yet.{canWrite ? ' Add one, or “Pre-fill from products”.' : ''}</p>
              </td></tr>
            ) : shown.map(d => (
              <tr key={d.id} className="border-t hover:bg-gray-50/50" style={{ borderColor: 'var(--light-gray)' }}>
                <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--charcoal)' }}>{d.skuCode}</td>
                <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{d.department}</td>
                <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{d.mainCategory}</td>
                <td className="px-4 py-3" style={{ color: 'var(--charcoal)' }}>{d.subcategory}</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--mid-gray)' }}>{d.details || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => openProducts(d)} className="px-2.5 py-1 rounded-full text-sm font-bold hover:underline" style={{ background: d.productCount ? 'var(--pale-teal)' : 'var(--off-white)', color: d.productCount ? 'var(--deep-teal)' : 'var(--mid-gray)' }} title="View products under this SKU">
                    {d.productCount}
                  </button>
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setForm({ id: d.id, skuCode: d.skuCode, department: d.department, mainCategory: d.mainCategory, subcategory: d.subcategory, details: d.details || '' }); setError('') }} className="p-2 rounded-lg hover:bg-gray-100" title="Edit"><Pencil size={15} style={{ color: 'var(--teal)' }} /></button>
                      <button onClick={() => setDeleteId(d.id)} className="p-2 rounded-lg hover:bg-red-50" title="Delete"><Trash2 size={15} className="text-red-500" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit modal */}
      {form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{form.id ? 'Edit SKU' : 'Add SKU'}</h3>
              <button onClick={() => setForm(null)}><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <div className="space-y-3">
              {([['skuCode', 'SKU Code', 'e.g. OT-TOY-THP'], ['department', 'Department', ''], ['mainCategory', 'Main Category', ''], ['subcategory', 'Subcategory', ''], ['details', 'Details', 'Optional description']] as const).map(([key, label, ph]) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>{label}{key !== 'details' && <span className="text-red-500"> *</span>}</label>
                  <input value={form[key]} onChange={e => setForm(f => f && { ...f, [key]: e.target.value })} placeholder={ph}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none ${key === 'skuCode' ? 'font-mono uppercase' : ''}`} style={{ borderColor: 'var(--light-gray)' }} />
                </div>
              ))}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
            <div className="flex gap-3 justify-end pt-4">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--teal)' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Products popup */}
      {productsFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>Products under <span className="font-mono" style={{ color: 'var(--deep-teal)' }}>{productsFor.skuCode}</span></h3>
              <button onClick={() => setProductsFor(null)}><X size={20} style={{ color: 'var(--mid-gray)' }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--mid-gray)' }}>{productsFor.department} · {productsFor.mainCategory} · {productsFor.subcategory}</p>
            <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--light-gray)' }}>
              {products === null ? (
                <div className="py-10 text-center"><Loader2 size={18} className="inline animate-spin" style={{ color: 'var(--teal)' }} /></div>
              ) : products.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: 'var(--mid-gray)' }}>No products use this SKU code yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr style={{ background: 'var(--off-white)' }}>
                    {['SKU', 'Name', 'Branch', 'Qty'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--mid-gray)' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} className="border-t" style={{ borderColor: 'var(--light-gray)', opacity: p.isActive === false ? 0.5 : 1 }}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--charcoal)' }}>{p.sku}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{p.name}{p.isActive === false && <span className="ml-1 text-[10px]" style={{ color: 'var(--mid-gray)' }}>(disabled)</span>}</td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--mid-gray)' }}>{BRANCH_LABEL[p.branch] || p.branch}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--charcoal)' }}>{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs mt-3 text-right" style={{ color: 'var(--mid-gray)' }}>{products?.length ?? 0} product{(products?.length ?? 0) === 1 ? '' : 's'}</p>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--charcoal)' }}>Delete SKU classification</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--mid-gray)' }}>This removes the guide entry only — products keep their SKUs.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--light-gray)' }}>Cancel</button>
              <button onClick={() => doDelete(deleteId)} className="px-4 py-2 rounded-lg text-sm text-white bg-red-500 hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
