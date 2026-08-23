"use client"

import { useState } from "react"
import { Heart, Users, Building2, X } from "lucide-react"
import { PartnerRegistrationForm } from "@/components/partners/PartnerRegistrationForm"

export function PartnerPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Fixed side panel (stays in place; large screens) */}
      <aside className="hidden lg:block fixed right-5 top-28 z-30 w-[300px]">
        <div className="rounded-2xl border border-verdana-orange/20 bg-white/95 backdrop-blur shadow-lg p-5">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-verdana-orange">For clinics &amp; schools</p>
          <h3 className="mt-1 text-lg font-bold text-verdana-charcoal leading-snug">Want your clinic/school to partner with us?</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2"><Heart className="h-4 w-4 mt-0.5 text-verdana-orange shrink-0" /> Discounts your patients can use</li>
            <li className="flex items-start gap-2"><Users className="h-4 w-4 mt-0.5 text-verdana-orange shrink-0" /> Discounts for your consultants</li>
            <li className="flex items-start gap-2"><Building2 className="h-4 w-4 mt-0.5 text-verdana-orange shrink-0" /> Discounts on everything your clinic orders</li>
          </ul>
          <button onClick={() => setOpen(true)} className="mt-4 w-full rounded-full bg-verdana-orange px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Become a Partner
          </button>
        </div>
      </aside>

      {/* Mobile CTA bar */}
      <div className="lg:hidden fixed bottom-4 inset-x-4 z-30">
        <button onClick={() => setOpen(true)} className="w-full rounded-full bg-verdana-orange px-5 py-3 text-sm font-semibold text-white shadow-lg">
          🤝 Partner your clinic/school with Verdana
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl my-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
            <PartnerRegistrationForm onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
