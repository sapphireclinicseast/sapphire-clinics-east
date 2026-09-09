// Teletherapy service catalog for OT & SLP (online booking → PayMongo checkout).
// Prices are the clinic's Fixed rates from the Accounting Hub service list.
// PWD/Senior net = 20% off gross ("Standard (20% total)" PWD rule).
//
// CHECKOUT LINKS: each service type is paid via its own PayMongo checkout link.
// Fill TELE_CHECKOUT below with the link for each `${department}:${id}` key as
// they're created in the PayMongo dashboard. Until a link is set, the option
// shows "Payment link coming soon" and its pay button is disabled.

export type TeleDept = 'OT' | 'SLP'

export interface TeleService {
  id: string
  name: string
  note?: string
  gross: number
}
export interface TeleGroup {
  label: string
  items: TeleService[]
}

// PWD / Senior citizen net price — 20% off gross.
export function pwdNet(gross: number): number {
  return Math.round(gross * 0.8 * 100) / 100
}

const PACKAGES: TeleService[] = [
  { id: 'pkg8', name: '8-Session Package (Teletherapy)', note: '8 sessions', gross: 11880 },
  { id: 'pkg8-spec', name: '8-Session Package — Specialized (Teletherapy)', note: '8 sessions', gross: 14700 },
  { id: 'pkg12', name: '12-Session Package (Teletherapy)', note: '12 sessions', gross: 17550 },
  { id: 'pkg12-spec', name: '12-Session Package — Specialized (Teletherapy)', note: '12 sessions', gross: 21600 },
]

export const TELE_CATALOG: Record<TeleDept, TeleGroup[]> = {
  OT: [
    {
      label: 'Single session',
      items: [
        { id: 'session', name: 'Basic Session (Teletherapy)', gross: 1500 },
        { id: 'session-spec', name: 'Specialized Session (Teletherapy)', gross: 1875 },
      ],
    },
    {
      label: 'Initial evaluation',
      items: [
        { id: 'eval', name: 'Initial Evaluation (Teletherapy)', gross: 2150 },
        { id: 'eval-spec', name: 'Initial Evaluation — Specialized (Teletherapy)', gross: 2400 },
      ],
    },
    { label: 'Packages', items: PACKAGES },
  ],
  SLP: [
    {
      label: 'Single session',
      items: [
        { id: 'session', name: 'Basic Session (Teletherapy)', gross: 1500 },
        { id: 'session-spec', name: 'Specialized Session (Teletherapy)', gross: 1875 },
      ],
    },
    {
      label: 'Initial evaluation',
      items: [
        { id: 'eval', name: 'Initial Evaluation (Teletherapy)', gross: 2250 },
        { id: 'eval-spec', name: 'Initial Evaluation — Specialized (Teletherapy)', gross: 2400 },
      ],
    },
    { label: 'Packages', items: PACKAGES },
  ],
}

export type TeleBranch = 'SBEA' | 'SBGH'

