// Barangay-level coordinates for Metro Manila + Rizal Province
// Used by PatientMap to plot patient locations at barangay resolution.
// Returns null when a barangay is unknown — the map falls back to city-level coords.

type Coords = [number, number] // [lat, lng]
type BarangayMap = Record<string, Coords>

// ── Pasig ─────────────────────────────────────────────────────────────────────
const PASIG: BarangayMap = {
  'Bagong Ilog': [14.5670, 121.0800], 'Bagong Katipunan': [14.5730, 121.0780],
  'Bambang': [14.5810, 121.0790], 'Buting': [14.5750, 121.0820],
  'Caniogan': [14.5720, 121.0870], 'Dela Paz': [14.5640, 121.0900],
  'Kalawaan': [14.5680, 121.0830], 'Kapasigan': [14.5660, 121.0840],
  'Kapitolyo': [14.5750, 121.0620], 'Malinao': [14.5780, 121.0910],
  'Manggahan': [14.5900, 121.0980], 'Maybunga': [14.5830, 121.0890],
  'Oranbo': [14.5800, 121.0680], 'Palatiw': [14.5840, 121.0840],
  'Pinagbuhatan': [14.5820, 121.0950], 'Pineda': [14.5760, 121.0930],
  'Rosario': [14.5860, 121.0860], 'Sagad': [14.5770, 121.0970],
  'San Antonio': [14.5690, 121.0760], 'San Joaquin': [14.5710, 121.0740],
  'San Jose': [14.5810, 121.0750], 'San Miguel': [14.5620, 121.0870],
  'San Nicolas': [14.5810, 121.0810], 'Santa Cruz': [14.5870, 121.0820],
  'Santa Lucia': [14.5880, 121.0900], 'Santa Rosa': [14.5850, 121.0960],
  'Santo Tomas': [14.5840, 121.0770], 'Santolan': [14.5910, 121.0800],
  'Sumilang': [14.5730, 121.0890], 'Ugong': [14.5700, 121.0700],
  'Wawa': [14.5660, 121.0810],
}

// ── Marikina ──────────────────────────────────────────────────────────────────
const MARIKINA: BarangayMap = {
  'Barangka': [14.6370, 121.1050], 'Calumpang': [14.6500, 121.1140],
  'Concepcion Uno': [14.6550, 121.0950], 'Concepcion Dos': [14.6480, 121.0930],
  'Fortune': [14.6420, 121.1200], 'Industrial Valley': [14.6610, 121.1250],
  'Jesus dela Pena': [14.6310, 121.1010], 'Malanday': [14.6690, 121.1110],
  'Marikina Heights': [14.6260, 121.1240], 'Nangka': [14.6450, 121.1100],
  'Parang': [14.6540, 121.1070], 'San Roque': [14.6350, 121.1090],
  'Santa Elena': [14.6280, 121.1040], 'Santo Nino': [14.6390, 121.1160],
  'Tanong': [14.6330, 121.1270], 'Tumana': [14.6590, 121.1050],
}

// ── San Juan ──────────────────────────────────────────────────────────────────
const SAN_JUAN: BarangayMap = {
  'Addition Hills': [14.5980, 121.0420], 'Balong Bato': [14.6080, 121.0290],
  'Batis': [14.6060, 121.0340], 'Corazon de Jesus': [14.6070, 121.0370],
  'Ermitaño': [14.6110, 121.0310], 'Greenhills': [14.6010, 121.0490],
  'Halo-halo': [14.6120, 121.0350], 'Isabelita': [14.6090, 121.0390],
  'Kabayanan': [14.5970, 121.0340], 'Little Baguio': [14.6020, 121.0330],
  'Maytunas': [14.6100, 121.0410], 'Onse': [14.6030, 121.0360],
  'Pasadena': [14.6050, 121.0460], 'Pedro Cruz': [14.5990, 121.0360],
  'Progreso': [14.6000, 121.0310], 'Rivera': [14.6050, 121.0380],
  'Salapan': [14.6020, 121.0430], 'San Perfecto': [14.5960, 121.0310],
  'Santa Lucia': [14.6040, 121.0400], 'Tibagan': [14.6080, 121.0450],
  'West Crame': [14.5950, 121.0440],
}

