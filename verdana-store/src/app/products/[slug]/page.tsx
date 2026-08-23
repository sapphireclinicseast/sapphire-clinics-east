import { notFound } from "next/navigation"
import { getProductBySlug, getProductsByCollection } from "@/lib/products"
import { getAllProductImages } from "@/lib/product-images"
import { getProductVideos } from "@/lib/product-videos"
import { ProductDetailClient } from "./ProductDetailClient"

export const dynamic = "force-dynamic"

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)

  if (!product) notFound()

  const imageData = getAllProductImages()
  const uploadedImages = imageData[slug] || []
  const displayImages = uploadedImages.length > 0 ? uploadedImages : product.images
  const videos = getProductVideos(slug)

  const relatedProducts = getProductsByCollection(product.collectionSlug)
    .filter((p) => p.id !== product.id)
    .slice(0, 4)
    .map((p) => ({
      ...p,
      images: imageData[p.slug]?.length > 0 ? imageData[p.slug] : p.images,
    }))

  return (
    <ProductDetailClient
      product={{ ...product, images: displayImages }}
      relatedProducts={relatedProducts}
      videos={videos}
    />
  )
}