// PayMongo checkout links, keyed by `${branch}:${department}:${serviceId}`.
// Each branch has its OWN PayMongo account, so a service has a distinct link
// per branch (payment settles to that branch's account).
// e.g. TELE_CHECKOUT['SBEA:OT:session'] = 'https://pm.link/…'
export const TELE_CHECKOUT: Record<string, string> = {
  // ── East Branch (SBEA / account AHEA) — verified by /api/public/pay amount, 2026-09-08 ──
  // Occupational Therapy
  'SBEA:OT:session': 'https://accounting.sapphireclinicseast.org/pay/kpF4CKTWG-TU', // ₱1,500
  'SBEA:OT:session-spec': 'https://accounting.sapphireclinicseast.org/pay/V3606TcbA1Yq', // ₱1,875
  'SBEA:OT:eval': 'https://accounting.sapphireclinicseast.org/pay/Gxg_ID2mxSYK', // ₱2,150
  'SBEA:OT:eval-spec': 'https://accounting.sapphireclinicseast.org/pay/4j6oWAQuyC9p', // ₱2,400
  'SBEA:OT:pkg8': 'https://accounting.sapphireclinicseast.org/pay/Ml6vBXdFQogM', // ₱11,880
  'SBEA:OT:pkg8-spec': 'https://accounting.sapphireclinicseast.org/pay/twWYVXsnrDtR', // ₱14,700
  'SBEA:OT:pkg12': 'https://accounting.sapphireclinicseast.org/pay/ioVlOa8ZZNLd', // ₱17,550
  'SBEA:OT:pkg12-spec': 'https://accounting.sapphireclinicseast.org/pay/gtCOH9f3rQlC', // ₱21,600

  // Speech-Language Pathology
  'SBEA:SLP:session': 'https://accounting.sapphireclinicseast.org/pay/bnhCVZJy8Z5G', // ₱1,500
  'SBEA:SLP:session-spec': 'https://accounting.sapphireclinicseast.org/pay/Gbv1-vr181be', // ₱1,875
  'SBEA:SLP:eval': 'https://accounting.sapphireclinicseast.org/pay/aHKVX89z23T-', // ₱2,250
  'SBEA:SLP:eval-spec': 'https://accounting.sapphireclinicseast.org/pay/5noaNqPUFwkP', // ₱2,400
  'SBEA:SLP:pkg8': 'https://accounting.sapphireclinicseast.org/pay/6HOorbZb2FNd', // ₱11,880
  'SBEA:SLP:pkg8-spec': 'https://accounting.sapphireclinicseast.org/pay/Ddlb8BpB7IXg', // ₱14,700
  'SBEA:SLP:pkg12': 'https://accounting.sapphireclinicseast.org/pay/bEo0Cf_iqQ7j', // ₱17,550
  'SBEA:SLP:pkg12-spec': 'https://accounting.sapphireclinicseast.org/pay/tyDgUWhI5V6H', // ₱21,600

  // ── Greenhills Branch (SBGH / account AHGH) — verified by /api/public/pay amount, 2026-09-08 ──
  // Occupational Therapy
  'SBGH:OT:session': 'https://accounting.sapphireclinicseast.org/pay/HIwVW4j8Syor', // ₱1,500
  'SBGH:OT:session-spec': 'https://accounting.sapphireclinicseast.org/pay/WmCzxt_2D3Nt', // ₱1,875
  'SBGH:OT:eval': 'https://accounting.sapphireclinicseast.org/pay/GaIp6avi5_qD', // ₱2,150
  'SBGH:OT:eval-spec': 'https://accounting.sapphireclinicseast.org/pay/FHSQMHo8EskU', // ₱2,400
  'SBGH:OT:pkg8': 'https://accounting.sapphireclinicseast.org/pay/t2ZgwJIcvchP', // ₱11,880
  'SBGH:OT:pkg8-spec': 'https://accounting.sapphireclinicseast.org/pay/p27Au55LYAd7', // ₱14,700
  'SBGH:OT:pkg12': 'https://accounting.sapphireclinicseast.org/pay/5TQ9xWts88lG', // ₱17,550
  'SBGH:OT:pkg12-spec': 'https://accounting.sapphireclinicseast.org/pay/lWyMvZkzMS5C', // ₱21,600

  // Speech-Language Pathology
  'SBGH:SLP:session': 'https://accounting.sapphireclinicseast.org/pay/t_y-ii6czH4F', // ₱1,500
  'SBGH:SLP:session-spec': 'https://accounting.sapphireclinicseast.org/pay/fuuHQ6uzWDV4', // ₱1,875
  'SBGH:SLP:eval': 'https://accounting.sapphireclinicseast.org/pay/ujNu9tu0qrol', // ₱2,250
  'SBGH:SLP:eval-spec': 'https://accounting.sapphireclinicseast.org/pay/ZTYqtF8IAPqH', // ₱2,400
  'SBGH:SLP:pkg8': 'https://accounting.sapphireclinicseast.org/pay/ZQXs87Bf59Wr', // ₱11,880
  'SBGH:SLP:pkg8-spec': 'https://accounting.sapphireclinicseast.org/pay/hRAgQV0aOmcS', // ₱14,700
  'SBGH:SLP:pkg12': 'https://accounting.sapphireclinicseast.org/pay/7ALfd6eJavaC', // ₱17,550
  'SBGH:SLP:pkg12-spec': 'https://accounting.sapphireclinicseast.org/pay/f5jaNQcMSQca', // ₱21,600
}

export function checkoutUrlFor(branch: TeleBranch, dept: TeleDept, id: string): string | undefined {
  return TELE_CHECKOUT[`${branch}:${dept}:${id}`]
}