// ── Mandaluyong ───────────────────────────────────────────────────────────────
const MANDALUYONG: BarangayMap = {
  'Addition Hills': [14.5840, 121.0390], 'Bagong Silang': [14.5890, 121.0430],
  'Barangka Drive': [14.5810, 121.0340], 'Buayang Bato': [14.5800, 121.0400],
  'Daang Bakal': [14.5850, 121.0370], 'Hagdang Bato Itaas': [14.5820, 121.0410],
  'Hagdang Bato Libis': [14.5830, 121.0420], 'Harapin ang Bukas': [14.5870, 121.0400],
  'Highway Hills': [14.5860, 121.0450], 'Hulo': [14.5780, 121.0360],
  'Mabini-J. Rizal': [14.5900, 121.0380], 'Malamig': [14.5810, 121.0380],
  'Mauway': [14.5760, 121.0340], 'Namfrel': [14.5870, 121.0440],
  'New Zaniga': [14.5760, 121.0360], 'Old Zaniga': [14.5750, 121.0350],
  'Pag-Asa': [14.5900, 121.0410], 'Plainview': [14.5870, 121.0470],
  'Pleasant Hills': [14.5820, 121.0460], 'Poblacion': [14.5800, 121.0320],
  'San Joaquin': [14.5840, 121.0350], 'Vergara': [14.5790, 121.0430],
  'Wack-Wack Greenhills': [14.5870, 121.0460],
}

// ── Quezon City ───────────────────────────────────────────────────────────────
const QUEZON_CITY: BarangayMap = {
  'Bagumbayan': [14.6640, 121.0810], 'Batasan Hills': [14.6990, 121.1000],
  'Botocan': [14.6620, 121.0400], 'Commonwealth': [14.7040, 121.0940],
  'Culiat': [14.6980, 121.0600], 'Diliman': [14.6560, 121.0680],
  'Fairview': [14.7400, 121.0560], 'Holy Spirit': [14.7060, 121.0820],
  'Kamuning': [14.6390, 121.0430], 'Katipunan': [14.6400, 121.0760],
  'Kristong Hari': [14.6540, 121.0540], 'Krus na Ligas': [14.6500, 121.0640],
  'Loyola Heights': [14.6430, 121.0750], 'Malaya': [14.6520, 121.0500],
  'Matandang Balara': [14.6650, 121.0870], 'New Era': [14.6980, 121.0700],
  'Novaliches Proper': [14.7200, 121.0300], 'Pansol': [14.6620, 121.0930],
  'Pinagkaisahan': [14.6620, 121.0490], 'Project 4': [14.6410, 121.0700],
  'Project 6': [14.6620, 121.0410], 'Project 7': [14.6610, 121.0360],
  'Project 8': [14.6640, 121.0290], 'Roxas': [14.6590, 121.0400],
  'Sacred Heart': [14.6400, 121.0490], 'San Agustin': [14.6540, 121.0430],
  'San Bartolome': [14.7200, 121.0400], 'San Jose': [14.6600, 121.0470],
  'Sienna': [14.6520, 121.0460], 'South Triangle': [14.6380, 121.0490],
  'Tandang Sora': [14.6880, 121.0560], 'Ugong Norte': [14.6570, 121.0830],
  'UP Campus': [14.6540, 121.0670], 'Vasra': [14.6590, 121.0440],
  'White Plains': [14.6380, 121.0760],
}

