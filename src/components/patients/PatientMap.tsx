'use client'

import { useEffect, useRef } from 'react'

interface CityCount       { name: string; count: number }
interface PatientMapProps  { cities: CityCount[]; locations?: unknown[] }

const CLINICS = [
  { name: 'East Branch (Pasig)',          lat: 14.5764,   lng: 121.0851   },
  { name: 'Greenhills Branch (San Juan)', lat: 14.601888, lng: 121.049017 },
]

const NCR_GEOJSON_URL   = 'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/lowres/municities/NCR.0.001.json'
const RIZAL_GEOJSON_URL = 'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/2023/geojson/lowres/municities/RIZAL.0.001.json'

// Module-level cache so repeated renders don't refetch
let _geoCache: any[] | null = null

function lerpColor(a: string, b: string, t: number): string {
  const p = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)]
  const [ar,ag,ab] = p(a), [br,bg,bb] = p(b)
  const h = (n: number) => Math.round(n).toString(16).padStart(2,'0')
  return `#${h(ar+(br-ar)*t)}${h(ag+(bg-ag)*t)}${h(ab+(bb-ab)*t)}`
}

function cityFill(count: number, max: number): string {
  if (!count || !max) return '#d8e5e3'
  const t = Math.min(count / max, 1)
  // Light → mid-teal → dark teal (#244952)
  return t < 0.5
    ? lerpColor('#c8dcd8', '#4a8073', t * 2)
    : lerpColor('#4a8073', '#244952', (t - 0.5) * 2)
}

function normCity(name: string): string {
  return name
    .toLowerCase()
    .replace(/ñ/g, 'n').replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e')
    .replace(/\s+city$/,'').replace(/^city\s+of\s+/,'')
    .replace(/[^a-z\s]/g,'').trim()
}

function featureName(props: Record<string, any>): string {
  return String(
    props.Mun_Name     ??
    props.MUN_NAME     ??
    props.ADM3_EN      ??
    props.NAME_3       ??
    props.mun_city     ??
    props.MUNICITYNAME ??
    props.name         ??
    ''
  )
}

// Fallback city coords when GeoJSON fails to load
const FALLBACK_COORDS: Record<string, [number, number]> = {
  'Manila': [14.5995, 120.9842],
  'Quezon City': [14.6760, 121.0437],
  'QC': [14.6760, 121.0437],
  'Marikina': [14.6395, 121.1050],
  'Pasig': [14.5764, 121.0851],
  'Taguig': [14.5243, 121.0792],
  'Makati': [14.5547, 121.0244],
  'Mandaluyong': [14.5794, 121.0359],
  'San Juan': [14.6019, 121.0375],
  'Pasay': [14.5378, 121.0014],
  'Las Pinas': [14.4493, 120.9833],
  'Caloocan': [14.7492, 120.9677],
  'Valenzuela': [14.7003, 120.9670],
  'Malabon': [14.6677, 120.9571],
  'Navotas': [14.6674, 120.9427],
  'Muntinlupa': [14.4081, 121.0415],
  'Paranaque': [14.4793, 121.0198],
  'Pateros': [14.5453, 121.0686],
  'Antipolo': [14.5864, 121.1760],
  'Cainta': [14.5783, 121.1236],
  'Taytay': [14.5578, 121.1330],
  'San Mateo': [14.6983, 121.1225],
  'Rodriguez': [14.7443, 121.1148],
  'Binangonan': [14.4640, 121.1970],
  'Angono': [14.5242, 121.1540],
}

function findFallbackCoords(name: string): [number, number] | null {
  const k = Object.keys(FALLBACK_COORDS).find(k => normCity(k) === normCity(name))
  return k ? FALLBACK_COORDS[k] : null
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

      mapInstance = L.map(mapRef.current, { center: [14.600, 121.050], zoom: 11, zoomControl: true })
      instanceRef.current = mapInstance

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstance)

      const maxCount = Math.max(...cities.map(c => c.count), 1)

      // Build normalized lookup
      const countMap = new Map<string, { count: number; display: string }>()
      for (const c of cities) {
        countMap.set(normCity(c.name), { count: c.count, display: c.name })
      }

      // ── Try choropleth GeoJSON ────────────────────────────────────────────
      let geoLoaded = false
      try {
        if (!_geoCache) {
          const [r1, r2] = await Promise.all([
            fetch(NCR_GEOJSON_URL),
            fetch(RIZAL_GEOJSON_URL),
          ])
          if (r1.ok && r2.ok) {
            _geoCache = await Promise.all([r1.json(), r2.json()])
          }
        }

        if (_geoCache) {
          for (const geoData of _geoCache) {
            L.geoJSON(geoData, {
              style: (feature: any) => {
                const raw   = featureName(feature?.properties ?? {})
                const entry = countMap.get(normCity(raw))
                return {
                  fillColor:   cityFill(entry?.count ?? 0, maxCount),
                  fillOpacity: entry?.count ? 0.78 : 0.12,
                  color:       '#ffffff',
                  weight:      1.2,
                  opacity:     0.7,
                }
              },
              onEachFeature: (feature: any, layer: any) => {
                const raw   = featureName(feature.properties ?? {})
                const entry = countMap.get(normCity(raw))
                const label = entry?.display ?? raw
                const count = entry?.count ?? 0
                layer.bindPopup(
                  `<b>${label}</b><br/>` +
                  (count ? `${count.toLocaleString()} patient${count !== 1 ? 's' : ''}` : 'No patients on record')
                )
                layer.on('mouseover', function (this: any) {
                  this.setStyle({ fillOpacity: Math.min((entry?.count ? 0.78 : 0.12) + 0.12, 0.95) })
                })
                layer.on('mouseout', function (this: any) {
                  this.setStyle({ fillOpacity: entry?.count ? 0.78 : 0.12 })
                })
              },
            }).addTo(mapInstance)
          }
          geoLoaded = true
        }
      } catch {
        // fall through to bubble fallback
      }

      // ── Bubble fallback when GeoJSON fails ───────────────────────────────
      if (!geoLoaded) {
        for (const city of cities) {
          const coords = findFallbackCoords(city.name)
          if (!coords) continue
          const radius = 400 + (city.count / maxCount) * 2600
          L.circle(coords, {
            color:       '#244952',
            fillColor:   cityFill(city.count, maxCount),
            fillOpacity: 0.65,
            weight:      1.5,
            radius,
          })
            .addTo(mapInstance)
            .bindPopup(`<b>${city.name}</b><br/>${city.count.toLocaleString()} patient${city.count !== 1 ? 's' : ''}`)
        }
      }

      // ── Clinic markers ───────────────────────────────────────────────────
      const clinicIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#c69849;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize:   [18, 18],
        iconAnchor: [9, 9],
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
            <div style="font-weight:700;margin-bottom:6px;color:#244952;font-size:12px;">Patients per City</div>
            <div style="width:102px;height:12px;border-radius:4px;
              background:linear-gradient(to right,#d8e5e3,#c8dcd8,#4a8073,#244952);margin-bottom:2px;"></div>
            <div style="display:flex;justify-content:space-between;width:102px;color:#9ca3af;font-size:10px;">
              <span>Fewer</span><span>More</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:8px;">
              <div style="width:12px;height:12px;border-radius:50%;background:#c69849;flex-shrink:0;"></div>
              <span>Clinic location</span>
            </div>
          `
          return div
        },
      })
      new LegendControl({ position: 'bottomright' }).addTo(mapInstance)
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
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 360, borderRadius: 12 }} />
    </>
  )
}
