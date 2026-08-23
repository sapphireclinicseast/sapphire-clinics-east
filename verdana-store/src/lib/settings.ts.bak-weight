// ── Store settings (warehouse address, shipping rates) ──────────

import { readFile, writeFile, mkdir } from 'fs/promises'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface ShippingTier {
  maxKm: number
  fee: number
}

export interface WarehouseSettings {
  address: string
  city: string
  zipCode: string
  latitude: number
  longitude: number
}

export interface StoreSettings {
  warehouse: WarehouseSettings
  shipping: {
    tiers: ShippingTier[]
  }
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
