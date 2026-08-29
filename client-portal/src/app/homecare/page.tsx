import { redirect } from 'next/navigation'

// The Aura in-app homecare flow has been retired. Homecare now lives on Nickel
// (nickel.sapphireclinicseast.org), a standalone app. Anything landing here is
// sent straight there.
export default function HomecareRedirect() {
  redirect('https://nickelcare.com')
}
