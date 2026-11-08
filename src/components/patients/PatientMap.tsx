'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair, Maximize2 } from 'lucide-react'
import {
  pickBusiestArea, friendlyRegion,
  type AreaPick, type AreaPoint, type LatLngBoundsTuple,
} from './busiest-area'

interface CityCount      { name: string; count: number }
interface PatientMapProps { cities: CityCount[]; locations?: unknown[] }

const CLINICS = [
  { name: 'East Branch (Pasig)',          lat: 14.5764,   lng: 121.0851   },
  { name: 'Greenhills Branch (San Juan)', lat: 14.601888, lng: 121.049017 },
]

// Where the map sits when there is nothing to fit to: Metro Manila, between the
// two clinics — never the whole-archipelago view.
const DEFAULT_CENTER: [number, number] = [14.59, 121.06]
const DEFAULT_ZOOM = 11
const FIT_OPTS = { padding: [28, 28] as [number, number], maxZoom: 12 }

// Module-level cache — same-origin fetch is cheap but we only want one in-flight request
let _geoCache: any | null = null
let _geoCachePromise: Promise<any> | null = null

// Normalize to uppercase ASCII — does NOT strip "CITY" so "Quezon City" stays distinct from "Quezon"
function normName(s: string): string {
  return (s || '').toUpperCase()
    .replace(/Ñ/g, 'N').replace(/[ÀÁÂÃÄ]/g, 'A').replace(/[ÈÉÊË]/g, 'E')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

// Strip "CITY OF …" prefix and trailing "CITY" — used only on the GeoJSON side as a fallback
function stripCityWord(s: string): string {
  return s.replace(/\bCITY OF\b/g, '').replace(/\bCITY\b/g, '').replace(/\s+/g, ' ').trim()
}

function geoName(props: Record<string, any>): string {
  for (const k of ['ADM3_EN', 'NAME_2', 'NAME_3', 'municipality', 'MUNICIPALITY', 'name', 'NAME', 'MUNICITY']) {
    if (props[k]) return String(props[k])
  }
  return ''
}

const STOPS = ['#cde5dd', '#9ed3c4', '#6cbca8', '#3f9e88', '#2b7d6b', '#1d5e50']

function stopIndex(n: number, max: number): number {
  const t = max > 1 ? (n - 1) / (max - 1) : 1
  return Math.min(STOPS.length - 1, Math.round(t * (STOPS.length - 1)))
}

function colorFor(n: number, max: number): string {
  if (!n) return '#eef2f5'
  return STOPS[stopIndex(n, max)]
}

/** The patient-count range each colour stop actually covers, for the legend. */
function legendBuckets(max: number): { color: string; lo: number; hi: number }[] {
  const out: { color: string; lo: number; hi: number }[] = []
  for (let n = 1; n <= max; n++) {
    const i = stopIndex(n, max)
    const last = out[out.length - 1]
    if (last && last.color === STOPS[i]) last.hi = n
    else out.push({ color: STOPS[i], lo: n, hi: n })
  }
  return out
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

async function loadGeoJSON(): Promise<any | null> {
  if (_geoCache) return _geoCache
  if (_geoCachePromise) return _geoCachePromise
  _geoCachePromise = fetch('/ph.geojson', { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(data => { _geoCache = data; return data })
    .catch(() => null)
  return _geoCachePromise
}

export default function PatientMap({ cities }: PatientMapProps) {
  const wrapRef     = useRef<HTMLDivElement>(null)
  const mapRef      = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<any>(null)
  const leafletRef  = useRef<any>(null)
  const geoLayerRef = useRef<any>(null)

  const [status, setStatus]   = useState<'loading' | 'ready' | 'no-outline'>('loading')
  const [geojson, setGeojson] = useState<any>(null)
  const [pick, setPick]       = useState<AreaPick | null>(null)
  const [legend, setLegend]   = useState<{ color: string; lo: number; hi: number }[]>([])
  const [view, setView]       = useState<'busiest' | 'all'>('busiest')

  // ── Map + clinic markers, once ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || instanceRef.current) return
    let cancelled = false
    let mapInstance: any

    import('leaflet').then(async (L) => {
      if (cancelled || !mapRef.current) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      mapInstance = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
        minZoom: 5,
        maxZoom: 13,
        // Wheel-zoom only after a click, so scrolling the dashboard past the map
        // doesn't hijack the page.
        scrollWheelZoom: false,
        zoomSnap: 0.25,
      }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      instanceRef.current = mapInstance
      leafletRef.current = L
      mapInstance.on('click', () => mapInstance.scrollWheelZoom.enable())
      mapInstance.on('mouseout', () => mapInstance.scrollWheelZoom.disable())

      // ── Clinic markers (above the shading) ─────────────────────────────
      const clinicIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#c69849;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
        iconSize:   [14, 14],
        iconAnchor: [7, 7],
      })
      for (const c of CLINICS) {
        L.marker([c.lat, c.lng], { icon: clinicIcon, zIndexOffset: 1000 })
          .addTo(mapInstance)
          .bindTooltip(`<strong>${escapeHtml(c.name)}</strong><br/>Clinic location`, { direction: 'top', offset: [0, -8] })
      }

      const data = await loadGeoJSON()
      if (cancelled) return
      setGeojson(data)
      setStatus(data ? 'ready' : 'no-outline')
      setTimeout(() => mapInstance?.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      if (mapInstance) mapInstance.remove()
      instanceRef.current = null
      geoLayerRef.current = null
    }
  }, [])

  // Keep Leaflet's size in step with the card (sidebar toggles, window resizes).
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => instanceRef.current?.invalidateSize())
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback((mode: 'busiest' | 'all', p: AreaPick | null) => {
    const map = instanceRef.current
    if (!map) return
    const target: LatLngBoundsTuple | null =
      p == null ? null
        : mode === 'busiest' && p.mode === 'cluster' ? p.bounds
        : p.allBounds
    if (target) map.fitBounds(target, FIT_OPTS)
    else map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
  }, [])

  // ── Shading, redrawn whenever the counts change ───────────────────────────
  // Keyed on the figures rather than the array, so the 90-second refresh on the
  // dashboard doesn't yank the view back while someone is panning around.
  const citiesKey = cities.map((c) => `${c.name}\u0000${c.count}`).join('\u0001')

  useEffect(() => {
    const L = leafletRef.current
    const map = instanceRef.current
    if (!L || !map || !geojson) return

    // Build count lookup — keep "CITY" in keys so "Quezon City" ≠ "Quezon"
    const countMap: Record<string, { name: string; n: number }> = {}
    for (const c of cities) {
      const key = normName(c.name)
      if (!key) continue
      if (!countMap[key]) countMap[key] = { name: c.name, n: 0 }
      countMap[key].n += c.count
    }
    const max = Math.max(1, ...Object.values(countMap).map(c => c.n))

    // Look up a GeoJSON feature in countMap.
    // For features whose name contains "CITY" (e.g. "Marikina City"), combine:
    //   • strict match (patients who wrote "Marikina City")
    //   • loose match (patients who wrote just "Marikina")
    // For features WITHOUT "CITY" (e.g. municipality "Quezon"), only exact match —
    // this prevents Quezon City patient data from bleeding into Quezon Province.
    function lookupCount(featureName: string): { n: number; label: string } | null {
      const strict = normName(featureName)
      const loose  = stripCityWord(strict)
      if (strict === loose) {
        const c = countMap[strict]
        return c ? { n: c.n, label: c.name } : null
      }
      const nStrict = countMap[strict]?.n ?? 0
      const nLoose  = countMap[loose]?.n  ?? 0
      const total   = nStrict + nLoose
      return total ? { n: total, label: countMap[strict]?.name ?? countMap[loose]?.name ?? featureName } : null
    }

    // Build a set of province names so we can skip features that are named after
    // a province — patients who write just "Rizal" mean the province, not the
    // Rizal municipality in Laguna (or 6 other Rizal municipalities nationwide).
    const provinceNames = new Set<string>(
      geojson.features.map((f: any) => normName(f.properties?.province ?? ''))
    )

    // Region priority: prefer features geographically near our Metro Manila clinics.
    // When the same city name appears in multiple regions, only shade the best-ranked one.
    // Strings match the region names baked into public/ph.geojson (PSGC adm1_en,
    // sourced from faeldon/philippines-json-maps) — keep in sync if that source
    // file is ever regenerated from a differently-worded dataset.
    const REGION_PRI: Record<string, number> = {
      'National Capital Region (NCR)':      0,
      'Region IV-A (CALABARZON)':           1,
      'Region III (Central Luzon)':         2,
      'MIMAROPA Region':                    3,
      'Region I (Ilocos Region)':           10,
    }
    // Keyed on the LOOSE (CITY-stripped) name, not the raw feature name —
    // "San Juan City" (NCR) and "San Juan" (a rural municipality elsewhere)
    // both draw from the same countMap bucket via lookupCount()'s loose
    // match, so they must compete for the SAME bestRegion slot or both get
    // shaded independently and the rural one can win the tooltip/fill by
    // iteration order regardless of region priority.
    const bestRegion: Record<string, string> = {}
    for (const feat of geojson.features) {
      const props    = feat.properties ?? {}
      const name     = geoName(props)
      const key      = normName(name)
      const dedupKey = stripCityWord(key)
      const region   = props.region ?? ''
      if (!key || provinceNames.has(key)) continue
      if (lookupCount(name) === null) continue
      const existing = bestRegion[dedupKey]
      if (!existing || (REGION_PRI[region] ?? 99) < (REGION_PRI[existing] ?? 99)) {
        bestRegion[dedupKey] = region
      }
    }

    /** The count a feature is shaded with, or null when it stays blank. */
    function activeCount(props: Record<string, any>): { n: number; label: string } | null {
      const name     = geoName(props)
      const key      = normName(name)
      const dedupKey = stripCityWord(key)
      const region   = props.region ?? ''
      // Skip features named after a province (ambiguous patient data)
      if (provinceNames.has(key)) return null
      const c = lookupCount(name)
      if (!c) return null
      // Skip lower-priority duplicates (e.g. "San Mateo" in Isabela when
      // the same name exists in Rizal Province, which is closer to the clinic;
      // dedupKey, not key, so "San Juan"/"San Juan City" compete correctly)
      if (bestRegion[dedupKey] && bestRegion[dedupKey] !== region) return null
      return c
    }

    // Land with no patients is drawn solid and pale so the coastline still reads
    // against the water-coloured background once the map is zoomed in.
    const noData = { weight: 0.5, color: '#cfd9d4', fillColor: '#f8faf6', fillOpacity: 1 }

    if (geoLayerRef.current) {
      map.removeLayer(geoLayerRef.current)
      geoLayerRef.current = null
    }

    const points: AreaPoint[] = []
    const geoLayer = L.geoJSON(geojson as any, {
      style: (feature: any) => {
        const c = activeCount(feature?.properties ?? {})
        if (!c) return noData
        return {
          weight:      0.8,
          color:       '#ffffff',
          fillColor:   colorFor(c.n, max),
          fillOpacity: 0.92,
        }
      },
      onEachFeature: (feature: any, layer: any) => {
        const props = feature?.properties ?? {}
        const name  = geoName(props)
        const c     = activeCount(props)
        layer.bindTooltip(
          c
            ? `<strong>${escapeHtml(name)}</strong><br/>${c.n.toLocaleString()} patient${c.n !== 1 ? 's' : ''}`
            : `<strong>${escapeHtml(name)}</strong><br/><span style="color:#7a9e94">No patients</span>`,
          { sticky: true, direction: 'top', offset: [0, -6] }
        )
        if (c) {
          try {
            const b = layer.getBounds()
            const centre = b.getCenter()
            points.push({
              lat: centre.lat,
              lng: centre.lng,
              count: c.n,
              bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]],
              region: props.region ?? undefined,
            })
          } catch { /* degenerate geometry — still shaded, just not used for the view */ }
          layer.on('mouseover', () => {
            layer.setStyle({ weight: 2, color: '#244952' })
            layer.bringToFront()
          })
          layer.on('mouseout', () => geoLayer.resetStyle(layer))
        }
      },
    }).addTo(map)
    geoLayerRef.current = geoLayer

    const p = pickBusiestArea(points)
    setPick(p)
    setLegend(legendBuckets(max))
    setView('busiest')
    fit('busiest', p)
  }, [geojson, citiesKey, fit]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(mode: 'busiest' | 'all') {
    setView(mode)
    fit(mode, pick)
  }

  const area = friendlyRegion(pick?.region ?? null)
  const caption =
    !pick || pick.mode === 'none' ? null
      : pick.mode === 'all' ? `Patients are spread out — showing every shaded location`
      : view === 'busiest'
        ? `${area ? `${area}${pick.multiRegion ? ' and nearby' : ''}` : 'Busiest area'} · ${pick.clusterTotal.toLocaleString()} of ${pick.total.toLocaleString()} mapped patients`
        : `All locations · ${pick.total.toLocaleString()} mapped patients`

  const btn = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${active ? 'text-white' : 'hover:bg-gray-50'}`

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      {/* `isolate` keeps Leaflet's internal z-indexes (400–1000) from painting
          over the app's dropdowns and sticky header. */}
      <div ref={wrapRef} className="relative isolate w-full h-full">
        <div
          ref={mapRef}
          className="w-full h-full"
          style={{ background: '#e4eef0' }}
          aria-label="Map of patients by city"
        />

        {/* View switch */}
        {pick && pick.mode === 'cluster' && (
          <div
            className="absolute top-3 right-3 z-[1000] flex rounded-lg overflow-hidden shadow-sm"
            style={{ background: '#fff', border: '1px solid var(--light-gray)' }}
            role="group"
            aria-label="Map view"
          >
            <button
              type="button"
              onClick={() => choose('busiest')}
              className={btn(view === 'busiest')}
              style={{ background: view === 'busiest' ? 'var(--teal)' : undefined, color: view === 'busiest' ? '#fff' : 'var(--charcoal)' }}
              aria-pressed={view === 'busiest'}
            >
              <Crosshair size={12} /> Focus on busiest area
            </button>
            <button
              type="button"
              onClick={() => choose('all')}
              className={btn(view === 'all')}
              style={{
                background: view === 'all' ? 'var(--teal)' : undefined,
                color: view === 'all' ? '#fff' : 'var(--charcoal)',
                borderLeft: '1px solid var(--light-gray)',
              }}
              aria-pressed={view === 'all'}
            >
              <Maximize2 size={12} /> Show all locations
            </button>
          </div>
        )}

        {/* Legend */}
        {status === 'ready' && pick && pick.mode !== 'none' && (
          <div
            className="absolute bottom-3 left-3 z-[1000] rounded-lg px-3 py-2.5 shadow-sm max-w-[calc(100%-24px)]"
            style={{ background: 'rgba(255,255,255,0.96)', border: '1px solid var(--light-gray)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--mid-gray)' }}>
              Patients per city
            </p>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              {legend.map((b) => (
                <span key={b.color} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--charcoal)', fontVariantNumeric: 'tabular-nums' }}>
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: b.color }} />
                  {b.lo === b.hi ? b.lo.toLocaleString() : `${b.lo.toLocaleString()}–${b.hi.toLocaleString()}`}
                </span>
              ))}
              <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--charcoal)' }}>
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#c69849', border: '2px solid #fff', boxShadow: '0 0 0 1px #c69849' }} />
                Clinic
              </span>
            </div>
            {caption && (
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--mid-gray)' }}>{caption}</p>
            )}
          </div>
        )}

        {/* Loading / failure / nothing-matched states */}
        {status === 'loading' && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center animate-pulse" style={{ background: '#eef3f1' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--mid-gray)' }}>Loading map…</span>
          </div>
        )}
        {status === 'no-outline' && (
          <div className="absolute inset-x-3 top-3 z-[1000] rounded-lg px-3 py-2 text-xs"
            style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
            The map outline couldn&apos;t load, so cities can&apos;t be shaded. Refresh the page to try again.
          </div>
        )}
        {status === 'ready' && pick?.mode === 'none' && (
          <div className="absolute inset-x-3 top-3 z-[1000] rounded-lg px-3 py-2 text-xs"
            style={{ background: '#fff', border: '1px solid var(--light-gray)', color: 'var(--mid-gray)' }}>
            None of the recorded cities could be matched to the map yet.
          </div>
        )}
      </div>
    </>
  )
}
