import type { MetadataRoute } from 'next'

// Web App Manifest — makes the patient portal installable (Add to Home Screen /
// Play Store TWA / Capacitor base). Served at /manifest.webmanifest; Next links
// it automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aura Health Rehab Patient Portal',
    short_name: 'Aura Health',
    description: 'Book appointments, view your sessions and reward points, and manage your care at Aura Health Rehab.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#EDF3D9', // --paper
    theme_color: '#244952', // --narra
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['health', 'medical', 'lifestyle'],
  }
}
