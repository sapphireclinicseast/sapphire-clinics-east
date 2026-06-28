// Shared contact directory — Aura Health Rehab (East + Greenhills) and Verdana.
// Used by the header "Contact Us" menu and the signed-in portal "Directory" tab.

import type { ReactNode } from 'react'

export interface Branch {
  name: string
  address: string
  emailLabel: string
  emailHref: string
  phones: string
  social: string
}

export const AURA_WEBSITE = 'https://www.sapphireclinicseast.org'
export const AURA_TIKTOK = '@aurahealthrehab'
export const AURA_TIKTOK_URL = 'https://www.tiktok.com/@aurahealthrehab'

export const AURA_BRANCHES: Branch[] = [
  {
    name: 'East Branch',
    address: 'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig',
    emailLabel: 'east@sapphireclinicseast.org',
    emailHref: 'mailto:hr.east@sapphireclinicseast.org',
    phones: '+63 917 118 9289 · (02) 5310-4991',
    social: 'Facebook / Instagram @aurahealthrehabeast',
  },
  {
    name: 'Greenhills Branch',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
    emailLabel: 'greenhills@sapphireclinicseast.org',
    emailHref: 'mailto:hr.gh@sapphireclinicseast.org',
    phones: '+63 917 770 1686 · (02) 8529-1590',
    social: 'Facebook / Instagram @aurahealthrehabgh',
  },
]

export const VERDANA = {
  website: 'verdanarehab.com',
  websiteHref: 'https://verdanarehab.com',
  email: 'verdanatrading@gmail.com',
  phone: '+63 917 173 1368',
  address:
    "210B Henry's Building, 80 Ortigas Avenue, Greenhills, San Juan City, Metro Manila, Philippines, 1502",
  social: 'Facebook / Instagram @verdanarehab',
  tiktokHref: 'https://www.tiktok.com/@verdanarehab',
}

function Row({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px] text-[color:var(--mid-gray)] leading-snug">
      <span aria-hidden className="shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

const linkCls = 'text-[color:var(--moss)] hover:underline underline-offset-2 break-words'

export function BranchBlock({ b }: { b: Branch }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[color:var(--narra)]">{b.name}</div>
      <div className="mt-1.5 space-y-1.5">
        <Row icon="📍">{b.address}</Row>
        <Row icon="✉️">
          <a href={b.emailHref} className={linkCls}>{b.emailLabel}</a>
        </Row>
        <Row icon="📞">{b.phones}</Row>
        <Row icon="💬">{b.social}</Row>
      </div>
    </div>
  )
}

// Aura header block (logo wordmark + website + TikTok). Shared by both surfaces.
export function AuraHeading() {
  return (
    <>
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aura-mark.png" alt="" width={48} height={24} className="h-6 w-auto" />
        <div className="text-[15px] font-semibold text-[color:var(--narra)]">Aura Health Rehab</div>
      </div>
      <div className="mt-1.5 text-[13px] text-[color:var(--mid-gray)]">
        <a href={AURA_WEBSITE} target="_blank" rel="noreferrer" className={linkCls}>
          www.sapphireclinicseast.org
        </a>
        <span> · TikTok </span>
        <a href={AURA_TIKTOK_URL} target="_blank" rel="noreferrer" className={linkCls}>{AURA_TIKTOK}</a>
      </div>
    </>
  )
}

// Full directory card for the signed-in portal section (Aura + Verdana).
export function DirectorySection() {
  return (
    <div className="card-static">
      <h3 className="text-[20px] leading-tight text-[color:var(--deep-teal)]">Directory</h3>
      <p className="text-sm text-[color:var(--mid-gray)] mt-1">Reach us anytime — clinic and partner store.</p>

      <div className="mt-5">
        <AuraHeading />
        <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-5">
          {AURA_BRANCHES.map((b) => (
            <BranchBlock key={b.name} b={b} />
          ))}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-[color:var(--light-gray)]">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/verdana-icon.png" alt="" width={36} height={32} className="h-9 w-auto" />
          <div className="text-[15px] font-semibold text-[color:var(--narra)]">Verdana Rehab Solutions</div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Row icon="🌐">
            <a href={VERDANA.websiteHref} target="_blank" rel="noreferrer" className={linkCls}>{VERDANA.website}</a>
          </Row>
          <Row icon="✉️">
            <a href={`mailto:${VERDANA.email}`} className={linkCls}>{VERDANA.email}</a>
          </Row>
          <Row icon="📞">{VERDANA.phone}</Row>
          <Row icon="📍">{VERDANA.address}</Row>
          <Row icon="💬">{VERDANA.social}</Row>
          <Row icon="🎵">
            <a href={VERDANA.tiktokHref} target="_blank" rel="noreferrer" className={linkCls}>TikTok @verdanarehab</a>
          </Row>
        </div>
      </div>
    </div>
  )
}
