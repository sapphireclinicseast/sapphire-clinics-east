// ── Homecare PT fare engine ──────────────────────────────────────────────────
// Pure, dependency-free (no Prisma import) so it's easy to test and reuse. The
// caller loads HomecareSettings + the serving HomecareClinic from the DB and
// passes plain numbers in.
//
// Total charged = sessionFee + transportFee, where transportFee is a tiered
// per-km fare from the serving clinic to the client's geocoded home address,
// multiplied by a time-of-day surge factor (capped).
//
// Distance strategy (user choice): road distance via OpenRouteService (real
// driving km). If ORS is unavailable or the address can't be geocoded we fall
// back — first to straight-line haversine × a road factor, and finally to an
// admin-set flat fee — so a flaky geocode never blocks payment.

const ORS_BASE = (process.env.OPENROUTESERVICE_BASE_URL || 'https://api.openrouteservice.org').replace(/\/+$/, '')
const ORS_KEY = process.env.OPENROUTESERVICE_API_KEY || process.env.ORS_API_KEY || ''
const ROAD_FACTOR = 1.3 // haversine→road correction when ORS is unavailable
const GEO_UA = 'SapphireClinicsEast-Homecare/1.0 (main@sapphireclinicseast.org)'

export interface SurgeWindow {
  label?: string
  days: number[] // 0=Sun … 6=Sat (Asia/Manila)
  startHour: number // inclusive, 0–23
  endHour: number // exclusive, 1–24
  multiplier: number
}

export interface FareSettings {
  sessionFee: number
  baseFare: number
  baseKm: number
  shortRatePerKm: number
  shortMaxKm: number
  longRatePerKm: number
  surge: SurgeWindow[]
  surgeCap: number
  defaultTransportFee: number | null
  orsEnabled: boolean
}

export type FareMethod = 'ORS_ROAD' | 'HAVERSINE' | 'DEFAULT_FEE'

