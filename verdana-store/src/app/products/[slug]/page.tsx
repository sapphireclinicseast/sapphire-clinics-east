"use client"

import { useState } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { use } from "react"
import { ShoppingCart, Zap } from "lucide-react"
import { getProductBySlug, getProductsByCollection, products as allProducts } from "@/lib/products"
import { formatPrice } from "@/lib/format"
import { useCart } from "@/hooks/use-cart"
import { ProductGallery } from "@/components/products/ProductGallery"
import { VariantPicker } from "@/components/products/VariantPicker"
import { QuantitySelector } from "@/components/products/QuantitySelector"
import { TrustBadges } from "@/components/products/TrustBadges"
import { ProductCard } from "@/components/products/ProductCard"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface ProductPageProps {
  params: Promise<{ slug: string }>
}

export default function ProductPage({ params }: ProductPageProps) {
  const { slug } = use(params)
  const product = getProductBySlug(slug)

  if (!product) notFound()

  const { addItem, setIsCartOpen } = useCart()
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [isBuying, setIsBuying] = useState(false)

  const relatedProducts = getProductsByCollection(product.collectionSlug)
    .filter((p) => p.id !== product.id)
    .slice(0, 4)

  function handleAddToCart() {
    const variant = product.variants[selectedVariant]
    addItem({
      productId: product.id,
      variantId: variant?.label,
      variantLabel: variant?.label,
      title: product.title,
      price: product.price,
      image: product.images[0] || "",
      quantity,
    })
    setIsCartOpen(true)
  }

  async function handleBuyNow() {
    setIsBuying(true)
    const variant = product.variants[selectedVariant]
    const items = [
      {
        productId: product.id,
        variantId: variant?.label,
        variantLabel: variant?.label,
        title: product.title,
        price: product.price,
        image: product.images[0] || "",
        quantity,
      },
    ]
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error("Checkout failed:", error)
    } finally {
      setIsBuying(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Product detail layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Left: Gallery */}
        <ProductGallery images={product.images} title={product.title} />

        {/* Right: Product info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-verdana-charcoal">
              {product.title}
            </h1>
            <p className="mt-2 text-2xl font-semibold text-verdana-charcoal">
              {formatPrice(product.price)}
            </p>
          </div>

          {/* Variant picker */}
          {product.variants.length > 0 && (
            <VariantPicker
              variants={product.variants}
              selectedIndex={selectedVariant}
              onSelect={setSelectedVariant}
            />
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-verdana-charcoal">Quantity</p>
            <QuantitySelector quantity={quantity} onQuantityChange={setQuantity} />
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={handleAddToCart}>
              <ShoppingCart className="h-5 w-5" />
              Add to cart
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              onClick={handleBuyNow}
              disabled={isBuying}
            >
              <Zap className="h-5 w-5" />
              {isBuying ? "Processing..." : "Buy it now"}
            </Button>
          </div>

          {/* Description */}
          <p className="text-gray-700 leading-relaxed">{product.description}</p>

          {/* Trust badges */}
          <TrustBadges />

          {/* Accordion */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details">
              <AccordionTrigger>Details</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-gray-600">
                  <p>{product.description}</p>
                  {product.variants.length > 0 && (
                    <p>
                      Available in {product.variants.length} color
                      {product.variants.length > 1 ? "s" : ""}:{" "}
                      {product.variants.map((v) => v.label).join(", ")}
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="shipping">
              <AccordionTrigger>Shipping &amp; Returns</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-gray-600">
                  <p>
                    Orders are processed within 1&ndash;2 business days. Delivery typically takes
                    3&ndash;7 business days depending on your location and chosen shipping method.
                  </p>
                  <p>
                    We offer returns and exchanges within 7 days of delivery for unused items in
                    original packaging. Please contact our support team to initiate a return.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-verdana-charcoal mb-6">
            Shop The Full Collection
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button variant="outline" asChild>
              <Link href={`/collections/${product.collectionSlug}`}>View All</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
