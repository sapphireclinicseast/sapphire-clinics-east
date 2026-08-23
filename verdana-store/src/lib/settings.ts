// ── Store settings (warehouse address, shipping rates) ──────────

import { readFile, writeFile, mkdir } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface ShippingTier {
  maxKm: number
  fee: number
}

export interface WeightTier {
  maxKg: number
  fee: number
}

export interface WarehouseSettings {
  address: string
  city: string
  zipCode: string
  latitude: number
  longitude: number
}

export interface DistanceSettings {
  /** When on, a per-km surcharge (from the main office to the buyer) is ADDED on top
   *  of the weight base fee. Off = weight-only pricing (previous behaviour). */
  enabled: boolean
  /** ₱ charged per km beyond the free radius. */
  perKm: number
  /** Distance included for free before the per-km charge kicks in (km). */
  freeKm: number
  /** Optional ceiling on the distance surcharge (₱). 0 / undefined = no cap. */
  maxFee?: number
}

export interface StoreSettings {
  warehouse: WarehouseSettings
  shipping: {
    tiers: ShippingTier[]
    /** Weight-based fee brackets. When present, the order's shipping fee is the bracket
     *  matching the total cart weight (Σ product weightKg × qty). Heavier orders pay more. */
    weightTiers?: WeightTier[]
    /** Distance-based surcharge, blended on top of the weight base. */
    distance?: DistanceSettings
    /** OpenRouteService API key (open-source, OSM-based geocoding + distance matrix).
     *  SERVER-ONLY — never returned by the public settings API. */
    routingApiKey?: string
    /** Routing base URL. Defaults to the hosted ORS. Point it at a self-hosted
     *  OpenRouteService instance to drop the third-party dependency entirely. */
    routingBaseUrl?: string
  }
  /** Downloadable products catalog (uploaded in admin, linked from the landing page). */
  catalog?: { url: string; filename: string; uploadedAt: string }
}

const SETTINGS_FILE = join(process.cwd(), 'src', 'data', 'settings.json')

const DEFAULT_SETTINGS: StoreSettings = {
  warehouse: { address: '', city: '', zipCode: '', latitude: 0, longitude: 0 },
  shipping: {
    tiers: [
      { maxKm: 5, fee: 50 },
      { maxKm: 10, fee: 70 },
      { maxKm: 999999, fee: 100 },
    ],
    weightTiers: [
      { maxKg: 1, fee: 80 },
      { maxKg: 3, fee: 120 },
      { maxKg: 6, fee: 180 },
      { maxKg: 999999, fee: 280 },
    ],
    distance: { enabled: false, perKm: 12, freeKm: 3, maxFee: 0 },
  },
}

export function getSettings(): StoreSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, 'utf-8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {}
  return DEFAULT_SETTINGS
}

export async function readSettings(): Promise<StoreSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function writeSettings(settings: StoreSettings): Promise<void> {
  await mkdir(join(process.cwd(), 'src', 'data'), { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

// ── Shipping fee calculation ──────────────────────────────────

// Haversine formula to calculate distance between two lat/lng points
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function calculateShippingFee(
  customerLat: number,
  customerLng: number,
  settings?: StoreSettings
): number {
  const s = settings || getSettings()

  if (!s.warehouse.latitude || !s.warehouse.longitude) {
    // No warehouse set — default to highest tier
    return s.shipping.tiers[s.shipping.tiers.length - 1]?.fee || 100
  }

  const distance = haversineDistance(
    s.warehouse.latitude, s.warehouse.longitude,
    customerLat, customerLng
  )

  // Sort tiers by maxKm ascending
  const sorted = [...s.shipping.tiers].sort((a, b) => a.maxKm - b.maxKm)

  for (const tier of sorted) {
    if (distance <= tier.maxKm) {
      return tier.fee
    }
  }

  // Beyond all tiers — return the highest
  return sorted[sorted.length - 1]?.fee || 100
}

// ── Weight-based shipping fee ─────────────────────────────────
// Picks the bracket matching the order's total weight (kg). Heavier orders cost more.
export function calculateWeightFee(totalKg: number, settings?: StoreSettings): number | null {
  const s = settings || getSettings()
  const tiers = s.shipping.weightTiers
  if (!tiers || tiers.length === 0) return null // no weight pricing configured
  const sorted = [...tiers].sort((a, b) => a.maxKg - b.maxKg)
  for (const tier of sorted) {
    if (totalKg <= tier.maxKg) return tier.fee
  }
  return sorted[sorted.length - 1]?.fee ?? null
}

// ── Distance (street-level, Google Distance Matrix) ───────────
/**
 * Real driving distance (km) from the main office to a free-text delivery address,
 * via OpenRouteService (open-source, OpenStreetMap data): geocode the address, then
 * ask the driving-car matrix for the distance. Returns null when no key/origin is
 * set or the address can't be resolved — callers fall back to weight-only pricing.
 */
export async function roadDistanceKm(destAddress: string, settings?: StoreSettings): Promise<number | null> {
  const s = settings || getSettings()
  const key = s.shipping.routingApiKey
  if (!key || !s.warehouse.latitude || !s.warehouse.longitude || !destAddress.trim()) return null
  const base = (s.shipping.routingBaseUrl || 'https://api.openrouteservice.org').replace(/\/+$/, '')

  try {
    // 1) Geocode the delivery address → [lng, lat], restricted to the Philippines.
    const geoUrl =
      `${base}/geocode/search?api_key=${encodeURIComponent(key)}` +
      `&text=${encodeURIComponent(destAddress)}&boundary.country=PHL&size=1`
    const geoRes = await fetch(geoUrl)
    const geo = await geoRes.json()
    const coords = geo?.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) {
      console.error('ORS geocode: no match for address')
      return null
    }
    const [destLng, destLat] = coords as [number, number]

    // 2) Driving distance (km) from office → buyer via the matrix endpoint.
    const matRes = await fetch(`${base}/v2/matrix/driving-car`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [[s.warehouse.longitude, s.warehouse.latitude], [destLng, destLat]],
        sources: [0],
        destinations: [1],
        metrics: ['distance'],
        units: 'km',
      }),
    })
    const mat = await matRes.json()
    const dist = mat?.distances?.[0]?.[0]
    if (typeof dist === 'number') return dist
    console.error('ORS matrix: no distance', mat?.error || '')
  } catch (e) {
    console.error('ORS distance request failed:', e)
  }
  return null
}

/** The per-km surcharge (₱) for a given road distance, honouring free km + cap. */
export function distanceSurcharge(roadKm: number | null, settings?: StoreSettings): number {
  const s = settings || getSettings()
  const d = s.shipping.distance
  if (!d?.enabled || roadKm == null || !(d.perKm > 0)) return 0
  const billableKm = Math.max(0, roadKm - (d.freeKm || 0))
  let fee = billableKm * d.perKm
  if (d.maxFee && d.maxFee > 0) fee = Math.min(fee, d.maxFee)
  return fee
}

/**
 * Blended shipping fee = weight base + distance surcharge.
 * `roadKm` is resolved by the caller (server-side) via {@link roadDistanceKm};
 * pass null to price on weight alone.
 */
export function calculateBlendedFee(
  totalKg: number,
  roadKm: number | null,
  settings?: StoreSettings,
): number {
  const s = settings || getSettings()
  const base = calculateWeightFee(totalKg, s) ?? 0
  const surcharge = distanceSurcharge(roadKm, s)
  return Math.round(base + surcharge)
}
