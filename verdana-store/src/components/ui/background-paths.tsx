"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { GooeyText } from "@/components/ui/gooey-text-morphing"

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }))

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="w-full h-full text-verdana-teal"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.08 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.4 }}
            animate={{
              pathLength: 1,
              opacity: [0.2, 0.45, 0.2],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 22 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  )
}

interface BackgroundPathsProps {
  title?: string
  subtitle?: string
  ctaLabel?: string
  ctaHref?: string
  secondaryLabel?: string
  secondaryHref?: string
}

export function BackgroundPaths({
  title = "Progress, Made Possible.",
  subtitle = "Therapist-curated rehabilitation products to help every child, and every family, grow.",
  ctaLabel = "Shop the Collection",
  ctaHref = "/collections",
  secondaryLabel = "About Us",
  secondaryHref = "/about",
}: BackgroundPathsProps) {
  const words = title.split(" ")

  return (
    <div className="relative min-h-[88vh] w-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-verdana-off-white via-white to-verdana-pale-blue">
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Soft orange spotlight on the right */}
      <div className="pointer-events-none absolute -right-32 top-1/3 h-[420px] w-[420px] rounded-full bg-verdana-orange/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 -bottom-32 h-[460px] w-[460px] rounded-full bg-verdana-teal/15 blur-3xl" />

      <div className="relative z-10 container mx-auto px-4 md:px-6 text-center py-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="max-w-4xl mx-auto"
        >
          {/* Verdana logo mark */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, y: -20 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -6, 0],
            }}
            transition={{
              scale: { duration: 0.7, ease: "easeOut" },
              opacity: { duration: 0.7 },
              y: {
                delay: 0.7,
                duration: 4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              },
            }}
            className="flex justify-center mb-6"
          >
            <Image
              src="/api/uploads/logo/verdana-mark.png"
              alt="Verdana Rehab Solutions"
              width={181}
              height={150}
              unoptimized
              priority
              className="h-20 sm:h-24 md:h-28 w-auto drop-shadow-md"
            />
          </motion.div>

          <motion.p
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-verdana-orange font-semibold tracking-[0.25em] uppercase text-xs sm:text-sm mb-8 sm:mb-10"
          >
            Welcome to
          </motion.p>

          {/* Gooey morphing brand name */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mb-10 sm:mb-12"
          >
            <GooeyText
              texts={["Verdana Store", "Verdana Rehab", "Verdana Care", "Verdana Family"]}
              morphTime={1.3}
              cooldownTime={1.4}
              className="h-[110px] sm:h-[140px] md:h-[170px]"
              textClassName="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-verdana-charcoal via-verdana-dark-teal to-verdana-teal leading-[1.1]"
            />
          </motion.div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-7 tracking-tight leading-[1.15] text-verdana-charcoal">
            {words.map((word, wordIndex) => (
              <span key={wordIndex} className="inline-block mr-3 last:mr-0">
                {word.split("").map((letter, letterIndex) => (
                  <motion.span
                    key={`${wordIndex}-${letterIndex}`}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      delay: 1.2 + wordIndex * 0.08 + letterIndex * 0.025,
                      type: "spring",
                      stiffness: 150,
                      damping: 25,
                    }}
                    className="inline-block"
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.7 }}
            className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            {subtitle}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
          >
            <div className="inline-block group relative bg-gradient-to-b from-verdana-teal/30 to-verdana-orange/20 p-px rounded-2xl backdrop-blur-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
              <Button
                asChild
                variant="ghost"
                className="rounded-[1.15rem] px-7 py-6 text-base font-semibold backdrop-blur-md bg-verdana-teal/95 hover:bg-verdana-dark-teal text-white transition-all duration-300 group-hover:-translate-y-0.5 border border-verdana-teal/30"
              >
                <Link href={ctaHref}>
                  <span className="opacity-95 group-hover:opacity-100 transition-opacity">
                    {ctaLabel}
                  </span>
                  <span className="ml-2.5 opacity-80 group-hover:opacity-100 group-hover:translate-x-1.5 transition-all duration-300">
                    →
                  </span>
                </Link>
              </Button>
            </div>

            {secondaryLabel && (
              <Button
                asChild
                variant="ghost"
                className="rounded-2xl px-7 py-6 text-base font-semibold text-verdana-charcoal hover:text-verdana-teal hover:bg-white/60 border border-verdana-charcoal/10 transition-all"
              >
                <Link href={secondaryHref}>{secondaryLabel}</Link>
              </Button>
            )}
          </motion.div>

          {/* Trust strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.1, duration: 0.8 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] sm:text-xs font-medium tracking-wider uppercase text-gray-500"
          >
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-verdana-teal" />
              Therapist Curated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-verdana-orange" />
              Evidence Based
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-verdana-teal" />
              Made for Children
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
