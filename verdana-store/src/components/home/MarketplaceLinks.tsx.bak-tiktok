import { ExternalLink } from "lucide-react"

const marketplaces = [
  {
    name: "Shopee",
    url: "https://shopee.ph/shop/1286779961",
    color: "bg-orange-500 hover:bg-orange-600",
  },
  {
    name: "Lazada",
    url: "https://www.lazada.com.ph/shop/verdanarehab/",
    color: "bg-blue-600 hover:bg-blue-700",
  },
  {
    name: "TikTok",
    url: "https://www.tiktok.com/@verdanarehabsolutions",
    color: "bg-gray-900 hover:bg-black",
  },
]

export function MarketplaceLinks() {
  return (
    <section className="bg-verdana-light-blue py-16">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl font-bold text-verdana-charcoal">
          Prefer to shop on Shopee, Lazada or TikTok?
        </h2>
        <p className="mt-2 text-gray-600">You can find our official stores there too!</p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          {marketplaces.map((mp) => (
            <a
              key={mp.name}
              href={mp.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-lg px-8 py-3 text-white font-semibold transition-colors ${mp.color}`}
            >
              {mp.name}
              <ExternalLink className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
