'use client'

import { useEffect, useRef } from 'react'
import { findBarangayCoords } from '@/data/barangay-coords'

// City → approximate coordinates (Metro Manila + Rizal)
const CITY_COORDS: Record<string, [number, number]> = {
  'Manila': [14.5995, 120.9842],
  'Quezon City': [14.6760, 121.0437],
  'QC': [14.6760, 121.0437],
  'Marikina': [14.6395, 121.1050],
  'Marikina City': [14.6395, 121.1050],
  'Pasig': [14.5764, 121.0851],
  'Pasig City': [14.5764, 121.0851],
  'Taguig': [14.5243, 121.0792],
  'Taguig City': [14.5243, 121.0792],
  'Makati': [14.5547, 121.0244],
  'Makati City': [14.5547, 121.0244],
  'Mandaluyong': [14.5794, 121.0359],
  'Mandaluyong City': [14.5794, 121.0359],
  'San Juan': [14.6019, 121.0375],
  'San Juan City': [14.6019, 121.0375],
  'Pasay': [14.5378, 121.0014],
  'Las Pinas': [14.4493, 120.9833],
  'Las Piñas': [14.4493, 120.9833],
  'Caloocan': [14.7492, 120.9677],
  'Valenzuela': [14.7003, 120.9670],
  'Malabon': [14.6677, 120.9571],
  'Navotas': [14.6674, 120.9427],
  'Muntinlupa': [14.4081, 121.0415],
  'Paranaque': [14.4793, 121.0198],
  'Parañaque': [14.4793, 121.0198],
  'Pateros': [14.5453, 121.0686],
  'Antipolo': [14.5864, 121.1760],
  'Antipolo City': [14.5864, 121.1760],
  'Cainta': [14.5783, 121.1236],
  'Taytay': [14.5578, 121.1330],
  'San Mateo': [14.6983, 121.1225],
  'Rodriguez': [14.7443, 121.1148],
  'Montalban': [14.7443, 121.1148],
  'Binangonan': [14.4640, 121.1970],
  'Angono': [14.5242, 121.1540],
  'Baras': [14.5040, 121.2550],
  'Cardona': [14.4980, 121.2340],
  'Pililla': [14.4840, 121.3050],
  'Tanay': [14.4983, 121.2880],
}

function findCityCoords(cityName: string): [number, number] | null {
  const key = Object.keys(CITY_COORDS).find(
    (k) => k.toLowerCase() === cityName.toLowerCase()
  )
  return key ? CITY_COORDS[key] : null
}

interface CityCount {
  name: string
  count: number
}

interface LocationPoint {
  barangay: string | null
  city: string
  count: number
}

interface PatientMapProps {
  cities: CityCount[]
  locations?: LocationPoint[]
}

const CLINICS = [
  { name: 'East Branch (Pasig)', lat: 14.5764, lng: 121.0851 },
  { name: 'Greenhills Branch (San Juan)', lat: 14.601888, lng: 121.049017 },
]

export default function PatientMap({ cities, locations }: PatientMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current) return
    if (leafletRef.current) return

    let mapInstance: any

    import('leaflet').then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      mapInstance = L.map(mapRef.current!, {
        center: [14.600, 121.050],
        zoom: 11,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(mapInstance)

      const hasLocations = locations && locations.length > 0

      if (hasLocations) {
        const maxCount = Math.max(...locations!.map((l) => l.count), 1)
        for (const loc of locations!) {
          let coords: [number, number] | null = findBarangayCoords(loc.barangay, loc.city)
          const isBarangay = !!coords
          if (!coords) coords = findCityCoords(loc.city)
          if (!coords) continue

          const radius = isBarangay
            ? 200 + (loc.count / maxCount) * 800
            : 400 + (loc.count / maxCount) * 2600

          const label = loc.barangay
            ? `<b>${loc.barangay}</b><br/><span style="color:#666">${loc.city}</span>`
            : `<b>${loc.city}</b>`

          L.circle(coords, {
            color: isBarangay ? '#1A7B8A' : '#2AAABB',
            fillColor: isBarangay ? '#2AAABB' : '#4FC3D4',
            fillOpacity: isBarangay ? 0.55 : 0.30,
            weight: isBarangay ? 1.5 : 1,
            radius,
          })
            .addTo(mapInstance)
            .bindPopup(`${label}<br/>${loc.count} patient${loc.count !== 1 ? 's' : ''}`)
        }
      } else {
        const maxCount = Math.max(...cities.map((c) => c.count), 1)
        for (const city of cities) {
          const coords = findCityCoords(city.name)
          if (!coords) continue
          const radius = 400 + (city.count / maxCount) * 2600
          L.circle(coords, {
            color: '#1A7B8A',
            fillColor: '#2AAABB',
            fillOpacity: 0.45,
            weight: 1.5,
            radius,
          })
            .addTo(mapInstance)
            .bindPopup(`<b>${city.name}</b><br/>${city.count} patient${city.count !== 1 ? 's' : ''}`)
        }
      }

      const clinicIcon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#C9A227;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })

      for (const clinic of CLINICS) {
        L.marker([clinic.lat, clinic.lng], { icon: clinicIcon })
          .addTo(mapInstance)
          .bindPopup(`<b>📍 ${clinic.name}</b>`)
      }

      leafletRef.current = mapInstance
    })

    return () => {
      if (mapInstance) {
        mapInstance.remove()
        leafletRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!leafletRef.current) return
    leafletRef.current.invalidateSize()
  }, [cities, locations])

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 360, borderRadius: 12 }} />
    </>
  )
}
