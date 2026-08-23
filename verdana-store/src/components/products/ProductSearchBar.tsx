"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

interface ProductSearchBarProps {
  defaultValue?: string
  className?: string
}

/** Search bar shown above product listings. Submits to the /search results page. */
export function ProductSearchBar({ defaultValue = "", className = "" }: ProductSearchBarProps) {
  const [q, setQ] = useState(defaultValue)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search")
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={`relative w-full max-w-xl ${className}`}>
      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products..."
        aria-label="Search products"
        className="w-full rounded-xl border border-gray-200 bg-white pl-12 pr-24 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-verdana-teal/30 focus:border-verdana-teal transition-all"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-verdana-teal px-4 py-2 text-sm font-semibold text-white hover:bg-verdana-dark-teal transition-colors"
      >
        Search
      </button>
    </form>
  )
}
