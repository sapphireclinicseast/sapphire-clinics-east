import { redirect } from "next/navigation"

// The (dashboard) route group has no UI for the bare "/" path.
// Send everyone to /dashboard so logged-in users hitting the root
// URL land on FrontDeskWelcome instead of seeing a 404.
export default function Root() {
  redirect("/dashboard")
}
