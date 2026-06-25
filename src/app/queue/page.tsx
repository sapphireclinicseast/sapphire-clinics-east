import { redirect } from 'next/navigation'

// Root /queue → redirect to East display by default.
// Must redirect to /ahea (not /queue/ahea) because when accessed via
// queue.sapphireclinicseast.org the middleware re-prefixes the path with /queue.
export default function QueueRootPage() {
  redirect('/ahea')
}
