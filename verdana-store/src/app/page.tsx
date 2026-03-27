import Link from "next/link"
import { HeroBanner } from "@/components/home/HeroBanner"
import { MarqueeTagline } from "@/components/home/MarqueeTagline"
import { MarketplaceLinks } from "@/components/home/MarketplaceLinks"
import { ComplianceBadges } from "@/components/home/ComplianceBadges"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <>
      <HeroBanner />

      {/* Introduction section */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-verdana-charcoal">
            Introducing Verdana Store!
          </h2>
          <p className="mt-2 text-lg text-verdana-teal font-semibold">
            Progress, Made Possible.
          </p>
        </div>
      </section>

      {/* Quote section */}
      <section className="bg-verdana-cream py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <blockquote className="text-2xl sm:text-3xl font-serif italic text-verdana-charcoal">
            &ldquo;Play is the work of the child&rdquo;
          </blockquote>
          <p className="mt-4 text-gray-600 font-medium">&mdash; Maria Montessori</p>
        </div>
      </section>

      {/* About therapists section */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6 text-center space-y-6">
          <p className="text-gray-700 leading-relaxed">
            Our products are carefully curated by board-certified therapists who understand the
            unique needs of children in rehabilitation. Every item in our store is evidence-based
            and designed to support developmental milestones while making therapy engaging and fun.
          </p>
          <Button size="lg" asChild>
            <Link href="/collections">Shop Now</Link>
          </Button>
        </div>
      </section>

      <MarqueeTagline />
      <MarketplaceLinks />
      <ComplianceBadges />

      {/* Contact / Suggestion form */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-2xl font-bold text-verdana-charcoal text-center">
            More products are on the way!
          </h2>
          <p className="mt-2 text-gray-600 text-center">
            Have a suggestion? Let us know what products you&apos;d like to see.
          </p>

          <form className="mt-8 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="home-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="home-name"
                  type="text"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="home-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="home-email"
                  type="email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="home-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="home-phone"
                type="tel"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent"
                placeholder="Your phone number"
              />
            </div>
            <div>
              <label htmlFor="home-comment" className="block text-sm font-medium text-gray-700 mb-1">
                Comment
              </label>
              <textarea
                id="home-comment"
                rows={4}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal focus:border-transparent resize-none"
                placeholder="Tell us what products you'd like to see..."
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              Submit
            </Button>
          </form>
        </div>
      </section>
    </>
  )
}
