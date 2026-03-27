import Image from "next/image"
import type { Metadata } from "next"
import { MarqueeTagline } from "@/components/home/MarqueeTagline"

export const metadata: Metadata = {
  title: "About Us",
}

export default function AboutPage() {
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-verdana-charcoal">Who We Are</h1>

        {/* Logo mark */}
        <div className="my-12 flex justify-center">
          <Image
            src="/logo/logo-teal-transparent.png"
            alt="Verdana Rehab Solutions"
            width={300}
            height={120}
            className="h-auto w-64 sm:w-80"
          />
        </div>

        <div className="space-y-6 text-gray-700 leading-relaxed">
          <p className="text-lg">
            We are a team of seasoned rehabilitation professionals with over a decade of industry
            experience.
          </p>
          <p>
            We partner with healthcare professionals, educators, and families to bring
            evidence-based products that support children&apos;s developmental journeys. Our team
            includes board-certified occupational therapists, speech-language pathologists, and
            physical therapists who personally vet and select every product in our catalog.
          </p>
        </div>
      </div>

      <MarqueeTagline />

      {/* Mission section */}
      <section className="bg-verdana-dark-teal text-white py-16">
        <div className="mx-auto max-w-3xl px-6 text-center space-y-4">
          <h2 className="text-2xl font-bold">Our Mission</h2>
          <p className="text-lg leading-relaxed text-gray-200">
            To make therapeutic tools accessible, affordable, and engaging for every child who
            needs them. We are committed to bridging the gap between clinical excellence and
            everyday use, empowering families and therapists with products that truly make a
            difference.
          </p>
        </div>
      </section>

      {/* Vision section */}
      <section className="py-16 bg-verdana-off-white">
        <div className="mx-auto max-w-3xl px-6 text-center space-y-4">
          <h2 className="text-2xl font-bold text-verdana-charcoal">Our Vision</h2>
          <p className="text-lg leading-relaxed text-gray-700">
            A world where every child, regardless of their abilities, has the support and tools
            they need to reach their full potential. We envision communities where therapy is not
            just a clinical experience, but a joyful part of everyday life.
          </p>
        </div>
      </section>
    </>
  )
}
