import { Heart, BadgeCheck, Sparkles, ShieldCheck } from "lucide-react"

const badges = [
  { icon: Heart, label: "Made with care" },
  { icon: BadgeCheck, label: "Great value" },
  { icon: Sparkles, label: "Elegant design" },
  { icon: ShieldCheck, label: "Quality materials" },
]

export function TrustBadges() {
  return (
    <div className="grid grid-cols-2 gap-4 py-6">
      {badges.map(({ icon: Icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-2 text-center">
          <Icon className="h-6 w-6 text-verdana-teal" />
          <span className="text-sm text-gray-600">{label}</span>
        </div>
      ))}
    </div>
  )
}