// ── Taguig ────────────────────────────────────────────────────────────────────
const TAGUIG: BarangayMap = {
  'Bagumbayan': [14.5310, 121.0490], 'Bambang': [14.5120, 121.0460],
  'Bicutan': [14.4810, 121.0450], 'Binagbag': [14.5190, 121.0430],
  'Calzada': [14.5400, 121.0520], 'Central Bicutan': [14.4850, 121.0420],
  'Cembo': [14.5500, 121.0640], 'Central Signal Village': [14.5190, 121.0530],
  'Fort Bonifacio': [14.5469, 121.0533], 'Hagonoy': [14.5000, 121.0440],
  'Ibayo-Tipas': [14.5470, 121.0710], 'Katuparan': [14.5060, 121.0410],
  'Lower Bicutan': [14.4840, 121.0380], 'Ligid-Tipas': [14.5510, 121.0730],
  'Maharlika Village': [14.5170, 121.0500], 'North Daang Hari': [14.4680, 121.0560],
  'North Signal Village': [14.5200, 121.0570], 'Palingon': [14.5350, 121.0470],
  'Pinagsama': [14.5280, 121.0570], 'San Miguel': [14.5580, 121.0680],
  'Santa Ana': [14.5590, 121.0640], 'South Daang Hari': [14.4630, 121.0530],
  'South Signal Village': [14.5210, 121.0490], 'Tanyag': [14.4990, 121.0480],
  'Tuktukan': [14.5380, 121.0500], 'Upper Bicutan': [14.4890, 121.0400],
  'Ususan': [14.4920, 121.0460], 'Wawa': [14.5590, 121.0600],
  'Western Bicutan': [14.4830, 121.0350],
}

// ── Makati ────────────────────────────────────────────────────────────────────
const MAKATI: BarangayMap = {
  'Bangkal': [14.5490, 121.0150], 'Bel-Air': [14.5650, 121.0260],
  'Carmona': [14.5540, 121.0100], 'Cembo': [14.5670, 121.0580],
  'Comembo': [14.5640, 121.0570], 'Dasmariñas': [14.5590, 121.0240],
  'East Rembo': [14.5620, 121.0540], 'Forbes Park': [14.5600, 121.0310],
  'Guadalupe Nuevo': [14.5600, 121.0460], 'Guadalupe Viejo': [14.5570, 121.0430],
  'Kasilawan': [14.5450, 121.0220], 'La Paz': [14.5510, 121.0280],
  'Palanan': [14.5460, 121.0130], 'Pembo': [14.5680, 121.0540],
  'Pinagkaisahan': [14.5530, 121.0440], 'Pio del Pilar': [14.5480, 121.0190],
  'Pitogo': [14.5700, 121.0530], 'Poblacion': [14.5580, 121.0200],
  'Post Proper Northside': [14.5670, 121.0490], 'Post Proper Southside': [14.5650, 121.0450],
  'Rizal': [14.5560, 121.0370], 'Rockwell': [14.5630, 121.0350],
  'San Antonio': [14.5450, 121.0300], 'San Isidro': [14.5610, 121.0170],
  'San Lorenzo': [14.5620, 121.0280], 'Santa Cruz': [14.5470, 121.0250],
  'Singkamas': [14.5500, 121.0330], 'South Cembo': [14.5680, 121.0550],
  'Tejeros': [14.5510, 121.0400], 'Urdaneta': [14.5640, 121.0300],
  'Valenzuela': [14.5560, 121.0340], 'West Rembo': [14.5600, 121.0520],
}

// ── Antipolo ──────────────────────────────────────────────────────────────────
const ANTIPOLO: BarangayMap = {
  'Bagong Nayon': [14.6000, 121.1900], 'Beverly Hills': [14.5780, 121.1650],
  'Calawis': [14.6300, 121.1980], 'Cupang': [14.5850, 121.1700],
  'Dalig': [14.5810, 121.1830], 'Del Rosario': [14.5900, 121.1800],
  'Inarawan': [14.5950, 121.2100], 'Mambugan': [14.6060, 121.1780],
  'Mayamot': [14.5820, 121.1600], 'Mekiling': [14.6200, 121.1900],
  'Munting Dilaw': [14.5970, 121.1840], 'Sta. Cruz': [14.5990, 121.1760],
  'San Isidro': [14.5870, 121.1750], 'San Jose': [14.5840, 121.1880],
  'San Juan': [14.5920, 121.1820], 'San Luis': [14.5960, 121.1850],
  'San Roque': [14.6090, 121.1810], 'Sto. Cristo': [14.5880, 121.1810],
}

