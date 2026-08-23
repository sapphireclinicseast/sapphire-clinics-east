"use client"

import { useEffect, useState } from "react"
import { Building2, Loader2 } from "lucide-react"

interface Partner {
  id: string
  createdAt: string
  institution: string
  website?: string
  repFirstName: string
  repLastName: string
  email: string
  mobile: string
  therapistsRange: string
  patientsRange: string
  username: string
  officialBusinessName?: string
  tin?: string
  businessAddress?: string
  tier?: string | null
  subscriptionStatus: "unpaid" | "active" | "expired"
  paidAt?: string | null
  expiresAt?: string | null
  patientCode?: string | null
  consultantCode?: string | null
  invoices?: { id: string; filename: string; url: string; uploadedAt: string }[]
}

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"

const statusPill = (s: Partner["subscriptionStatus"]) => {
  const map = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    unpaid: "bg-amber-50 text-amber-700 border-amber-200",
    expired: "bg-gray-100 text-gray-500 border-gray-200",
  } as const
  return `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[s]}`
}

function InvoiceManager({ partner, onUpdate }: { partner: Partner; onUpdate: (p: Partner) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function upload(file: File) {
    setBusy(true); setError("")
    try {
      const fd = new FormData()
      fd.append("partnerId", partner.id)
      fd.append("file", file)
      const res = await fetch("/api/admin/partners/invoice", { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Upload failed.")
      onUpdate(d.partner)
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed.") }
    setBusy(false)
  }

  async function remove(invoiceId: string) {
    if (!confirm("Remove this invoice from the partner's portal?")) return
    const res = await fetch(`/api/admin/partners/invoice?partnerId=${encodeURIComponent(partner.id)}&invoiceId=${encodeURIComponent(invoiceId)}`, { method: "DELETE" })
    const d = await res.json()
    if (res.ok) onUpdate(d.partner)
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Sales invoices</div>
      {(partner.invoices || []).length > 0 && (
        <ul className="mb-2 space-y-1">
          {partner.invoices!.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={inv.url} target="_blank" rel="noopener noreferrer" className="text-verdana-teal hover:underline break-all">{inv.filename}</a>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{fmtDate(inv.uploadedAt)}</span>
                <button onClick={() => remove(inv.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:border-verdana-teal">
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = "" }} />
        {busy ? "Uploading…" : "＋ Upload sales invoice (PDF / image)"}
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function InstitutionalPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  const updatePartner = (u: Partner) => setPartners((prev) => prev.map((p) => (p.id === u.id ? u : p)))

  useEffect(() => {
    fetch("/api/admin/partners")
      .then((r) => r.json())
      .then((d) => setPartners(d.partners || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-verdana-teal" /></div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-verdana-teal/10 p-2.5"><Building2 className="h-5 w-5 text-verdana-teal" /></div>
        <div>
          <h1 className="text-2xl font-bold text-verdana-charcoal">Institutional Partners</h1>
          <p className="text-sm text-gray-500">{partners.length} registered clinic{partners.length === 1 ? "" : "s"} / school{partners.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {partners.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">No partner registrations yet.</p>
      ) : (
        <div className="space-y-4">
          {partners.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-verdana-charcoal">{p.institution}</h2>
                    <span className={statusPill(p.subscriptionStatus)}>
                      {p.subscriptionStatus === "active" ? "Active" : p.subscriptionStatus === "expired" ? "Expired" : "Unpaid"}
                    </span>
                    {p.tier && <span className="inline-flex items-center rounded-full bg-verdana-teal/10 px-2.5 py-0.5 text-xs font-semibold text-verdana-teal">{p.tier}</span>}
                  </div>
                  {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-sm text-verdana-teal underline">{p.website}</a>}
                </div>
                <div className="text-right text-xs text-gray-400">
                  Registered {fmtDate(p.createdAt)}<br />
                  {p.paidAt ? <>Paid {fmtDate(p.paidAt)} · expires {fmtDate(p.expiresAt)}</> : "Not yet subscribed"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Representative</div>
                  <div className="text-verdana-charcoal">{p.repFirstName} {p.repLastName}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Email</div>
                  <a href={`mailto:${p.email}`} className="text-verdana-teal break-all">{p.email}</a>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Mobile</div>
                  <div className="text-verdana-charcoal">{p.mobile}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Username</div>
                  <div className="text-verdana-charcoal font-mono text-xs">{p.username}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Therapists / Teachers</div>
                  <div className="text-verdana-charcoal">{p.therapistsRange}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Patients</div>
                  <div className="text-verdana-charcoal">{p.patientsRange}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Patient code</div>
                  <div className="font-mono text-xs text-verdana-charcoal">{p.patientCode || "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Clinic / consultant code</div>
                  <div className="font-mono text-xs text-verdana-charcoal">{p.consultantCode || "—"}</div>
                </div>
              </div>

              {(p.officialBusinessName || p.tin || p.businessAddress) && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">Sales-invoice billing</div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 text-sm text-verdana-charcoal">
                    <div><span className="text-gray-400">Business name:</span> {p.officialBusinessName || "—"}</div>
                    <div><span className="text-gray-400">TIN:</span> {p.tin || "—"}</div>
                    <div><span className="text-gray-400">Address:</span> {p.businessAddress || "—"}</div>
                  </div>
                </div>
              )}

              <InvoiceManager partner={p} onUpdate={updatePartner} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
