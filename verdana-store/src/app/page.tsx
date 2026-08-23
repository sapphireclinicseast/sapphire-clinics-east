import Link from "next/link"
import { BackgroundPaths } from "@/components/ui/background-paths"
import { MarqueeTagline } from "@/components/home/MarqueeTagline"
import { MarketplaceLinks } from "@/components/home/MarketplaceLinks"
import { ComplianceBadges } from "@/components/home/ComplianceBadges"
import { SuggestionForm } from "@/components/home/SuggestionForm"
import { PartnerPanel } from "@/components/home/PartnerPanel"
import { Button } from "@/components/ui/button"
import { getSettings } from "@/lib/settings"

// Re-read settings (catalog link) on each request so an admin upload shows immediately.
export const dynamic = "force-dynamic"

export default function HomePage() {
  const catalog = getSettings().catalog

  return (
    <>
      <PartnerPanel />
      <BackgroundPaths />

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
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/collections">Shop Now</Link>
            </Button>
            {catalog && (
              <Button size="lg" variant="outline" asChild>
                <a href={catalog.url} target="_blank" rel="noopener noreferrer" download>
                  Download Catalog
                </a>
              </Button>
            )}
          </div>
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

          <SuggestionForm />
        </div>
      </section>
    </>
  )
}
