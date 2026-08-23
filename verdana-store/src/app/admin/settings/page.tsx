"use client"

import { useState, useEffect } from "react"
import {
  MapPin,
  Save,
  Check,
  Loader2,
  Truck,
  Settings2,
  Plus,
  Trash2,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/format"

interface ShippingTier {
  maxKm: number
  fee: number
}

interface WeightTier {
  maxKg: number
  fee: number
}

interface WarehouseSettings {
  address: string
  city: string
  zipCode: string
  latitude: number
  longitude: number
}

interface DistanceSettings {
  enabled: boolean
  perKm: number
  freeKm: number
  maxFee?: number
}

interface StoreSettings {
  warehouse: WarehouseSettings
  shipping: {
    tiers: ShippingTier[]
    weightTiers?: WeightTier[]
    distance?: DistanceSettings
    hasRoutingKey?: boolean
  }
  catalog?: { url: string; filename: string; uploadedAt: string }
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
  const [weightTiers, setWeightTiers] = useState<WeightTier[]>([
    { maxKg: 1, fee: 80 },
    { maxKg: 3, fee: 120 },
    { maxKg: 6, fee: 180 },
    { maxKg: 999999, fee: 280 },
  ])
  const [distance, setDistance] = useState<DistanceSettings>({
    enabled: false, perKm: 12, freeKm: 3, maxFee: 0,
  })
  // Routing key is write-only from the UI: we never receive it back, only
  // whether one is on file. `routingKey` holds a NEW key the admin is typing.
  const [hasRoutingKey, setHasRoutingKey] = useState(false)
  const [routingKey, setRoutingKey] = useState("")
  const [catalog, setCatalog] = useState<{ url: string; filename: string; uploadedAt: string } | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)

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
        if (data.shipping?.weightTiers && data.shipping.weightTiers.length > 0) {
          setWeightTiers(data.shipping.weightTiers)
        }
        if (data.shipping?.distance) {
          setDistance({
            enabled: !!data.shipping.distance.enabled,
            perKm: data.shipping.distance.perKm ?? 12,
            freeKm: data.shipping.distance.freeKm ?? 3,
            maxFee: data.shipping.distance.maxFee ?? 0,
          })
        }
        setHasRoutingKey(!!data.shipping?.hasRoutingKey)
        setCatalog(data.catalog || null)
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
      const shippingPayload: Record<string, unknown> = { tiers, weightTiers, distance }
      // Only send the key when the admin actually typed a new one.
      if (routingKey.trim()) shippingPayload.routingApiKey = routingKey.trim()

      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse: { address, city, zipCode, latitude, longitude },
          shipping: shippingPayload,
        }),
      })
      if (routingKey.trim()) { setHasRoutingKey(true); setRoutingKey("") }
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

  function updateWeightTier(index: number, field: keyof WeightTier, value: number) {
    setWeightTiers((prev) => {
      const arr = [...prev]
      arr[index] = { ...arr[index], [field]: value }
      return arr
    })
    setSaved(false)
  }

  function addWeightTier() {
    setWeightTiers((prev) => {
      const arr = [...prev]
      const last = arr[arr.length - 1]
      // insert a new bracket just before the "Beyond" (999999) row
      const prevMax = arr.length >= 2 ? arr[arr.length - 2].maxKg : 0
      arr.splice(arr.length - 1, 0, { maxKg: prevMax + 2, fee: last.fee })
      return arr
    })
    setSaved(false)
  }

  function removeWeightTier(index: number) {
    setWeightTiers((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
    setSaved(false)
  }

  async function uploadCatalog(file: File) {
    setCatalogBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/catalog", { method: "POST", body: fd })
      const d = await res.json()
      if (res.ok) setCatalog(d.catalog)
      else alert(d.error || "Upload failed")
    } catch {
      alert("Upload failed")
    }
    setCatalogBusy(false)
  }

  async function removeCatalog() {
    if (!confirm("Remove the downloadable catalog from the landing page?")) return
    const res = await fetch("/api/admin/catalog", { method: "DELETE" })
    if (res.ok) setCatalog(null)
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
          <h2 className="text-lg font-semibold text-verdana-charcoal">Main office (shipping origin)</h2>
        </div>
        <p className="text-sm text-gray-500">
          This is where deliveries ship from. The distance surcharge below is measured from here to the
          buyer&apos;s address. Enter the coordinates manually, or use &quot;Auto-detect&quot; from the address.
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

      {/* Weight-based shipping rates */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-verdana-teal" />
          <h2 className="text-lg font-semibold text-verdana-charcoal">Shipping Rates by Weight</h2>
        </div>
        <p className="text-sm text-gray-500">
          The shipping fee is set by the order&rsquo;s total weight — heavier orders pay more. Total weight is
          the sum of each item&rsquo;s weight × quantity. Set a weight per product in the product editor.
        </p>

        <div className="space-y-3">
          {weightTiers.map((tier, i) => {
            const isLast = i === weightTiers.length - 1
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {isLast ? "Heavier than the row above" : "Up to (kg)"}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={tier.maxKg === 999999 ? "" : tier.maxKg}
                    onChange={(e) =>
                      updateWeightTier(i, "maxKg", parseFloat(e.target.value) || (isLast ? 999999 : 0))
                    }
                    placeholder={isLast ? "and above" : ""}
                    disabled={isLast}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
                <div className="flex items-center gap-1 text-gray-400 text-sm mt-5">→</div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fee (₱)</label>
                  <input
                    type="number"
                    min="0"
                    value={tier.fee}
                    onChange={(e) => updateWeightTier(i, "fee", parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeWeightTier(i)}
                  disabled={isLast || weightTiers.length <= 2}
                  title="Remove bracket"
                  className="mt-5 rounded-lg p-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={addWeightTier}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-verdana-teal hover:text-verdana-dark-teal"
        >
          <Plus className="h-4 w-4" /> Add weight bracket
        </button>

        <div className="rounded-xl bg-verdana-teal/5 border border-verdana-teal/20 p-4">
          <p className="text-sm font-medium text-verdana-charcoal mb-2">Shipping Summary</p>
          <div className="space-y-1 text-sm text-gray-600">
            {weightTiers.map((tier, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {i === 0
                    ? `Up to ${tier.maxKg} kg`
                    : i === weightTiers.length - 1
                    ? `${weightTiers[i - 1].maxKg} kg and above`
                    : `${weightTiers[i - 1].maxKg}–${tier.maxKg} kg`}
                </span>
                <span className="font-medium">{formatPrice(tier.fee)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Distance surcharge */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-verdana-teal" />
            <h2 className="text-lg font-semibold text-verdana-charcoal">Distance surcharge</h2>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-500">{distance.enabled ? "On" : "Off"}</span>
            <input
              type="checkbox"
              checked={distance.enabled}
              onChange={(e) => { setDistance((d) => ({ ...d, enabled: e.target.checked })); setSaved(false) }}
              className="h-5 w-9 appearance-none rounded-full bg-gray-200 checked:bg-verdana-teal transition-colors relative cursor-pointer
                before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
            />
          </label>
        </div>
        <p className="text-sm text-gray-500">
          Adds a per-kilometre fee <span className="font-medium">on top of</span> the weight fee above, measured by
          road from your main office to the buyer&rsquo;s address. Final fee = weight fee + distance surcharge.
          Needs an OpenRouteService key (below) for street-level distance; otherwise the surcharge is skipped.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">₱ per km</label>
            <input
              type="number" step="0.5" min="0"
              value={distance.perKm}
              disabled={!distance.enabled}
              onChange={(e) => { setDistance((d) => ({ ...d, perKm: parseFloat(e.target.value) || 0 })); setSaved(false) }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-verdana-teal/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Free km (included)</label>
            <input
              type="number" step="0.5" min="0"
              value={distance.freeKm}
              disabled={!distance.enabled}
              onChange={(e) => { setDistance((d) => ({ ...d, freeKm: parseFloat(e.target.value) || 0 })); setSaved(false) }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-verdana-teal/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max surcharge (₱, 0 = none)</label>
            <input
              type="number" step="1" min="0"
              value={distance.maxFee ?? 0}
              disabled={!distance.enabled}
              onChange={(e) => { setDistance((d) => ({ ...d, maxFee: parseFloat(e.target.value) || 0 })); setSaved(false) }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-verdana-teal/30"
            />
          </div>
        </div>

        <div className="rounded-xl bg-verdana-teal/5 border border-verdana-teal/20 p-4 text-sm text-gray-600">
          <p className="font-medium text-verdana-charcoal mb-1">Example</p>
          A 4&nbsp;kg order delivered 10&nbsp;km away ={" "}
          <span className="font-medium">
            weight fee + {formatPrice(Math.max(0, 10 - (distance.freeKm || 0)) * (distance.perKm || 0))}
          </span>{" "}
          ({Math.max(0, 10 - (distance.freeKm || 0))} km × {formatPrice(distance.perKm || 0)}
          {distance.maxFee ? `, capped at ${formatPrice(distance.maxFee)}` : ""}).
        </div>
      </div>

      {/* OpenRouteService API key */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-verdana-teal" />
          <h2 className="text-lg font-semibold text-verdana-charcoal">OpenRouteService API key</h2>
        </div>
        <p className="text-sm text-gray-500">
          Open-source, OpenStreetMap-based routing used server-side for street-level driving distance.
          Sign up free at{" "}
          <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer"
            className="text-verdana-teal underline">openrouteservice.org</a>{" "}
          and paste your key here (free tier ~2,000 requests/day). Stored securely — never shown again
          after saving.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            API key {hasRoutingKey && <span className="text-verdana-teal font-normal">✓ a key is on file</span>}
          </label>
          <input
            type="password"
            value={routingKey}
            onChange={(e) => { setRoutingKey(e.target.value); setSaved(false) }}
            placeholder={hasRoutingKey ? "•••••••• (leave blank to keep current)" : "eyJ… (ORS key)"}
            autoComplete="off"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
          />
        </div>
      </div>

      {/* Products catalog */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-verdana-teal" />
          <h2 className="text-lg font-semibold text-verdana-charcoal">Products Catalog</h2>
        </div>
        <p className="text-sm text-gray-500">
          Upload a catalog (PDF or image). A &ldquo;Download Catalog&rdquo; button appears on the landing page for customers.
        </p>
        {catalog ? (
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <a href={catalog.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-verdana-teal hover:underline break-all">
              {catalog.filename}
            </a>
            <span className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-400">Uploaded {new Date(catalog.uploadedAt).toLocaleDateString("en-PH")}</span>
              <button onClick={removeCatalog} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No catalog uploaded yet.</p>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-verdana-teal">
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" disabled={catalogBusy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCatalog(f); e.currentTarget.value = "" }} />
          {catalogBusy ? "Uploading…" : catalog ? "Replace catalog" : "Upload catalog"}
        </label>
      </div>

      {/* Bottom save — mirrors the top button so you can save without scrolling up.
          (The catalog above saves on upload; this saves the API key, distance & rates.) */}
      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check className="h-4 w-4" /> Saved</>
          ) : (
            <><Save className="h-4 w-4" /> Save Settings</>
          )}
        </Button>
      </div>
    </div>
  )
}
