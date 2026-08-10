"use client"

import { useState } from "react"

const THERAPIST_RANGES = ["1–5", "6–10", "11–20", "21–50", "50+"]
const PATIENT_RANGES = ["1–50", "51–200", "201–500", "501–1,000", "1,000+"]

const input =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"

const EMPTY = {
  institution: "", website: "", repFirstName: "", repLastName: "",
  email: "", mobile: "", therapistsRange: "", patientsRange: "",
  username: "", password: "",
}

/** Shared partner sign-up form — used in the home-page modal and the standalone /join page. */
export function PartnerRegistrationForm({ onClose }: { onClose?: () => void }) {
  const [f, setF] = useState({ ...EMPTY })
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [error, setError] = useState("")
  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("sending"); setError("")
    try {
      const res = await fetch("/api/partners/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not create your account.")
      setStatus("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setStatus("error")
    }
  }

  if (status === "done") {
    return (
      <div className="p-8 text-center">
        <p className="text-2xl">🎉</p>
        <h3 className="mt-2 text-xl font-bold text-verdana-charcoal">You&apos;re registered!</h3>
        <p className="mt-2 text-sm text-gray-600">
          Your partner account for <span className="font-semibold">{f.institution}</span> is created and
          you&apos;re signed in. Next, choose your subscription tier (Platinum, Gold or Silver) to activate
          your clinic &amp; patient discount codes.
        </p>
        <a href="/account" className="mt-6 inline-block rounded-full bg-verdana-orange px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Go to my portal →
        </a>
        {onClose && (
          <button onClick={onClose} className="mt-3 block w-full text-sm text-gray-400 hover:text-gray-600">Maybe later</button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="p-6 space-y-3">
      <h3 className="text-xl font-bold text-verdana-charcoal">Create your partner account</h3>
      <p className="text-sm text-gray-500 -mt-1">Tell us about your clinic or school.</p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Name of Institution *</label>
        <input className={input} value={f.institution} onChange={(e) => set("institution", e.target.value)} placeholder="e.g. Bright Steps Therapy Center" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Website of Institution</label>
        <input className={input} value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https:// (optional)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Representative — First Name *</label>
          <input className={input} value={f.repFirstName} onChange={(e) => set("repFirstName", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
          <input className={input} value={f.repLastName} onChange={(e) => set("repLastName", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
          <input type="email" className={input} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@clinic.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number *</label>
          <input type="tel" inputMode="tel" className={input} value={f.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="09XX XXX XXXX" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Therapists / Teachers *</label>
          <select className={input} value={f.therapistsRange} onChange={(e) => set("therapistsRange", e.target.value)}>
            <option value="">Select range…</option>
            {THERAPIST_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Patients *</label>
          <select className={input} value={f.patientsRange} onChange={(e) => set("patientsRange", e.target.value)}>
            <option value="">Select range…</option>
            {PATIENT_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
          <input className={input} value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="username" placeholder="clinic-handle" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
          <input type="password" className={input} value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" placeholder="min 8 characters" />
        </div>
      </div>

      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={status === "sending"} className="w-full rounded-full bg-verdana-orange px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {status === "sending" ? "Creating account…" : "Create account"}
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        After registering you&apos;ll choose a tier and pay the annual subscription to activate your discount codes.
      </p>
    </form>
  )
}