// ── Cainta ────────────────────────────────────────────────────────────────────
const CAINTA: BarangayMap = {
  'Buting': [14.5900, 121.1050], 'Cainta': [14.5800, 121.1240],
  'Dela Paz': [14.5730, 121.1260], 'Karilagan': [14.5830, 121.1310],
  'San Andres': [14.5770, 121.1200], 'San Juan': [14.5850, 121.1180],
  'Santa Rosa': [14.5810, 121.1310],
}

// ── Taytay ────────────────────────────────────────────────────────────────────
const TAYTAY: BarangayMap = {
  'Dolores': [14.5500, 121.1310], 'Lucsuhin': [14.5600, 121.1280],
  'Muzon': [14.5640, 121.1400], 'San Isidro': [14.5580, 121.1490],
  'San Juan': [14.5540, 121.1350], 'Santa Ana': [14.5580, 121.1420],
}

// ── Parañaque ─────────────────────────────────────────────────────────────────
const PARANAQUE: BarangayMap = {
  'Baclaran': [14.5200, 121.0000], 'BF Homes': [14.4920, 121.0110],
  'Don Bosco': [14.4740, 121.0060], 'Don Galo': [14.5000, 121.0010],
  'La Huerta': [14.5060, 121.0030], 'Marcelo Green': [14.4890, 121.0190],
  'Merville': [14.5060, 121.0100], 'Moonwalk': [14.4960, 121.0210],
  'San Antonio': [14.4820, 121.0010], 'San Dionisio': [14.4750, 120.9990],
  'San Isidro': [14.5170, 121.0060], 'San Martin de Porres': [14.5130, 121.0100],
  'Santo Nino': [14.5040, 121.0180], 'Sun Valley': [14.4830, 121.0050],
  'Tambo': [14.5060, 121.0240],
}

// ── Muntinlupa ────────────────────────────────────────────────────────────────
const MUNTINLUPA: BarangayMap = {
  'Alabang': [14.4190, 121.0370], 'Ayala Alabang': [14.4150, 121.0440],
  'Bayanan': [14.3960, 121.0350], 'Buli': [14.4070, 121.0310],
  'Cupang': [14.4250, 121.0390], 'New Alabang': [14.4160, 121.0500],
  'Putatan': [14.4090, 121.0450], 'Sucat': [14.4600, 121.0320],
  'Tunasan': [14.3980, 121.0460],
}

// ── Las Piñas ─────────────────────────────────────────────────────────────────
const LAS_PINAS: BarangayMap = {
  'Almanza Dos': [14.4480, 120.9880], 'Almanza Uno': [14.4540, 120.9840],
  'BF International': [14.4320, 120.9720], 'Daniel Fajardo': [14.4570, 120.9930],
  'Elias Aldana': [14.4680, 121.0000], 'Ilaya': [14.4600, 120.9960],
  'Manuyo Dos': [14.4420, 120.9790], 'Manuyo Uno': [14.4460, 120.9810],
  'Nueva': [14.4530, 120.9900], 'Pamplona Dos': [14.4690, 120.9980],
  'Pamplona Tres': [14.4640, 120.9870], 'Pamplona Uno': [14.4710, 120.9940],
  'Pilar': [14.4550, 121.0020], 'Pulang Lupa Dos': [14.4340, 120.9760],
  'Pulang Lupa Uno': [14.4380, 120.9780], 'Talon Dos': [14.4480, 120.9960],
  'Talon Tres': [14.4430, 120.9940], 'Talon Uno': [14.4520, 121.0010],
  'Zapote': [14.4620, 121.0030],
}

// ── Pateros ───────────────────────────────────────────────────────────────────
const PATEROS: BarangayMap = {
  'Aguho': [14.5460, 121.0700], 'Alicia': [14.5470, 121.0670],
  'Ambulong': [14.5440, 121.0720], 'Sto. Rosario-Kanluran': [14.5430, 121.0680],
  'Sto. Rosario-Silangan': [14.5440, 121.0700], 'San Pedro': [14.5450, 121.0690],
  'San Roque': [14.5420, 121.0660], 'Tuktukan': [14.5410, 121.0640],
}

