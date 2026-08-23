"use client"

import Image from "next/image"
import Link from "next/link"
import { formatPrice } from "@/lib/format"
import type { Product } from "@/lib/types"

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const noStock = product.stock !== undefined && product.stock !== null && product.stock <= 0
  // Pre-order is a property of the item (mirrored from Accounting Hub), not of its stock level —
  // a pre-order item stays flagged even if a few units are on hand.
  const preOrder = !!product.isPreOrder
  const outOfStock = noStock && !product.isPreOrder
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.title}
            fill
            unoptimized={product.images[0].startsWith("/api/uploads")}
            className={`object-cover transition-transform duration-300 group-hover:scale-105 ${outOfStock ? "opacity-50" : ""}`}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">
            No image
          </div>
        )}
        {outOfStock && (
          <div className="absolute top-2 left-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            Sold out
          </div>
        )}
        {preOrder && (
          <div className="absolute top-2 left-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            Pre-order
          </div>
        )}
        {product.bestSeller && (
          <div className="absolute top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow">
            ★ Best Seller
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium text-verdana-charcoal line-clamp-2 group-hover:text-verdana-teal transition-colors">
          {product.title}
        </h3>
        {product.sku && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            SKU: {product.sku}
          </p>
        )}
        <p className="text-sm font-semibold text-verdana-charcoal">
          {formatPrice(product.price)}
        </p>

        {product.variants.length > 0 && (
          <div className="flex items-center gap-1 pt-1">
            {product.variants.slice(0, 6).map((variant) => (
              <span
                key={variant.label}
                className="h-4 w-4 rounded-full border border-gray-200"
                style={{ backgroundColor: variant.colorHex }}
                title={variant.label}
              />
            ))}
            {product.variants.length > 6 && (
              <span className="text-xs text-gray-400">+{product.variants.length - 6}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
