import { getAllProducts } from "@/lib/products"
import { getAllProductImages } from "@/lib/product-images"
import { SearchClient } from "./SearchClient"

export const dynamic = "force-dynamic"

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const allProducts = getAllProducts()
  const imageData = getAllProductImages()

  // Merge uploaded images so cards show photos uploaded via admin
  const products = allProducts.map((p) => ({
    ...p,
    images: imageData[p.slug]?.length > 0 ? imageData[p.slug] : p.images,
  }))

  return <SearchClient products={products} initialQuery={q ?? ""} />
}