// ── Caloocan ──────────────────────────────────────────────────────────────────
const CALOOCAN: BarangayMap = {
  'Bagong Silang': [14.7690, 121.0460], 'Barangka': [14.7200, 120.9780],
  'Camarin': [14.7800, 121.0340], 'Deparo': [14.7640, 121.0480],
  'Grace Park East': [14.7190, 120.9870], 'Grace Park West': [14.7210, 120.9820],
  'Llano': [14.7460, 120.9870], 'Maypajo': [14.7050, 120.9690],
  'Maysilo': [14.7150, 120.9770], 'Novaliches': [14.7200, 121.0300],
  'Sangandaan': [14.7070, 120.9710], 'Tala': [14.7850, 121.0480],
}

// ── Valenzuela ────────────────────────────────────────────────────────────────
const VALENZUELA: BarangayMap = {
  'Arkong Bato': [14.7090, 120.9590], 'Bagbaguin': [14.7070, 120.9660],
  'Balangkas': [14.7140, 120.9580], 'Bignay': [14.7180, 120.9700],
  'Bisig': [14.7100, 120.9650], 'Canumay East': [14.7290, 120.9780],
  'Coloong': [14.6900, 120.9570], 'Dalandanan': [14.7020, 120.9780],
  'Gen. T. de Leon': [14.7080, 120.9700], 'Isla': [14.6960, 120.9560],
  'Karuhatan': [14.7000, 120.9660], 'Lawang Bato': [14.7150, 120.9770],
  'Lingunan': [14.7250, 120.9840], 'Mabolo': [14.6930, 120.9640],
  'Malanday': [14.7320, 120.9870], 'Malinta': [14.7040, 120.9730],
  'Mapulang Lupa': [14.7000, 120.9590], 'Marulas': [14.7060, 120.9610],
  'Maysan': [14.7130, 120.9720], 'Palasan': [14.7200, 120.9760],
  'Parada': [14.7080, 120.9760], 'Pariancillo Villa': [14.7010, 120.9620],
  'Paso de Blas': [14.7130, 120.9640], 'Pasolo': [14.7050, 120.9620],
  'Poblacion': [14.7020, 120.9640], 'Polo': [14.7070, 120.9630],
  'Punturin': [14.7200, 120.9680], 'Rincon': [14.7160, 120.9720],
  'Tagalag': [14.7100, 120.9760], 'Ugong': [14.6980, 120.9780],
  'Viente Reales': [14.7230, 120.9800], 'Wawang Pulo': [14.6910, 120.9570],
}

// ── Malabon ───────────────────────────────────────────────────────────────────
const MALABON: BarangayMap = {
  'Acacia': [14.6590, 120.9600], 'Aguilar': [14.6670, 120.9580],
  'Baritan': [14.6710, 120.9560], 'Bayan-bayanan': [14.6790, 120.9590],
  'Catmon': [14.6820, 120.9560], 'Concepcion': [14.6760, 120.9570],
  'Dampalit': [14.6850, 120.9530], 'Flores': [14.6620, 120.9550],
  'Hulong Duhat': [14.6880, 120.9540], 'Ibaba': [14.6640, 120.9530],
  'Longos': [14.6750, 120.9540], 'Maysilo': [14.6720, 120.9610],
  'Muzon': [14.6800, 120.9500], 'Navotas': [14.6730, 120.9520],
  'Panghulo': [14.6580, 120.9560], 'Potrero': [14.6830, 120.9580],
  'San Agustin': [14.6650, 120.9570], 'San Pedro': [14.6700, 120.9610],
  'Santolan': [14.6690, 120.9590], 'Tinajeros': [14.6760, 120.9530],
  'Tañong': [14.6770, 120.9600], 'Tugatog': [14.6600, 120.9510],
}

