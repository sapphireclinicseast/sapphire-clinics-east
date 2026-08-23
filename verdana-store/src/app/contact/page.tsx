import type { Metadata } from "next"
import { Mail, Facebook, Instagram } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Contact Us",
}

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-verdana-charcoal">Contact Us</h1>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-3">
        {/* Contact form */}
        <div className="lg:col-span-2">
          <form className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="contact-phone"
                type="tel"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                placeholder="Your phone number"
              />
            </div>

            <div>
              <label htmlFor="contact-subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-subject"
                type="text"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                placeholder="What is this about?"
              />
            </div>

            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id="contact-message"
                rows={6}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent resize-none"
                placeholder="How can we help?"
              />
            </div>

            <Button type="submit">Send Message</Button>
          </form>
        </div>

        {/* Contact info sidebar */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-verdana-charcoal">Get in Touch</h2>
            <p className="mt-2 text-sm text-gray-600">
              We&apos;d love to hear from you. Reach out using any of the methods below.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="mailto:verdanatrading@gmail.com"
              className="flex items-start gap-3 text-sm text-gray-700 hover:text-verdana-teal transition-colors"
            >
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-verdana-teal" />
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Store &amp; Products
                </span>
                verdanatrading@gmail.com
              </span>
            </a>

            <a
              href="https://www.facebook.com/verdanarehabsolutions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-gray-700 hover:text-verdana-teal transition-colors"
            >
              <Facebook className="h-5 w-5 text-verdana-teal" />
              Verdana Rehab Solutions
            </a>

            <a
              href="https://www.instagram.com/verdanarehabsolutions"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-gray-700 hover:text-verdana-teal transition-colors"
            >
              <Instagram className="h-5 w-5 text-verdana-teal" />
              @verdanarehabsolutions
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
