import Link from "next/link"
import type { Metadata } from "next"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Order Confirmed",
}

export default function CheckoutSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 sm:px-6 text-center">
      <CheckCircle className="mx-auto h-16 w-16 text-verdana-teal" />

      <h1 className="mt-6 text-3xl font-bold text-verdana-charcoal">
        Thank you for your order!
      </h1>

      <p className="mt-4 text-gray-600">
        Your order has been placed successfully.
      </p>

      <p className="mt-2 text-gray-500 text-sm">
        You will receive an email confirmation shortly.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/collections">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  )
}
