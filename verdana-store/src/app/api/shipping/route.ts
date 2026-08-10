import { NextResponse } from 'next/server'
import { calculateShippingFee, getSettings } from '@/lib/settings'

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ph`,
      {
        headers: { 'User-Agent': 'VerdanaStore/1.0 (verdanatrading@gmail.com)' },
      }
    )
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
    }
  } catch (err) {
    console.error('Geocode error:', err)
  }
  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    let { latitude, longitude } = body
    const { city, zipCode, address } = body

    // If coordinates not provided, try to geocode using zip code first (most accurate), then address + city, then just city
    if ((!latitude || !longitude) && (city || zipCode || address)) {
      // Try 1: zip code + Philippines (zip codes are unique globally)
      if (zipCode) {
        const result = await geocode(`${zipCode}, Philippines`)
        if (result) {
          latitude = result.lat
          longitude = result.lon
        }
      }

      // Try 2: full address + city + zip
      if ((!latitude || !longitude) && address && city) {
        const query = [address, city, zipCode, 'Philippines'].filter(Boolean).join(', ')
        const result = await geocode(query)
        if (result) {
          latitude = result.lat
          longitude = result.lon
        }
      }

      // Try 3: city + zip + Philippines
      if ((!latitude || !longitude) && city) {
        const query = [city, zipCode, 'Philippines'].filter(Boolean).join(', ')
        const result = await geocode(query)
        if (result) {
          latitude = result.lat
          longitude = result.lon
        }
      }
    }

    const settings = getSettings()

    if (!latitude || !longitude) {
      // Could not geocode — default to highest tier
      const maxFee = settings.shipping.tiers[settings.shipping.tiers.length - 1]?.fee || 100
      return NextResponse.json({ fee: maxFee, distance: null, error: 'Could not determine location' })
    }

    const fee = calculateShippingFee(latitude, longitude, settings)

    // Also calculate distance for display
    const R = 6371
    const dLat = (latitude - settings.warehouse.latitude) * Math.PI / 180
    const dLon = (longitude - settings.warehouse.longitude) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(settings.warehouse.latitude * Math.PI / 180) *
      Math.cos(latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const distance = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return NextResponse.json({
      fee,
      distance: Math.round(distance * 10) / 10,
      warehouse: settings.warehouse.city || 'Not set',
      coordinates: { lat: latitude, lng: longitude },
    })
  } catch (error) {
    console.error('Shipping calculation error:', error)
    return NextResponse.json({ fee: 100, error: 'Failed to calculate' })
  }
}

export async function GET() {
  const settings = getSettings()
  return NextResponse.json({
    tiers: settings.shipping.tiers,
    warehouse: {
      city: settings.warehouse.city,
      address: settings.warehouse.address,
    },
  })
}