export interface FareResult {
  ok: boolean
  method: FareMethod
  destLat: number | null
  destLng: number | null
  distanceKm: number | null
  sessionFee: number
  baseTransport: number // transport before surge
  surgeMultiplier: number
  surgeLabel: string | null
  transportFee: number // rounded, after surge
  total: number
  breakdown: string[]
  notes: string | null
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Geocode a free-text PH address → {lat,lng}. Tries ORS geocoder first (when a
// key is set) then falls back to keyless Nominatim. Returns null on no match.
export async function geocodePH(address: string): Promise<{ lat: number; lng: number } | null> {
  const text = address.trim()
  if (!text) return null

  if (ORS_KEY) {
    try {
      const url =
        `${ORS_BASE}/geocode/search?api_key=${encodeURIComponent(ORS_KEY)}` +
        `&text=${encodeURIComponent(text)}&boundary.country=PHL&size=1`
      const res = await fetch(url)
      if (res.ok) {
        const geo = await res.json()
        const c = geo?.features?.[0]?.geometry?.coordinates
        if (Array.isArray(c) && c.length >= 2) return { lat: Number(c[1]), lng: Number(c[0]) }
      }
    } catch (e) {
      console.error('[homecare] ORS geocode failed:', e)
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1&countrycodes=ph`,
      { headers: { 'User-Agent': GEO_UA } },
    )
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      }
    }
  } catch (e) {
    console.error('[homecare] Nominatim geocode failed:', e)
  }
  return null
}

// Real driving distance (km) origin→dest via the ORS matrix. null on failure.
export async function roadKm(
  oLat: number,
  oLng: number,
  dLat: number,
  dLng: number,
): Promise<number | null> {
  if (!ORS_KEY) return null
  try {
    const res = await fetch(`${ORS_BASE}/v2/matrix/driving-car`, {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [
          [oLng, oLat],
          [dLng, dLat],
        ],
        sources: [0],
        destinations: [1],
        metrics: ['distance'],
        units: 'km',
      }),
    })
    if (!res.ok) return null
    const mat = await res.json()
    const d = mat?.distances?.[0]?.[0]
    return typeof d === 'number' ? d : null
  } catch (e) {
    console.error('[homecare] ORS matrix failed:', e)
    return null
  }
}

// Tiered transport fare (pre-surge). Base covers the first baseKm; each km from
// baseKm→shortMaxKm adds shortRatePerKm; each km beyond adds longRatePerKm.
export function tieredTransport(distanceKm: number, s: FareSettings): number {
  const d = Math.max(0, distanceKm)
  if (d <= s.baseKm) return s.baseFare
  const shortKm = Math.min(d, s.shortMaxKm) - s.baseKm
  let fare = s.baseFare + shortKm * s.shortRatePerKm
  if (d > s.shortMaxKm) fare += (d - s.shortMaxKm) * s.longRatePerKm
  return fare
}

// Day-of-week + hour in Asia/Manila, regardless of server timezone.
function manilaDayHour(when: Date): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(when)
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { day: days.indexOf(wd), hour: Number(hourStr) % 24 }
}

// First matching surge window wins; multiplier is clamped to surgeCap. Returns
// 1.0 when nothing matches.
export function surgeFor(when: Date, s: FareSettings): { multiplier: number; label: string | null } {
  const { day, hour } = manilaDayHour(when)
  for (const w of s.surge || []) {
    if (!Array.isArray(w.days) || !w.days.includes(day)) continue
    if (hour >= w.startHour && hour < w.endHour) {
      const m = Math.min(Math.max(1, w.multiplier || 1), s.surgeCap || 999)
      return { multiplier: m, label: w.label ?? `${w.startHour}:00–${w.endHour}:00` }
    }
  }
  return { multiplier: 1, label: null }
}

export interface ComputeFareInput {
  originLat: number
  originLng: number
  address: string
  when: Date // service datetime (open-day date @ service-window start), for surge
  settings: FareSettings
  // If the destination was already geocoded (e.g. cached on a prior quote),
  // pass it to skip re-geocoding.
  destLat?: number | null
  destLng?: number | null
}

export async function computeHomecareFare(input: ComputeFareInput): Promise<FareResult> {
  const { originLat, originLng, address, when, settings: s } = input
  const sessionFee = s.sessionFee
  const breakdown: string[] = [`Session fee: ₱${sessionFee.toLocaleString('en-PH')}`]

  // 1) Resolve destination coordinates.
  let destLat = input.destLat ?? null
  let destLng = input.destLng ?? null
  if (destLat == null || destLng == null) {
    const geo = await geocodePH(address)
    if (geo) {
      destLat = geo.lat
      destLng = geo.lng
    }
  }

  const surge = surgeFor(when, s)

  const finish = (method: FareMethod, distanceKm: number | null, baseTransport: number, notes: string | null): FareResult => {
    const transportFee = Math.round(baseTransport * surge.multiplier)
    if (distanceKm != null) breakdown.push(`Distance: ${distanceKm.toFixed(1)} km`)
    breakdown.push(`Transport: ₱${Math.round(baseTransport).toLocaleString('en-PH')}`)
    if (surge.multiplier > 1) breakdown.push(`Peak surge ×${surge.multiplier}${surge.label ? ` (${surge.label})` : ''}: ₱${(transportFee - Math.round(baseTransport)).toLocaleString('en-PH')}`)
    return {
      ok: true,
      method,
      destLat,
      destLng,
      distanceKm,
      sessionFee,
      baseTransport: Math.round(baseTransport),
      surgeMultiplier: surge.multiplier,
      surgeLabel: surge.label,
      transportFee,
      total: sessionFee + transportFee,
      breakdown,
      notes,
    }
  }

  // 2) Distance → transport fare, with graceful degradation.
  if (destLat != null && destLng != null) {
    let distanceKm: number | null = null
    let method: FareMethod = 'HAVERSINE'
    if (s.orsEnabled) {
      const road = await roadKm(originLat, originLng, destLat, destLng)
      if (road != null) {
        distanceKm = road
        method = 'ORS_ROAD'
      }
    }
    if (distanceKm == null) {
      distanceKm = haversineKm(originLat, originLng, destLat, destLng) * ROAD_FACTOR
      method = 'HAVERSINE'
    }
    return finish(method, distanceKm, tieredTransport(distanceKm, s), method === 'HAVERSINE' ? 'Estimated (straight-line) — routing unavailable.' : null)
  }

  // 3) Geocode failed entirely — fall back to the admin flat fee if set.
  if (s.defaultTransportFee != null) {
    return finish('DEFAULT_FEE', null, s.defaultTransportFee, 'Address could not be located — standard transport fee applied.')
  }

  // 4) No coordinates and no fallback fee: signal the caller to ask for a
  //    clearer address rather than charge a wrong amount.
  return {
    ok: false,
    method: 'DEFAULT_FEE',
    destLat: null,
    destLng: null,
    distanceKm: null,
    sessionFee,
    baseTransport: 0,
    surgeMultiplier: surge.multiplier,
    surgeLabel: surge.label,
    transportFee: 0,
    total: sessionFee,
    breakdown,
    notes: 'We could not locate that address. Please add a barangay/landmark and city so we can compute travel cost.',
  }
}

// Convenience: coerce a Prisma HomecareSettings row (Decimals as any) → FareSettings.
export function toFareSettings(row: {
  sessionFee: unknown
  baseFare: unknown
  baseKm: number
  shortRatePerKm: unknown
  shortMaxKm: number
  longRatePerKm: unknown
  surge: unknown
  surgeCap: number
  defaultTransportFee: unknown
  orsEnabled: boolean
}): FareSettings {
  const num = (v: unknown, d = 0): number => (v == null ? d : Number(v))
  return {
    sessionFee: num(row.sessionFee, 2000),
    baseFare: num(row.baseFare, 70),
    baseKm: row.baseKm ?? 2,
    shortRatePerKm: num(row.shortRatePerKm, 20),
    shortMaxKm: row.shortMaxKm ?? 7,
    longRatePerKm: num(row.longRatePerKm, 20),
    surge: Array.isArray(row.surge) ? (row.surge as SurgeWindow[]) : [],
    surgeCap: row.surgeCap ?? 2,
    defaultTransportFee: row.defaultTransportFee == null ? null : Number(row.defaultTransportFee),
    orsEnabled: row.orsEnabled ?? true,
  }
}
