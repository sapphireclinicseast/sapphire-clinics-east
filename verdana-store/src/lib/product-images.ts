import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_FILE = join(process.cwd(), 'src', 'data', 'product-images.json')

let cachedData: Record<string, string[]> | null = null
let cacheTime = 0

export function getProductImages(slug: string): string[] {
  // Cache for 5 seconds in development
  const now = Date.now()
  if (!cachedData || now - cacheTime > 5000) {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = readFileSync(DATA_FILE, 'utf-8')
        cachedData = JSON.parse(raw)
      } else {
        cachedData = {}
      }
    } catch {
      cachedData = {}
    }
    cacheTime = now
  }

  return cachedData?.[slug] || []
}

export function getAllProductImages(): Record<string, string[]> {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {}
  return {}
}
