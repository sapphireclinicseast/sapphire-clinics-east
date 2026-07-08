import type { Metadata } from 'next'
import QRCode from 'qrcode'
import GamesClient from './GamesClient'

export const metadata: Metadata = {
  title: 'Aura Health · Event Games',
  description: 'Play, win, and grab a Verdana Trainings & Seminars voucher.',
}

// Canonical public URL attendees land on when they scan the QR at the booth.
const GAME_URL = 'https://marketing.sapphireclinicseast.org/games'

export default async function GamesPage() {
  // Render the booth QR server-side so the client bundle stays lean and the
  // code path is deterministic (no client-side QR lib needed).
  const qrDataUrl = await QRCode.toDataURL(GAME_URL, {
    margin: 1,
    width: 480,
    color: { dark: '#244952', light: '#ffffff' },
  })

  return <GamesClient qrDataUrl={qrDataUrl} gameUrl={GAME_URL} />
}
