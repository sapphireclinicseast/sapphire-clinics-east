'use client'

import { useEffect, useRef } from 'react'

interface CityCount      { name: string; count: number }
interface PatientMapProps { cities: CityCount[]; locations?: unknown[] }

const CLINICS = [
  { name: 'East Branch (Pasig)',          lat: 14.5764,   lng: 121.0851   },
  { name: 'Greenhills Branch (San Juan)', lat: 14.601888, lng: 121.049017 },
]

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

function colorFor(n: number, max: number): string {
  if (!n) return '#eef2f5'
  const t = max > 1 ? (n - 1) / (max - 1) : 1
  const stops = ['#cde5dd', '#9ed3c4', '#6cbca8', '#3f9e88', '#2b7d6b', '#1d5e50']
  return stops[Math.min(stops.length - 1, Math.round(t * (stops.length - 1)))]
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
  const mapRef     = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || instanceRef.current) return

    let mapInstance: any

    import('leaflet').then(async (L) => {
      if (!mapRef.current) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      mapInstance = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
        minZoom: 4,
        maxZoom: 12,
      }).setView([12.8, 121.8], 6)
      instanceRef.current = mapInstance

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

      // ── GeoJSON choropleth ────────────────────────────────────────────────
      const geojson = await loadGeoJSON()

      if (geojson) {
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
        const bestRegion: Record<string, string> = {}
        for (const feat of geojson.features) {
          const props  = feat.properties ?? {}
          const name   = geoName(props)
          const key    = normName(name)
          const region = props.region ?? ''
          if (!key || provinceNames.has(key)) continue
          if (lookupCount(name) === null) continue
          const existing = bestRegion[key]
          if (!existing || (REGION_PRI[region] ?? 99) < (REGION_PRI[existing] ?? 99)) {
            bestRegion[key] = region
          }
        }

        const noData = { weight: 0.4, color: '#94a3b8', fillColor: '#eef2f5', fillOpacity: 0.25 }

        const geoLayer = L.geoJSON(geojson as any, {
          style: (feature: any) => {
            const props = feature?.properties ?? {}
            const name  = geoName(props)
            const key   = normName(name)
            // Skip features named after a province (ambiguous patient data)
            if (provinceNames.has(key)) return noData
            const c = lookupCount(name)
            if (!c) return noData
            // Skip lower-priority duplicates (e.g. "San Mateo" in Isabela when
            // the same name exists in Rizal Province, which is closer to the clinic)
            const region = props.region ?? ''
            if (bestRegion[key] && bestRegion[key] !== region) return noData
            return {
              weight:      0.4,
              color:       '#94a3b8',
              fillColor:   colorFor(c.n, max),
              fillOpacity: 0.85,
            }
          },
          onEachFeature: (feature: any, layer: any) => {
            const props  = feature?.properties ?? {}
            const name   = geoName(props)
            const key    = normName(name)
            const region = props.region ?? ''
            const active = !provinceNames.has(key)
                        && !!lookupCount(name)
                        && (!bestRegion[key] || bestRegion[key] === region)
            const c = active ? lookupCount(name) : null
            layer.bindTooltip(
              `${name}: ${c ? `${c.n} patient${c.n !== 1 ? 's' : ''}` : '0 patients'}`,
              { sticky: true }
            )
          },
        }).addTo(mapInstance)

        try { mapInstance.fitBounds(geoLayer.getBounds(), { padding: [10, 10] }) } catch {}
      }

      // ── Clinic markers ───────────────────────────────────────────────────
      const clinicIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#c69849;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize:   [14, 14],
        iconAnchor: [7, 7],
      })
      for (const c of CLINICS) {
        L.marker([c.lat, c.lng], { icon: clinicIcon })
          .addTo(mapInstance)
          .bindPopup(`<b>📍 ${c.name}</b>`)
      }

      // ── Legend ───────────────────────────────────────────────────────────
      const LegendControl = (L.Control as any).extend({
        onAdd() {
          const div = L.DomUtil.create('div')
          div.style.cssText =
            'background:#fff;padding:10px 14px;border-radius:8px;font-size:11px;' +
            'color:#374151;box-shadow:0 1px 6px rgba(0,0,0,0.18);line-height:1.8;min-width:130px;'
          div.innerHTML = `
            <div style="font-weight:700;margin-bottom:6px;color:#1d5e50;font-size:12px;">Patients per City</div>
            <div style="width:102px;height:12px;border-radius:4px;
              background:linear-gradient(to right,#cde5dd,#9ed3c4,#6cbca8,#3f9e88,#2b7d6b,#1d5e50);margin-bottom:2px;"></div>
            <div style="display:flex;justify-content:space-between;width:102px;color:#9ca3af;font-size:10px;">
              <span>Fewer</span><span>More</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
              <div style="width:11px;height:11px;border-radius:50%;background:#c69849;flex-shrink:0;"></div>
              <span>Clinic location</span>
            </div>
          `
          return div
        },
      })
      new LegendControl({ position: 'bottomright' }).addTo(mapInstance)

      setTimeout(() => mapInstance?.invalidateSize(), 100)
    })

    return () => {
      if (mapInstance) {
        mapInstance.remove()
        instanceRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (instanceRef.current) instanceRef.current.invalidateSize()
  }, [cities])

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 480, borderRadius: 12 }} />
    </>
  )
}
