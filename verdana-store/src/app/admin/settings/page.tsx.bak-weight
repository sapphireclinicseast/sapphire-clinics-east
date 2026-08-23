"use client"

import { useState, useEffect } from "react"
import {
  MapPin,
  Save,
  Check,
  Loader2,
  Truck,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/format"

interface ShippingTier {
  maxKm: number
  fee: number
}

interface WarehouseSettings {
  address: string
  city: string
  zipCode: string
  latitude: number
  longitude: number
}

interface StoreSettings {
  warehouse: WarehouseSettings
  shipping: { tiers: ShippingTier[] }
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [zipCode, setZipCode] = useState("")
  const [latitude, setLatitude] = useState(0)
  const [longitude, setLongitude] = useState(0)
  const [tiers, setTiers] = useState<ShippingTier[]>([
    { maxKm: 5, fee: 50 },
    { maxKm: 10, fee: 70 },
    { maxKm: 999999, fee: 100 },
  ])

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: StoreSettings) => {
        if (data.warehouse) {
          setAddress(data.warehouse.address || "")
          setCity(data.warehouse.city || "")
          setZipCode(data.warehouse.zipCode || "")
          setLatitude(data.warehouse.latitude || 0)
          setLongitude(data.warehouse.longitude || 0)
        }
        if (data.shipping?.tiers) {
          setTiers(data.shipping.tiers)
        }
        setLoading(false)
      })
  }, [])

  async function geocodeAddress() {
    if (!address && !city) return
    setGeocoding(true)
    try {
      const query = encodeURIComponent(`${address}, ${city}, Philippines`)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        { headers: { "User-Agent": "VerdanaStore/1.0" } }
      )
      const results = await res.json()
      if (results.length > 0) {
        setLatitude(parseFloat(results[0].lat))
        setLongitude(parseFloat(results[0].lon))
        setSaved(false)
      } else {
        alert("Could not find coordinates for this address. Please check the address and try again.")
      }
    } catch (err) {
      console.error("Geocoding failed:", err)
    }
    setGeocoding(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: { address, city, zipCode, latitude, longitude },
          shipping: { tiers },
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error("Failed to save settings:", err)
    }
    setSaving(false)
  }

  function updateTier(index: number, field: keyof ShippingTier, value: number) {
    setTiers((prev) => {
      const arr = [...prev]
      arr[index] = { ...arr[index], [field]: value }
      return arr
    })
    setSaved(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-verdana-teal" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-verdana-teal/10 p-2.5">
            <Settings2 className="h-5 w-5 text-verdana-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-verdana-charcoal">Store Settings</h1>
            <p className="text-sm text-gray-500">Warehouse location &amp; shipping rates</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check className="h-4 w-4" /> Saved</>
          ) : (
            <><Save className="h-4 w-4" /> Save Settings</>
          )}
        </Button>
      </div>

      {/* Warehouse Address */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-verdana-teal" />
          <h2 className="text-lg font-semibold text-verdana-charcoal">Warehouse Address</h2>
        </div>
        <p className="text-sm text-gray-500">
          Shipping fees are calculated based on the customer&apos;s distance from this address.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Full Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => { setAddress(e.target.value); setSaved(false) }}
            placeholder="e.g. 123 Main St, Brgy. San Antonio"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => { setCity(e.target.value); setSaved(false) }}
              placeholder="e.g. Makati City"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Zip Code</label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => { setZipCode(e.target.value); setSaved(false) }}
              placeholder="e.g. 1200"
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
            />
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Latitude</label>
              <input
                type="number"
                step="any"
                value={latitude || ""}
                onChange={(e) => { setLatitude(parseFloat(e.target.value) || 0); setSaved(false) }}
                placeholder="14.5995"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Longitude</label>
              <input
                type="number"
                step="any"
                value={longitude || ""}
                onChange={(e) => { setLongitude(parseFloat(e.target.value) || 0); setSaved(false) }}
                placeholder="120.9842"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
              />
            </div>
          </div>
          <Button variant="outline" onClick={geocodeAddress} disabled={geocoding} className="mb-0.5">
            {geocoding ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Finding...</>
            ) : (
              <><MapPin className="h-4 w-4" /> Auto-detect</>
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Click &quot;Auto-detect&quot; to automatically find coordinates from the address above.
        </p>
      </div>

      {/* Shipping Tiers */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-verdana-teal" />
          <h2 className="text-lg font-semibold text-verdana-charcoal">Shipping Rates</h2>
        </div>
        <p className="text-sm text-gray-500">
          Flat shipping fee based on distance from warehouse. Applied once per order regardless of item count.
        </p>

        <div className="space-y-3">
          {tiers.map((tier, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {i === tiers.length - 1 ? "Beyond" : "Up to"} (km)
                </label>
                <input
                  type="number"
                  value={tier.maxKm === 999999 ? "" : tier.maxKm}
                  onChange={(e) =>
                    updateTier(i, "maxKm", parseFloat(e.target.value) || (i === tiers.length - 1 ? 999999 : 0))
                  }
                  placeholder={i === tiers.length - 1 ? "10+ km" : ""}
                  disabled={i === tiers.length - 1}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <div className="flex items-center gap-1 text-gray-400 text-sm mt-5">→</div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Fee (₱)</label>
                <input
                  type="number"
                  value={tier.fee}
                  onChange={(e) => updateTier(i, "fee", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-verdana-teal/5 border border-verdana-teal/20 p-4">
          <p className="text-sm font-medium text-verdana-charcoal mb-2">Shipping Summary</p>
          <div className="space-y-1 text-sm text-gray-600">
            {tiers.map((tier, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {i === 0
                    ? `Within ${tier.maxKm} km`
                    : i === tiers.length - 1
                    ? `${tiers[i - 1].maxKm} km and above`
                    : `${tiers[i - 1].maxKm}–${tier.maxKm} km`}
                </span>
                <span className="font-medium">{formatPrice(tier.fee)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
