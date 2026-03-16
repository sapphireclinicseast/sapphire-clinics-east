/**
 * Approximate lat/lng coordinates for Metro Manila + Rizal barangays.
 * Keys are lowercase "barangay name, city name" for case-insensitive matching.
 * Used by PatientMap to plot patient density at barangay level.
 */
export const BARANGAY_COORDS: Record<string, [number, number]> = {
  // ─── PASIG CITY ──────────────────────────────────────────────────────────────
  'bagong ilog, pasig': [14.5637, 121.0876],
  'bagong katipunan, pasig': [14.5582, 121.0941],
  'bambang, pasig': [14.5804, 121.0823],
  'buting, pasig': [14.5627, 121.0802],
  'caniogan, pasig': [14.5793, 121.0743],
  'dela paz, pasig': [14.5694, 121.0955],
  'kalawaan, pasig': [14.5749, 121.0699],
  'kapasigan, pasig': [14.5777, 121.0735],
  'karangalan, pasig': [14.5682, 121.0846],
  'ligid tipas, pasig': [14.5476, 121.0851],
  'malinao, pasig': [14.5840, 121.0854],
  'manggahan, pasig': [14.5876, 121.0965],
  'maybunga, pasig': [14.5747, 121.0866],
  'oranbo, pasig': [14.5846, 121.0734],
  'palatiw, pasig': [14.5721, 121.0769],
  'pineda, pasig': [14.5660, 121.0788],
  'rosario, pasig': [14.5824, 121.0789],
  'sagad, pasig': [14.5606, 121.0935],
  'san antonio, pasig': [14.5804, 121.0790],
  'san joaquin, pasig': [14.5760, 121.0809],
  'san jose, pasig': [14.5740, 121.0853],
  'san nicolas, pasig': [14.5718, 121.0850],
  'santa lucia, pasig': [14.5730, 121.0798],
  'sta. lucia, pasig': [14.5730, 121.0798],
  'santa rosa, pasig': [14.5680, 121.0783],
  'sta. rosa, pasig': [14.5680, 121.0783],
  'santo tomas, pasig': [14.5690, 121.0830],
  'sto. tomas, pasig': [14.5690, 121.0830],
  'santolan, pasig': [14.5877, 121.0777],
  'sumilang, pasig': [14.5820, 121.0700],
  'tipas, pasig': [14.5476, 121.0851],
  'ugong, pasig': [14.5780, 121.0625],

  // ─── SAN JUAN CITY ───────────────────────────────────────────────────────────
  'addition hills, san juan': [14.5979, 121.0427],
  'balong bato, san juan': [14.6039, 121.0360],
  'corazon de jesus, san juan': [14.5988, 121.0355],
  'ermitaño, san juan': [14.6052, 121.0326],
  'ermitano, san juan': [14.6052, 121.0326],
  'greenhills, san juan': [14.5997, 121.0411],
  'halo-halo, san juan': [14.6015, 121.0350],
  'isabelita, san juan': [14.6023, 121.0370],
  'kabayanan, san juan': [14.5978, 121.0305],
  'little baguio, san juan': [14.5989, 121.0311],
  'maytunas, san juan': [14.6073, 121.0368],
  'onse, san juan': [14.6049, 121.0383],
  'pasadena, san juan': [14.5945, 121.0326],
  'pedro cruz, san juan': [14.6057, 121.0297],
  'progreso, san juan': [14.6022, 121.0310],
  'rivera, san juan': [14.5983, 121.0281],
  'salapan, san juan': [14.5965, 121.0356],
  'san perfecto, san juan': [14.6001, 121.0329],
  'santa lucia, san juan': [14.5958, 121.0345],
  'sta. lucia, san juan': [14.5958, 121.0345],
  'tibagan, san juan': [14.6022, 121.0304],
  'west crame, san juan': [14.6043, 121.0422],

  // ─── MARIKINA CITY ───────────────────────────────────────────────────────────
  'calumpang, marikina': [14.6342, 121.1036],
  'concepcion uno, marikina': [14.6374, 121.0956],
  'concepcion dos, marikina': [14.6453, 121.0949],
  'fortune, marikina': [14.6500, 121.0993],
  'industrial valley, marikina': [14.6457, 121.0863],
  'jesus dela pena, marikina': [14.6336, 121.0897],
  'kalumpang, marikina': [14.6291, 121.1078],
  'malanday, marikina': [14.6531, 121.1077],
  'marikina heights, marikina': [14.6391, 121.1152],
  'nangka, marikina': [14.6580, 121.1038],
  'parang, marikina': [14.6282, 121.1029],
  'san roque, marikina': [14.6243, 121.1090],
  'sta. elena, marikina': [14.6196, 121.1073],
  'santa elena, marikina': [14.6196, 121.1073],
  'sto. nino, marikina': [14.6449, 121.1023],
  'santo nino, marikina': [14.6449, 121.1023],
  'tanong, marikina': [14.6327, 121.1082],
  'tumana, marikina': [14.6614, 121.1025],

  // ─── MANDALUYONG CITY ────────────────────────────────────────────────────────
  'addition hills, mandaluyong': [14.5838, 121.0355],
  'bagong silang, mandaluyong': [14.5843, 121.0446],
  'barangka drive, mandaluyong': [14.5777, 121.0369],
  'buayang bato, mandaluyong': [14.5802, 121.0490],
  'burol, mandaluyong': [14.5858, 121.0413],
  'daang bakal, mandaluyong': [14.5901, 121.0434],
  'hagdan bato itaas, mandaluyong': [14.5866, 121.0373],
  'hagdan bato libis, mandaluyong': [14.5862, 121.0408],
  'harapin ang bukas, mandaluyong': [14.5883, 121.0417],
  'highway hills, mandaluyong': [14.5868, 121.0417],
  'hulo, mandaluyong': [14.5796, 121.0427],
  'mabini-j. rizal, mandaluyong': [14.5752, 121.0343],
  'malamig, mandaluyong': [14.5799, 121.0393],
  'namayan, mandaluyong': [14.5833, 121.0389],
  'new zaniga, mandaluyong': [14.5847, 121.0376],
  'old zaniga, mandaluyong': [14.5845, 121.0360],
  'pag-asa, mandaluyong': [14.5887, 121.0394],
  'plainview, mandaluyong': [14.5756, 121.0498],
  'pleasant hills, mandaluyong': [14.5868, 121.0456],
  'poblacion, mandaluyong': [14.5782, 121.0402],
  'saint joseph, mandaluyong': [14.5825, 121.0461],
  'vergara, mandaluyong': [14.5895, 121.0463],
  'wack-wack greenhills, mandaluyong': [14.5869, 121.0485],

  // ─── CAINTA, RIZAL ───────────────────────────────────────────────────────────
  'san andres, cainta': [14.5768, 121.1175],
  'san isidro, cainta': [14.5746, 121.1218],
  'santa rosa, cainta': [14.5800, 121.1280],
  'sta. rosa, cainta': [14.5800, 121.1280],
  'sto. domingo, cainta': [14.5807, 121.1214],
  'santo domingo, cainta': [14.5807, 121.1214],

  // ─── TAYTAY, RIZAL ───────────────────────────────────────────────────────────
  'dolores, taytay': [14.5567, 121.1295],
  'muzon, taytay': [14.5621, 121.1367],
  'san isidro, taytay': [14.5632, 121.1431],

  // ─── ANTIPOLO CITY ───────────────────────────────────────────────────────────
  'bagong nayon, antipolo': [14.5884, 121.1605],
  'beverly hills, antipolo': [14.5918, 121.1748],
  'cupang, antipolo': [14.5770, 121.1750],
  'dela paz, antipolo': [14.5849, 121.1600],
  'mambugan, antipolo': [14.5850, 121.1780],
  'mayamot, antipolo': [14.5812, 121.1692],
  'san isidro, antipolo': [14.5860, 121.1780],
  'san jose, antipolo': [14.5818, 121.1754],
  'san roque, antipolo': [14.5805, 121.1732],

  // ─── QUEZON CITY ─────────────────────────────────────────────────────────────
  'bagong pag-asa, quezon city': [14.6654, 121.0218],
  'batasan hills, quezon city': [14.6934, 121.0931],
  'culiat, quezon city': [14.6760, 121.0502],
  'fairview, quezon city': [14.7276, 121.0611],
  'holy spirit, quezon city': [14.6982, 121.0698],
  'kamuning, quezon city': [14.6339, 121.0387],
  'katipunan, quezon city': [14.6534, 121.0785],
  'loyola heights, quezon city': [14.6553, 121.0715],
  'new era, quezon city': [14.6810, 121.0450],
  'novaliches, quezon city': [14.7348, 121.0320],
  'pasong tamo, quezon city': [14.6600, 121.0600],
  'project 4, quezon city': [14.6367, 121.0561],
  'project 6, quezon city': [14.6602, 121.0264],
  'sacred heart, quezon city': [14.6382, 121.0356],
  'san isidro labrador, quezon city': [14.6892, 121.0396],
  'sienna, quezon city': [14.6469, 121.0216],
  'tandang sora, quezon city': [14.6836, 121.0413],
  'teacher\'s village east, quezon city': [14.6553, 121.0574],
  'up campus, quezon city': [14.6547, 121.0674],
  'white plains, quezon city': [14.6459, 121.0641],

  // ─── MAKATI CITY ─────────────────────────────────────────────────────────────
  'bangkal, makati': [14.5499, 121.0148],
  'bel-air, makati': [14.5617, 121.0209],
  'comembo, makati': [14.5544, 121.0292],
  'guadalupe nuevo, makati': [14.5601, 121.0365],
  'guadalupe viejo, makati': [14.5580, 121.0387],
  'pinagkaisahan, makati': [14.5612, 121.0323],
  'poblacion, makati': [14.5627, 121.0244],
  'san antonio, makati': [14.5588, 121.0256],
  'urdaneta, makati': [14.5562, 121.0208],

  // ─── TAGUIG CITY ─────────────────────────────────────────────────────────────
  'bgc, taguig': [14.5518, 121.0483],
  'bonifacio global city, taguig': [14.5518, 121.0483],
  'central bicutan, taguig': [14.5175, 121.0525],
  'fort bonifacio, taguig': [14.5518, 121.0483],
  'lower bicutan, taguig': [14.5197, 121.0498],
  'new lower bicutan, taguig': [14.5215, 121.0462],
  'pinagsama, taguig': [14.5257, 121.0576],
  'upper bicutan, taguig': [14.5283, 121.0566],
  'ususan, taguig': [14.5095, 121.0533],
  'western bicutan, taguig': [14.5195, 121.0488],
}

/**
 * Looks up coordinates for a barangay within a city.
 * Keys are case-insensitive: "barangay, city"
 */
export function findBarangayCoords(
  barangay: string | null,
  city: string | null
): [number, number] | null {
  if (!barangay || !city) return null
  const key = `${barangay.trim()}, ${city.trim()}`.toLowerCase()
  return BARANGAY_COORDS[key] ?? null
}
