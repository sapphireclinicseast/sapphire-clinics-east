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

function normCity(s: string): string {
  return s.toUpperCase()
    .replace(/CITY OF/g, ' ').replace(/\bCITY\b/g, ' ')
    .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
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

      // Build count lookup
      const countMap: Record<string, { name: string; n: number }> = {}
      for (const c of cities) {
        const key = normCity(c.name)
        if (!key) continue
        countMap[key] = (countMap[key] ?? { name: c.name, n: 0 })
        countMap[key].n += c.count
      }
      const max = Math.max(1, ...Object.values(countMap).map(c => c.n))

      // ── GeoJSON choropleth ────────────────────────────────────────────────
      const geojson = await loadGeoJSON()

      if (geojson) {
        const geoLayer = L.geoJSON(geojson as any, {
          style: (feature: any) => {
            const key = normCity(geoName(feature?.properties ?? {}))
            const c = countMap[key]
            return {
              weight:      0.4,
              color:       '#94a3b8',
              fillColor:   colorFor(c ? c.n : 0, max),
              fillOpacity: c ? 0.85 : 0.25,
            }
          },
          onEachFeature: (feature: any, layer: any) => {
            const name = geoName(feature?.properties ?? {})
            const c    = countMap[normCity(name)]
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
