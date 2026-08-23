"use client"

import { useState, useEffect } from "react"
import { Ticket, Trash2, Pencil, Plus, X, Loader2, Check } from "lucide-react"

type DiscountType = "percent" | "fixed" | "none"

interface Voucher {
  code: string
  discountType: DiscountType
  discountValue: number
  freeShipping: boolean
  active: boolean
  minSubtotal?: number
  expiresAt?: string
  usageLimit?: number
  usedCount?: number
  description?: string
}

const BLANK: Voucher = {
  code: "",
  discountType: "percent",
  discountValue: 10,
  freeShipping: false,
  active: true,
}

function describe(v: Voucher): string {
  const parts: string[] = []
  if (v.discountType === "percent" && v.discountValue > 0) parts.push(`${v.discountValue}% off`)
  if (v.discountType === "fixed" && v.discountValue > 0) parts.push(`₱${v.discountValue.toLocaleString("en-PH")} off`)
  if (v.freeShipping) parts.push("Free shipping")
  return parts.join(" · ") || "No benefit"
}

export default function VouchersAdminPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Voucher>(BLANK)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await fetch("/api/admin/vouchers").then((r) => r.json())
      setVouchers(d.vouchers || [])
    } catch {
      setVouchers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function resetForm() {
    setForm(BLANK)
    setEditingCode(null)
    setError(null)
  }

  function startEdit(v: Voucher) {
    setForm({ ...v })
    setEditingCode(v.code)
    setError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const method = editingCode ? "PUT" : "POST"
      const payload = editingCode ? { ...form, originalCode: editingCode } : form
      const res = await fetch("/api/admin/vouchers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Could not save.")
        return
      }
      resetForm()
      await load()
    } catch {
      setError("Could not save.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(code: string) {
    if (!confirm(`Delete voucher "${code}"?`)) return
    const res = await fetch(`/api/admin/vouchers?code=${encodeURIComponent(code)}`, { method: "DELETE" })
    if (res.ok) {
      if (editingCode === code) resetForm()
      await load()
    }
  }

  async function toggleActive(v: Voucher) {
    const res = await fetch("/api/admin/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, originalCode: v.code, active: !v.active }),
    })
    if (res.ok) await load()
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal"
  const labelCls = "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1"

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Ticket className="h-6 w-6 text-verdana-teal" />
        <div>
          <h1 className="text-2xl font-bold text-verdana-charcoal">Discount Vouchers</h1>
          <p className="text-sm text-gray-500">
            Create codes customers enter at checkout — percent off, a fixed amount off, and/or free shipping.
          </p>
        </div>
      </div>

      {/* Create / edit form */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-verdana-charcoal">
            {editingCode ? `Edit "${editingCode}"` : "New voucher"}
          </h2>
          {editingCode && (
            <button onClick={resetForm} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
              <X className="h-4 w-4" /> Cancel edit
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Code</label>
            <input
              className={`${inputCls} uppercase`}
              placeholder="e.g. WELCOME10"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>

          <div>
            <label className={labelCls}>Discount type</label>
            <select
              className={inputCls}
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as DiscountType })}
            >
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed amount (₱)</option>
              <option value="none">No discount (shipping only)</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>
              {form.discountType === "percent" ? "Percent off" : form.discountType === "fixed" ? "Amount off (₱)" : "—"}
            </label>
            <input
              type="number"
              min={0}
              className={inputCls}
              disabled={form.discountType === "none"}
              value={form.discountType === "none" ? "" : form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
            />
          </div>

          <div>
            <label className={labelCls}>Min. order (₱, optional)</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={form.minSubtotal ?? ""}
              onChange={(e) => setForm({ ...form, minSubtotal: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>

          <div>
            <label className={labelCls}>Expires on (optional)</label>
            <input
              type="date"
              className={inputCls}
              value={form.expiresAt ?? ""}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || undefined })}
            />
          </div>

          <div>
            <label className={labelCls}>Usage limit (optional)</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              placeholder="Unlimited"
              value={form.usageLimit ?? ""}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls}>Description (optional, internal)</label>
            <input
              className={inputCls}
              placeholder="e.g. Launch promo for new customers"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-verdana-teal focus:ring-verdana-teal"
              checked={form.freeShipping}
              onChange={(e) => setForm({ ...form, freeShipping: e.target.checked })}
            />
            Waive shipping fee
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-verdana-teal focus:ring-verdana-teal"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-verdana-teal px-5 py-2.5 text-sm font-semibold text-white hover:bg-verdana-teal/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCode ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingCode ? "Save changes" : "Create voucher"}
          </button>
        </div>
      </div>

      {/* List */}
      <div>
        <h2 className="text-lg font-semibold text-verdana-charcoal">
          {vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""}
        </h2>

        {loading ? (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-gray-200" />
        ) : vouchers.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
            No vouchers yet. Create one above.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Benefit</th>
                  <th className="px-4 py-3">Conditions</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.code} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-verdana-charcoal">{v.code}</td>
                    <td className="px-4 py-3 text-gray-700">{describe(v)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {[
                        v.minSubtotal ? `Min ₱${v.minSubtotal.toLocaleString("en-PH")}` : null,
                        v.expiresAt ? `Ends ${v.expiresAt}` : null,
                        v.usageLimit ? `Limit ${v.usageLimit}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {v.usedCount || 0}
                      {v.usageLimit ? `/${v.usageLimit}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(v)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          v.active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-500 border border-gray-200"
                        }`}
                        title="Click to toggle"
                      >
                        {v.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(v)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-verdana-teal"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(v.code)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