// ── Navotas ───────────────────────────────────────────────────────────────────
const NAVOTAS: BarangayMap = {
  'Bagumbayan North': [14.6620, 120.9490], 'Bagumbayan South': [14.6610, 120.9470],
  'Bangculasi': [14.6760, 120.9390], 'Daanghari': [14.6770, 120.9420],
  'Navotas East': [14.6670, 120.9440], 'Navotas West': [14.6650, 120.9430],
  'North Bay Blvd. North': [14.6750, 120.9460], 'North Bay Blvd. South': [14.6740, 120.9450],
  'San Jose': [14.6680, 120.9410], 'San Roque': [14.6700, 120.9430],
  'Sipac-Almacen': [14.6730, 120.9470], 'Tanza': [14.6720, 120.9480],
}

// ── Rodriguez (Montalban) ─────────────────────────────────────────────────────
const RODRIGUEZ: BarangayMap = {
  'Balite': [14.7400, 121.1280], 'Burgos': [14.7470, 121.1300],
  'Geronimo': [14.7520, 121.1180], 'Macabud': [14.7650, 121.1350],
  'Manggahan': [14.7350, 121.1200], 'Mascap': [14.7730, 121.1420],
  'Puray': [14.7580, 121.1490], 'Rosario': [14.7450, 121.1130],
  'San Isidro': [14.7410, 121.1160], 'San Jose': [14.7360, 121.1230],
  'San Rafael': [14.7480, 121.1250], 'San Andres': [14.7560, 121.1260],
}

// ── Manila ────────────────────────────────────────────────────────────────────
const MANILA: BarangayMap = {
  'Binondo': [14.5997, 120.9740], 'Ermita': [14.5787, 120.9847],
  'Intramuros': [14.5896, 120.9755], 'Malate': [14.5686, 120.9912],
  'Paco': [14.5748, 120.9960], 'Pandacan': [14.5882, 121.0060],
  'Port Area': [14.5847, 120.9693], 'Quiapo': [14.5961, 120.9818],
  'Sampaloc': [14.6117, 120.9982], 'San Andres': [14.5814, 121.0050],
  'San Miguel': [14.6000, 120.9823], 'San Nicolas': [14.5997, 120.9699],
  'Santa Ana': [14.5914, 121.0094], 'Santa Cruz': [14.6002, 120.9803],
  'Santa Mesa': [14.6044, 121.0049], 'Tondo': [14.6234, 120.9621],
}

// ── Pasay ─────────────────────────────────────────────────────────────────────
const PASAY: BarangayMap = {
  'Abad Santos': [14.5433, 121.0067], 'Baclaran': [14.5302, 120.9958],
  'Don Bosco': [14.5371, 120.9963], 'Malibay': [14.5449, 121.0042],
  'Maricaban': [14.5507, 121.0070], 'Pasay Proper': [14.5378, 121.0025],
  'San Jose': [14.5415, 121.0056], 'Villamor': [14.5076, 121.0155],
  'Wack-Wack': [14.5490, 121.0087],
}

// ── San Mateo ─────────────────────────────────────────────────────────────────
const SAN_MATEO: BarangayMap = {
  'Ampid I': [14.6870, 121.1200], 'Ampid II': [14.6880, 121.1230],
  'Banaba': [14.7010, 121.1290], 'Guitnangbayan I': [14.6950, 121.1260],
  'Guitnangbayan II': [14.6970, 121.1280], 'Mag-Asawang Sapa': [14.7060, 121.1320],
  'Malanday': [14.7100, 121.1180], 'Maly': [14.6990, 121.1180],
  'Pintong Bocaue': [14.7050, 121.1400], 'Sta. Ana': [14.6920, 121.1200],
  'Sta. Clara': [14.6900, 121.1250], 'Sta. Cruz': [14.7020, 121.1350],
  'Sto. Tomas': [14.6940, 121.1310], 'San Pedro': [14.6960, 121.1240],
}

