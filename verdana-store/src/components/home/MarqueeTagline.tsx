export function MarqueeTagline() {
  const text = "Progress, Made Possible."
  const repeated = Array(10).fill(text).join(" \u00A0\u00A0\u00A0 ")

  return (
    <div className="bg-verdana-orange py-4 overflow-hidden">
      <div className="flex whitespace-nowrap animate-marquee">
        <span className="text-white font-bold text-lg tracking-wide">{repeated}</span>
        <span className="text-white font-bold text-lg tracking-wide ml-8">{repeated}</span>
      </div>
    </div>
  )
}
