import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_FILE = join(process.cwd(), 'src', 'data', 'product-videos.json')

export function getProductVideos(slug: string): string[] {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return data[slug] || []
    }
  } catch {}
  return []
}

export function getAllProductVideos(): Record<string, string[]> {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {}
  return {}
}
