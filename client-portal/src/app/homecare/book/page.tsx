import { redirect } from 'next/navigation'

// Retired — the homecare booking flow now lives on Nickel.
export default function HomecareBookRedirect() {
  redirect('https://nickel.sapphireclinicseast.org/book')
}
