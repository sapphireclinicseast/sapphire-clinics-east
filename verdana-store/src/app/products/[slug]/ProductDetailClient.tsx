"use client"

import { useState } from "react"
import Link from "next/link"
import { ShoppingCart, Zap } from "lucide-react"
import type { Product } from "@/lib/types"
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

interface ProductDetailClientProps {
  product: Product
  relatedProducts: Product[]
}

export function ProductDetailClient({ product, relatedProducts }: ProductDetailClientProps) {
  const { addItem, setIsCartOpen } = useCart()
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [isBuying, setIsBuying] = useState(false)

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
      {/* Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/" className="hover:text-verdana-teal transition-colors">Home</Link>
        <span>/</span>
        <Link href="/collections" className="hover:text-verdana-teal transition-colors">Shop</Link>
        <span>/</span>
        <Link href={`/collections/${product.collectionSlug}`} className="hover:text-verdana-teal transition-colors capitalize">
          {product.collectionSlug.replace(/-/g, " ")}
        </Link>
        <span>/</span>
        <span className="text-verdana-charcoal font-medium truncate max-w-[200px]">{product.title}</span>
      </nav>

      {/* Product detail layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
        {/* Left: Gallery */}
        <ProductGallery images={product.images} title={product.title} />

        {/* Right: Product info */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-verdana-charcoal leading-tight">
              {product.title}
            </h1>
            <p className="mt-3 text-3xl font-bold text-gradient-teal">
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
          <div className="space-y-3 pt-2">
            <Button
              className="w-full rounded-xl py-6 text-base"
              size="lg"
              onClick={handleAddToCart}
            >
              <ShoppingCart className="h-5 w-5" />
              Add to Cart
            </Button>
            <Button
              variant="secondary"
              className="w-full rounded-xl py-6 text-base"
              size="lg"
              onClick={handleBuyNow}
              disabled={isBuying}
            >
              <Zap className="h-5 w-5" />
              {isBuying ? "Processing..." : "Buy It Now"}
            </Button>
          </div>

          {/* Description */}
          <p className="text-gray-600 leading-relaxed">{product.description}</p>

          {/* Trust badges */}
          <TrustBadges />

          {/* Accordion */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details" className="border-gray-100">
              <AccordionTrigger className="text-verdana-charcoal hover:text-verdana-teal">
                Details
              </AccordionTrigger>
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
            <AccordionItem value="shipping" className="border-gray-100">
              <AccordionTrigger className="text-verdana-charcoal hover:text-verdana-teal">
                Shipping &amp; Returns
              </AccordionTrigger>
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
        <section className="mt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-verdana-orange font-semibold tracking-widest uppercase text-xs mb-2">
                More from this collection
              </p>
              <h2 className="text-2xl font-bold text-verdana-charcoal">
                You May Also Like
              </h2>
            </div>
            <Button variant="ghost" className="text-verdana-teal hover:text-verdana-dark-teal" asChild>
              <Link href={`/collections/${product.collectionSlug}`}>View All</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
