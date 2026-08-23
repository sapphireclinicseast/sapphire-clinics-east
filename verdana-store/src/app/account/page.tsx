import { Suspense } from "react"
import type { Metadata } from "next"
import { AccountClient } from "./AccountClient"

export const metadata: Metadata = { title: "Partner Portal" }

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountClient />
    </Suspense>
  )
}
