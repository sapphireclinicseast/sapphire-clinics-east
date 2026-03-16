import { redirect } from 'next/navigation'

// Root /queue → redirect to SBEA display by default.
// Must redirect to /sbea (not /queue/sbea) because when accessed via
// queue.sapphireclinicseast.org the middleware re-prefixes the path with /queue.
export default function QueueRootPage() {
  redirect('/sbea')
}