// ── Angono ────────────────────────────────────────────────────────────────────
const ANGONO: BarangayMap = {
  'Bagumbayan': [14.5260, 121.1480], 'Kalayaan': [14.5220, 121.1510],
  'Mahabang Lapi': [14.5190, 121.1570], 'Mambog': [14.5300, 121.1440],
  'Sta. Cruz': [14.5240, 121.1540], 'San Isidro': [14.5280, 121.1520],
  'San Roque': [14.5210, 121.1560], 'San Vicente': [14.5230, 121.1490],
}

// ── Binangonan ────────────────────────────────────────────────────────────────
const BINANGONAN: BarangayMap = {
  'Batingan': [14.4800, 121.2100], 'Bilibli': [14.4730, 121.1990],
  'Ginoong Sanay': [14.4750, 121.2030], 'Layunan': [14.4780, 121.2070],
  'Libid': [14.4820, 121.2140], 'Longos': [14.4710, 121.2010],
  'Lunsad': [14.4850, 121.2170], 'Pag-Asa': [14.4690, 121.1980],
  'Palangoy': [14.4660, 121.1950], 'Pantok': [14.4620, 121.1920],
  'Poblacion': [14.4640, 121.1960], 'San Carlos': [14.4860, 121.2190],
  'San Isidro': [14.4880, 121.2210], 'Sapandpalay': [14.4770, 121.2050],
}

// ── City → barangay map lookup ────────────────────────────────────────────────
const CITY_BARANGAY_MAP: Record<string, BarangayMap> = {
  'pasig': PASIG, 'pasig city': PASIG,
  'marikina': MARIKINA, 'marikina city': MARIKINA,
  'san juan': SAN_JUAN, 'san juan city': SAN_JUAN,
  'mandaluyong': MANDALUYONG, 'mandaluyong city': MANDALUYONG,
  'quezon city': QUEZON_CITY, 'qc': QUEZON_CITY,
  'taguig': TAGUIG, 'taguig city': TAGUIG, 'fort bonifacio': TAGUIG,
  'makati': MAKATI, 'makati city': MAKATI,
  'antipolo': ANTIPOLO, 'antipolo city': ANTIPOLO,
  'cainta': CAINTA,
  'taytay': TAYTAY,
  'paranaque': PARANAQUE, 'parañaque': PARANAQUE, 'parañaque city': PARANAQUE,
  'muntinlupa': MUNTINLUPA, 'muntinlupa city': MUNTINLUPA,
  'las pinas': LAS_PINAS, 'las piñas': LAS_PINAS, 'las piñas city': LAS_PINAS,
  'pateros': PATEROS,
  'caloocan': CALOOCAN, 'caloocan city': CALOOCAN,
  'valenzuela': VALENZUELA, 'valenzuela city': VALENZUELA,
  'malabon': MALABON, 'malabon city': MALABON,
  'navotas': NAVOTAS, 'navotas city': NAVOTAS,
  'rodriguez': RODRIGUEZ, 'montalban': RODRIGUEZ,
  'manila': MANILA, 'city of manila': MANILA,
  'pasay': PASAY, 'pasay city': PASAY,
  'san mateo': SAN_MATEO,
  'angono': ANGONO,
  'binangonan': BINANGONAN,
}

/**
 * Look up approximate coordinates for a barangay within a city.
 * Returns null if the barangay is unknown — the caller should fall back
 * to city-level coordinates.
 */
export function findBarangayCoords(
  barangay: string | null,
  city: string
): [number, number] | null {
  if (!barangay) return null

  const cityKey = city.trim().toLowerCase()
  const barangayMap = CITY_BARANGAY_MAP[cityKey]
  if (!barangayMap) return null

  const bgName = barangay.trim()
  // Exact match (case-insensitive)
  const exactKey = Object.keys(barangayMap).find(
    (k) => k.toLowerCase() === bgName.toLowerCase()
  )
  if (exactKey) return barangayMap[exactKey]

  // Partial match — barangay name contains or is contained in the key
  const partialKey = Object.keys(barangayMap).find((k) => {
    const kl = k.toLowerCase()
    const bl = bgName.toLowerCase()
    return kl.includes(bl) || bl.includes(kl)
  })
  if (partialKey) return barangayMap[partialKey]

  return null
}
