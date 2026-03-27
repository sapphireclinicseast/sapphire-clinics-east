export function HeroBanner() {
  return (
    <section className="relative bg-gradient-to-br from-verdana-teal to-verdana-dark-teal overflow-hidden">
      <div className="mx-auto max-w-4xl px-6 py-24 sm:py-32 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
          At Verdana, we believe every child deserves tools that help them grow, learn, and thrive.
        </h1>
      </div>

      {/* Decorative wave at bottom */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg
          viewBox="0 0 1440 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0 80V40C240 0 480 60 720 40C960 20 1200 60 1440 40V80H0Z"
            fill="white"
          />
        </svg>
      </div>
    </section>
  )
}
