"use client"

import Image from "next/image"
import Link from "next/link"
import { formatPrice } from "@/lib/format"
import type { Product } from "@/lib/products"

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">
            No image
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="text-sm font-medium text-verdana-charcoal line-clamp-2 group-hover:text-verdana-teal transition-colors">
          {product.title}
        </h3>
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
