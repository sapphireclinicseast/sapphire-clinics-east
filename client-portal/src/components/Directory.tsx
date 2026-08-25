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
  messengerHref: string
  viberHref: string
}

export const AURA_WEBSITE = 'https://www.sapphireclinicseast.org'
export const AURA_TIKTOK = '@aurahealthrehab'
export const AURA_TIKTOK_URL = 'https://www.tiktok.com/@aurahealthrehab'

// Viber deep link — international number, no spaces, "+" encoded as %2B.
const viberHref = (intlNumber: string) => `viber://chat?number=%2B${intlNumber}`

export const AURA_BRANCHES: Branch[] = [
  {
    name: 'East Branch',
    address: 'Level 4, Robinsons Metro East, Marcos Highway, Brgy. Dela Paz, Santolan, Pasig',
    emailLabel: 'east@sapphireclinicseast.org',
    emailHref: 'mailto:hr.east@sapphireclinicseast.org',
    phones: '+63 917 118 9289 · (02) 5310-4991',
    social: 'Facebook / Instagram @aurahealthrehabeast',
    messengerHref: 'https://m.me/aurahealthrehabeast',
    viberHref: viberHref('639171189289'),
  },
  {
    name: 'Greenhills Branch',
    address: 'Level 8, GH Tower Offices, South Drive, Ortigas Avenue, Greenhills, San Juan City',
    emailLabel: 'greenhills@sapphireclinicseast.org',
    emailHref: 'mailto:hr.gh@sapphireclinicseast.org',
    phones: '+63 917 770 1686 · (02) 8529-1590',
    social: 'Facebook / Instagram @aurahealthrehabgh',
    messengerHref: 'https://m.me/aurahealthrehabgh',
    viberHref: viberHref('639177701686'),
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

function MessengerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M12 2C6.5 2 2 6.13 2 11.2c0 2.9 1.44 5.48 3.7 7.17V22l3.38-1.85c.9.25 1.86.39 2.92.39 5.5 0 10-4.13 10-9.2S17.5 2 12 2zm.98 12.39l-2.54-2.71-4.96 2.71 5.45-5.79 2.6 2.71 4.9-2.71-5.45 5.79z" />
    </svg>
  )
}

function ViberIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M12 2C6.7 2 2.4 5.9 2.4 10.7c0 2 .8 3.9 2.1 5.4-.1 1.1-.5 2.5-1.3 3.5 1.5-.2 2.8-.8 3.7-1.4 1.4.6 2.9.9 4.5.9 5.3 0 9.6-3.9 9.6-8.7S17.3 2 12 2zm4.7 12.2c-.3.7-1.5 1.3-2.3 1.2-.6-.1-1.5-.3-3.3-1.1-2.6-1.1-4.2-3.8-4.4-4-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.7 1.8.1.1.1.3 0 .4l-.3.5c-.1.2-.3.3-.1.6.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1.2-.2.6-.7.8-.9.1-.2.3-.2.5-.1.2.1 1.3.6 1.5.8.2.1.4.2.4.3.1.1.1.6-.1 1.2z" />
    </svg>
  )
}

// Messenger + Viber quick-chat buttons for a branch, side by side.
export function ChatButtons({ b }: { b: Branch }) {
  const btn = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity'
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      <a href={b.messengerHref} target="_blank" rel="noreferrer" className={btn} style={{ background: '#0A7CFF' }} aria-label={`Message ${b.name} on Messenger`}>
        <MessengerIcon /> Messenger
      </a>
      <a href={b.viberHref} className={btn} style={{ background: '#7360F2' }} aria-label={`Chat with ${b.name} on Viber`}>
        <ViberIcon /> Viber
      </a>
    </div>
  )
}

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
      <ChatButtons b={b} />
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
