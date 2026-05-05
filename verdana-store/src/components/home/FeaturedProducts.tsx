import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getAllProducts } from "@/lib/products"
import { getAllProductImages } from "@/lib/product-images"
import { ProductCard } from "@/components/products/ProductCard"
import { Button } from "@/components/ui/button"

export function FeaturedProducts() {
  const allProducts = getAllProducts()
  const imageData = getAllProductImages()

  // Pick first 8 products, merge any uploaded images
  const featured = allProducts.slice(0, 8).map((p) => ({
    ...p,
    images: imageData[p.slug]?.length > 0 ? imageData[p.slug] : p.images,
  }))

  return (
    <section className="py-20 bg-verdana-off-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-verdana-orange font-semibold tracking-widest uppercase text-sm mb-3">
              Featured
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-verdana-charcoal">
              Popular Products
            </h2>
          </div>
          <Button variant="ghost" className="hidden sm:inline-flex text-verdana-teal hover:text-verdana-dark-teal" asChild>
            <Link href="/collections">
              View All
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="mt-10 text-center sm:hidden">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/collections">
              View All Products
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
