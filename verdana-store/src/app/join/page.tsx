import type { Metadata } from "next"
import { Heart, Users, Building2 } from "lucide-react"
import { PartnerRegistrationForm } from "@/components/partners/PartnerRegistrationForm"

export const metadata: Metadata = {
  title: "Become a Partner Clinic / School",
  description: "Register your clinic or school as a Verdana partner and unlock year-round discounts.",
}

const perks = [
  { icon: Heart, label: "Discounts your patients can use" },
  { icon: Users, label: "Discounts for your consultants" },
  { icon: Building2, label: "Discounts on everything your clinic orders" },
]

export default function JoinPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-widest uppercase text-verdana-orange">For clinics &amp; schools</p>
        <h1 className="mt-2 text-3xl font-bold text-verdana-charcoal">Partner with Verdana</h1>
        <p className="mt-2 text-gray-600">Unlock year-round discounts for your clinic, your consultants, and your patients.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {perks.map((p) => (
          <div key={p.label} className="rounded-xl border border-verdana-orange/20 bg-white p-4 text-center">
            <p.icon className="mx-auto h-5 w-5 text-verdana-orange" />
            <p className="mt-2 text-xs text-gray-600">{p.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-sm">
        <PartnerRegistrationForm />
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        Already a partner? <a href="/account" className="font-medium text-verdana-teal hover:underline">Sign in</a>
      </p>
    </div>
  )
}
