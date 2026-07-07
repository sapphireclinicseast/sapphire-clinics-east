/**
 * Curated Hokkien/Min Nan Chinese surnames common among Filipino-Chinese (Chinoy).
 * Sources: Philippine Chinese community surname records + Hokkien romanization guides.
 *
 * Detection is exact-token: the last name is split on spaces/hyphens, uppercased,
 * and each token is checked against this set — so "CORPUZ" ≠ "CO", "COBANGBANG" ≠ "CO".
 * Results are labeled "most likely" because surname alone is heuristic, not definitive.
 */
export const CHINOY_SURNAMES: ReadonlySet<string> = new Set([
  // ── Core Hokkien monosyllabic (very high confidence) ────────────────────────
  'TAN',  'LIM',  'UY',   'SY',   'GO',   'CO',   'CHUA', 'ONG',  'SEE',
  'TIU',  'YAP',  'ANG',  'YU',   'DEE',  'DY',   'QUE',  'TEE',  'NG',
  'NGO',  'HO',   'KHO',  'KO',   'KUA',  'LAO',  'LU',   'LUA',  'PUA',
  'SE',   'SIA',  'SO',   'WEE',  'YEE',  'YO',   'BUE',  'GAW',  'TEO',
  'TO',   'TIO',  'LAY',  'TAY',  'SUI',  'FOO',  'PE',   'KIM',  'GAN',
  'TY',   'SUY',  'FU',   'TOH',  'TAI',  'BIO',  'GUE',  'GUI',  'CUE',

  // ── Two-syllable Hokkien surnames (high confidence) ─────────────────────────
  'CHAN',   'CHIONG', 'CHOA',  'CHONG',  'CHIU',  'CHIA',  'CHU',
  'CUA',   'CUAY',   'FONG',  'KIONG',  'KHOO',  'KONG',  'LAM',
  'LEONG', 'LIONG',  'NGAN',  'PHUA',   'SIAW',  'SIOW',  'SIAT',
  'TANG',  'TIONG',  'TIOW',  'TOA',    'TONG',  'TSAI',  'TSENG',
  'TAM',   'YIP',    'YEUNG', 'LEUNG',  'TYE',   'BIONG',

  // ── Longer or compound Chinoy surnames ──────────────────────────────────────
  'COJUANGCO', 'GOKONGWEI',
])

/**
 * Returns true if the given last name is most likely Filipino-Chinese.
 * Splits on spaces/hyphens so compound names like "TAN-SANTOS" also match on "TAN".
 */
export function isLikelyChinoy(lastName: string | null | undefined): boolean {
  if (!lastName) return false
  const tokens = lastName.trim().toUpperCase().split(/[\s-]+/)
  return tokens.some((t) => CHINOY_SURNAMES.has(t))
}
