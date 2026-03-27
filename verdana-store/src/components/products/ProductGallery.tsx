"use client"

import { useState } from "react"
import Image from "next/image"

interface ProductGalleryProps {
  images: string[]
  title: string
}

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div className="aspect-square w-full rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
        No image available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Main image */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
        <Image
          src={images[selectedIndex]}
          alt={`${title} - Image ${selectedIndex + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedIndex(index)}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 border-2 transition-colors ${
                index === selectedIndex
                  ? "border-verdana-teal"
                  : "border-transparent hover:border-gray-300"
              }`}
            >
              <Image
                src={image}
                alt={`${title} - Thumbnail ${index + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
