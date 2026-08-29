// Philippine cities & municipalities → province, region, representative ZIP.
// Used by the provider dashboard's city-coverage typeahead: the provider types
// a city, picks from the dropdown, and province/region/ZIP auto-fill.
//
// Coverage is the realistic homecare launch set: all of Metro Manila plus the
// provincial capitals, highly-urbanised cities, and the major Metro-adjacent
// municipalities. ZIP is the city's standard PHLPost code (a representative
// value — larger cities have several). Free-text entry still works for any LGU
// not listed here.

export interface PhLocation { city: string; province: string; region: string; zip: string }

// [city, province, region, zip]
const RAW: [string, string, string, string][] = [
  // ── NCR (Metro Manila) ──
  ['Manila', 'Metro Manila', 'NCR', '1000'],
  ['Quezon City', 'Metro Manila', 'NCR', '1100'],
  ['Makati', 'Metro Manila', 'NCR', '1200'],
  ['Pasig', 'Metro Manila', 'NCR', '1600'],
  ['Taguig', 'Metro Manila', 'NCR', '1630'],
  ['Parañaque', 'Metro Manila', 'NCR', '1700'],
  ['Las Piñas', 'Metro Manila', 'NCR', '1740'],
  ['Muntinlupa', 'Metro Manila', 'NCR', '1770'],
  ['Marikina', 'Metro Manila', 'NCR', '1800'],
  ['Pasay', 'Metro Manila', 'NCR', '1300'],
  ['Caloocan', 'Metro Manila', 'NCR', '1400'],
  ['Malabon', 'Metro Manila', 'NCR', '1470'],
  ['Navotas', 'Metro Manila', 'NCR', '1485'],
  ['Valenzuela', 'Metro Manila', 'NCR', '1440'],
  ['Mandaluyong', 'Metro Manila', 'NCR', '1550'],
  ['San Juan', 'Metro Manila', 'NCR', '1500'],
  ['Pateros', 'Metro Manila', 'NCR', '1620'],
  // ── Region III (Central Luzon) ──
  ['City of San Fernando', 'Pampanga', 'Region III (Central Luzon)', '2000'],
  ['Angeles', 'Pampanga', 'Region III (Central Luzon)', '2009'],
  ['Mabalacat', 'Pampanga', 'Region III (Central Luzon)', '2010'],
  ['Malolos', 'Bulacan', 'Region III (Central Luzon)', '3000'],
  ['Meycauayan', 'Bulacan', 'Region III (Central Luzon)', '3020'],
  ['San Jose del Monte', 'Bulacan', 'Region III (Central Luzon)', '3023'],
  ['Baliuag', 'Bulacan', 'Region III (Central Luzon)', '3006'],
  ['Cabanatuan', 'Nueva Ecija', 'Region III (Central Luzon)', '3100'],
  ['Gapan', 'Nueva Ecija', 'Region III (Central Luzon)', '3105'],
  ['Tarlac City', 'Tarlac', 'Region III (Central Luzon)', '2300'],
  ['Olongapo', 'Zambales', 'Region III (Central Luzon)', '2200'],
  ['Balanga', 'Bataan', 'Region III (Central Luzon)', '2100'],
  // ── Region IV-A (CALABARZON) ──
  ['Calamba', 'Laguna', 'Region IV-A (CALABARZON)', '4027'],
  ['Santa Rosa', 'Laguna', 'Region IV-A (CALABARZON)', '4026'],
  ['San Pedro', 'Laguna', 'Region IV-A (CALABARZON)', '4023'],
  ['Biñan', 'Laguna', 'Region IV-A (CALABARZON)', '4024'],
  ['Cabuyao', 'Laguna', 'Region IV-A (CALABARZON)', '4025'],
  ['Los Baños', 'Laguna', 'Region IV-A (CALABARZON)', '4030'],
  ['Antipolo', 'Rizal', 'Region IV-A (CALABARZON)', '1870'],
  ['Cainta', 'Rizal', 'Region IV-A (CALABARZON)', '1900'],
  ['Taytay', 'Rizal', 'Region IV-A (CALABARZON)', '1920'],
  ['Binangonan', 'Rizal', 'Region IV-A (CALABARZON)', '1940'],
  ['Rodriguez', 'Rizal', 'Region IV-A (CALABARZON)', '1860'],
  ['San Mateo', 'Rizal', 'Region IV-A (CALABARZON)', '1850'],
  ['Bacoor', 'Cavite', 'Region IV-A (CALABARZON)', '4102'],
  ['Dasmariñas', 'Cavite', 'Region IV-A (CALABARZON)', '4114'],
  ['Imus', 'Cavite', 'Region IV-A (CALABARZON)', '4103'],
  ['General Trias', 'Cavite', 'Region IV-A (CALABARZON)', '4107'],
  ['Kawit', 'Cavite', 'Region IV-A (CALABARZON)', '4104'],
  ['Silang', 'Cavite', 'Region IV-A (CALABARZON)', '4118'],
  ['Tagaytay', 'Cavite', 'Region IV-A (CALABARZON)', '4120'],
  ['Trece Martires', 'Cavite', 'Region IV-A (CALABARZON)', '4109'],
  ['Lipa', 'Batangas', 'Region IV-A (CALABARZON)', '4217'],
  ['Batangas City', 'Batangas', 'Region IV-A (CALABARZON)', '4200'],
  ['Tanauan', 'Batangas', 'Region IV-A (CALABARZON)', '4232'],
  ['Lucena', 'Quezon', 'Region IV-A (CALABARZON)', '4301'],
  // ── Region IV-B (MIMAROPA) ──
  ['Calapan', 'Oriental Mindoro', 'Region IV-B (MIMAROPA)', '5200'],
  ['Puerto Princesa', 'Palawan', 'Region IV-B (MIMAROPA)', '5300'],
  // ── Region I (Ilocos) ──
  ['Laoag', 'Ilocos Norte', 'Region I (Ilocos Region)', '2900'],
  ['Vigan', 'Ilocos Sur', 'Region I (Ilocos Region)', '2700'],
  ['San Fernando (La Union)', 'La Union', 'Region I (Ilocos Region)', '2500'],
  ['Dagupan', 'Pangasinan', 'Region I (Ilocos Region)', '2400'],
  ['Alaminos', 'Pangasinan', 'Region I (Ilocos Region)', '2404'],
  ['Urdaneta', 'Pangasinan', 'Region I (Ilocos Region)', '2428'],
  // ── CAR ──
  ['Baguio', 'Benguet', 'CAR (Cordillera)', '2600'],
  ['Tabuk', 'Kalinga', 'CAR (Cordillera)', '3800'],
  // ── Region II (Cagayan Valley) ──
  ['Tuguegarao', 'Cagayan', 'Region II (Cagayan Valley)', '3500'],
  ['Ilagan', 'Isabela', 'Region II (Cagayan Valley)', '3300'],
  ['Santiago', 'Isabela', 'Region II (Cagayan Valley)', '3311'],
  // ── Region V (Bicol) ──
  ['Legazpi', 'Albay', 'Region V (Bicol Region)', '4500'],
  ['Naga', 'Camarines Sur', 'Region V (Bicol Region)', '4400'],
  ['Iriga', 'Camarines Sur', 'Region V (Bicol Region)', '4431'],
  ['Sorsogon City', 'Sorsogon', 'Region V (Bicol Region)', '4700'],
  ['Daet', 'Camarines Norte', 'Region V (Bicol Region)', '4600'],
  // ── Region VI (Western Visayas) ──
  ['Iloilo City', 'Iloilo', 'Region VI (Western Visayas)', '5000'],
  ['Bacolod', 'Negros Occidental', 'Region VI (Western Visayas)', '6100'],
  ['Roxas', 'Capiz', 'Region VI (Western Visayas)', '5800'],
  ['Kalibo', 'Aklan', 'Region VI (Western Visayas)', '5600'],
  ['San Jose de Buenavista', 'Antique', 'Region VI (Western Visayas)', '5700'],
  // ── Region VII (Central Visayas) ──
  ['Cebu City', 'Cebu', 'Region VII (Central Visayas)', '6000'],
  ['Mandaue', 'Cebu', 'Region VII (Central Visayas)', '6014'],
  ['Lapu-Lapu', 'Cebu', 'Region VII (Central Visayas)', '6015'],
  ['Talisay (Cebu)', 'Cebu', 'Region VII (Central Visayas)', '6045'],
  ['Tagbilaran', 'Bohol', 'Region VII (Central Visayas)', '6300'],
  ['Dumaguete', 'Negros Oriental', 'Region VII (Central Visayas)', '6200'],
  // ── Region VIII (Eastern Visayas) ──
  ['Tacloban', 'Leyte', 'Region VIII (Eastern Visayas)', '6500'],
  ['Ormoc', 'Leyte', 'Region VIII (Eastern Visayas)', '6541'],
  ['Catbalogan', 'Samar', 'Region VIII (Eastern Visayas)', '6700'],
  ['Maasin', 'Southern Leyte', 'Region VIII (Eastern Visayas)', '6600'],
  // ── Region IX (Zamboanga Peninsula) ──
  ['Zamboanga City', 'Zamboanga del Sur', 'Region IX (Zamboanga Peninsula)', '7000'],
  ['Pagadian', 'Zamboanga del Sur', 'Region IX (Zamboanga Peninsula)', '7016'],
  ['Dipolog', 'Zamboanga del Norte', 'Region IX (Zamboanga Peninsula)', '7100'],
  // ── Region X (Northern Mindanao) ──
  ['Cagayan de Oro', 'Misamis Oriental', 'Region X (Northern Mindanao)', '9000'],
  ['Iligan', 'Lanao del Norte', 'Region X (Northern Mindanao)', '9200'],
  ['Malaybalay', 'Bukidnon', 'Region X (Northern Mindanao)', '8700'],
  ['Valencia (Bukidnon)', 'Bukidnon', 'Region X (Northern Mindanao)', '8709'],
  ['Ozamiz', 'Misamis Occidental', 'Region X (Northern Mindanao)', '7200'],
  // ── Region XI (Davao) ──
  ['Davao City', 'Davao del Sur', 'Region XI (Davao Region)', '8000'],
  ['Tagum', 'Davao del Norte', 'Region XI (Davao Region)', '8100'],
  ['Panabo', 'Davao del Norte', 'Region XI (Davao Region)', '8105'],
  ['Digos', 'Davao del Sur', 'Region XI (Davao Region)', '8002'],
  ['Mati', 'Davao Oriental', 'Region XI (Davao Region)', '8200'],
  // ── Region XII (SOCCSKSARGEN) ──
  ['General Santos', 'South Cotabato', 'Region XII (SOCCSKSARGEN)', '9500'],
  ['Koronadal', 'South Cotabato', 'Region XII (SOCCSKSARGEN)', '9506'],
  ['Kidapawan', 'Cotabato', 'Region XII (SOCCSKSARGEN)', '9400'],
  ['Tacurong', 'Sultan Kudarat', 'Region XII (SOCCSKSARGEN)', '9800'],
  // ── Region XIII (Caraga) ──
  ['Butuan', 'Agusan del Norte', 'Region XIII (Caraga)', '8600'],
  ['Surigao City', 'Surigao del Norte', 'Region XIII (Caraga)', '8400'],
  ['Bayugan', 'Agusan del Sur', 'Region XIII (Caraga)', '8502'],
  // ── BARMM ──
  ['Cotabato City', 'Maguindanao del Norte', 'BARMM', '9600'],
  ['Marawi', 'Lanao del Sur', 'BARMM', '9700'],
]

export const PH_LOCATIONS: PhLocation[] = RAW.map(([city, province, region, zip]) => ({ city, province, region, zip }))

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

// Typeahead search: prefix matches first, then substring, capped.
export function searchLocations(q: string, limit = 8): PhLocation[] {
  const n = norm(q)
  if (!n) return []
  const starts: PhLocation[] = [], contains: PhLocation[] = []
  for (const loc of PH_LOCATIONS) {
    const city = norm(loc.city)
    if (city.startsWith(n)) starts.push(loc)
    else if (city.includes(n) || norm(loc.province).includes(n)) contains.push(loc)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}
