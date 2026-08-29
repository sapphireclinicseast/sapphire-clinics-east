// Philippine schools known to offer Physical Therapy / allied-health degrees.
// Used as a typeahead in provider verification — the provider can still type a
// school not on this list (free-text fallback).

export const PH_PT_SCHOOLS: string[] = [
  'University of Santo Tomas (UST)',
  'University of the Philippines Manila (UP Manila)',
  'De La Salle Medical and Health Sciences Institute (DLSMHSI)',
  'Emilio Aguinaldo College (EAC) — Manila',
  'Emilio Aguinaldo College (EAC) — Cavite',
  'Our Lady of Fatima University (OLFU)',
  'University of Perpetual Help System DALTA',
  'University of Perpetual Help System JONELTA',
  'Manila Central University (MCU)',
  'Centro Escolar University (CEU)',
  'Trinity University of Asia',
  'Lyceum of the Philippines University',
  'FEU Institute of Health Sciences (Far Eastern University)',
  'Adventist University of the Philippines (AUP)',
  'Saint Louis University (SLU) — Baguio',
  'University of Baguio',
  'Angeles University Foundation (AUF)',
  'Holy Angel University',
  'Wesleyan University-Philippines',
  'Velez College — Cebu',
  "Cebu Doctors' University",
  'Southwestern University PHINMA — Cebu',
  'University of the Visayas — Cebu',
  'University of San Carlos — Cebu',
  'Silliman University — Dumaguete',
  'West Visayas State University',
  "Iloilo Doctors' College",
  'Central Philippine University',
  'Riverside College — Bacolod',
  'University of St. La Salle — Bacolod',
  'San Pedro College — Davao',
  'Davao Doctors College',
  'Brokenshire College — Davao',
  'Ateneo de Zamboanga University',
  'Mindanao State University (MSU)',
  'Notre Dame of Dadiangas University',
  'St. Paul University Philippines',
  'Cagayan State University',
  'University of Baguio',
  'Benguet State University',
  'Bicol University',
  'Ateneo de Naga University',
  'Southwestern University',
  'Metro Manila College',
  'Global Reciprocal Colleges',
  'De Los Santos–STI College',
  'Manila Doctors College',
  'Perpetual Help College of Manila',
  'St. Dominic College of Asia',
  'University of the Immaculate Conception — Davao',
  'Liceo de Cagayan University',
]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

export function searchSchools(q: string, limit = 8): string[] {
  const n = norm(q)
  if (!n) return []
  const starts: string[] = [], contains: string[] = []
  for (const s of PH_PT_SCHOOLS) {
    const v = norm(s)
    if (v.startsWith(n)) starts.push(s)
    else if (v.includes(n)) contains.push(s)
  }
  // de-dupe (a couple of names repeat intentionally in the source list)
  return [...new Set([...starts, ...contains])].slice(0, limit)
}
