// Picks the part of the map the Patient Dashboard should open on.
//
// Fitting to every shaded city zooms the map out to the whole archipelago as
// soon as one patient lists Davao or Cebu, which leaves Metro Manila — where
// nearly everyone is — as a smudge. Instead this finds the densest cluster of
// shaded places and returns its bounds; far-away places stay shaded on the map,
// they just don't drive the opening zoom.
//
// Pure and Leaflet-free so it can be checked with plain `node`.

export type LatLngBoundsTuple = [[number, number], [number, number]] // [[south, west], [north, east]]

export interface AreaPoint {
  /** Centre of the place (the centre of its polygon's bounds is good enough). */
  lat: number
  lng: number
  count: number
  /** Bounds of the place's polygon, so the cluster's polygons fit fully. */
  bounds: LatLngBoundsTuple
  region?: string
}

export interface AreaPick {
  /** 'cluster' = a clear busiest area; 'all' = no clear cluster, fit everything;
   *  'none' = nothing to show. */
  mode: 'cluster' | 'all' | 'none'
  bounds: LatLngBoundsTuple | null
  /** Bounds of every point — what "Show all locations" fits to. */
  allBounds: LatLngBoundsTuple | null
  clusterTotal: number
  total: number
  /** Dominant region of the cluster by patient count, if regions were given. */
  region: string | null
  /** True when the cluster spans more than one region. */
  multiRegion: boolean
}

export const DEFAULT_RADIUS_KM = 30
/** Below this share of mapped patients the "cluster" is not the story (six
 *  equal cities spread across the country must not zoom onto one of them). */
export const DEFAULT_MIN_SHARE = 0.4

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function unionBounds(points: AreaPoint[]): LatLngBoundsTuple | null {
  if (points.length === 0) return null
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
  for (const p of points) {
    s = Math.min(s, p.bounds[0][0]); w = Math.min(w, p.bounds[0][1])
    n = Math.max(n, p.bounds[1][0]); e = Math.max(e, p.bounds[1][1])
  }
  return [[s, w], [n, e]]
}

/**
 * Density peak: every place scores the patients within `radiusKm` of it; the
 * best-scoring place is the peak, and the cluster is everything within
 * `radiusKm` of the peak. 30 km from Pasig reaches every Metro Manila city plus
 * the Rizal towns next door, while Cebu (≈570 km) and Davao (≈960 km) stay out.
 */
export function pickBusiestArea(
  input: AreaPoint[],
  opts: { radiusKm?: number; minShare?: number } = {},
): AreaPick {
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM
  const minShare = opts.minShare ?? DEFAULT_MIN_SHARE
  const points = input.filter((p) => p.count > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng))
  const total = points.reduce((s, p) => s + p.count, 0)
  const allBounds = unionBounds(points)
  if (points.length === 0 || total === 0) {
    return { mode: 'none', bounds: null, allBounds: null, clusterTotal: 0, total: 0, region: null, multiRegion: false }
  }

  let peak = points[0]
  let peakScore = -1
  for (const p of points) {
    let score = 0
    for (const q of points) {
      if (distanceKm(p.lat, p.lng, q.lat, q.lng) <= radiusKm) score += q.count
    }
    // Ties go to the place that itself holds more patients.
    if (score > peakScore || (score === peakScore && p.count > peak.count)) {
      peak = p
      peakScore = score
    }
  }

  const cluster = points.filter((q) => distanceKm(peak.lat, peak.lng, q.lat, q.lng) <= radiusKm)
  const clusterTotal = cluster.reduce((s, p) => s + p.count, 0)

  const byRegion = new Map<string, number>()
  for (const p of cluster) {
    if (p.region) byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + p.count)
  }
  let region: string | null = null
  let best = -1
  for (const [r, n] of byRegion) if (n > best) { region = r; best = n }

  if (clusterTotal / total < minShare) {
    return { mode: 'all', bounds: allBounds, allBounds, clusterTotal, total, region: null, multiRegion: false }
  }
  return {
    mode: 'cluster',
    bounds: unionBounds(cluster),
    allBounds,
    clusterTotal,
    total,
    region,
    multiRegion: byRegion.size > 1,
  }
}

/** Region names in public/ph.geojson are PSGC's; the clinic says "Metro Manila". */
export function friendlyRegion(region: string | null): string | null {
  if (!region) return null
  if (region.includes('NCR')) return 'Metro Manila'
  const paren = region.match(/\(([^)]+)\)/)
  if (paren) return paren[1].replace(/\b([A-Z])([A-Z]{5,})\b/g, (_, a, b) => a + b.toLowerCase())
  return region.replace(/\s*Region$/, '')
}
