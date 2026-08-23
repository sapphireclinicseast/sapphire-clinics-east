"use client"

import type { ProductVariant } from "@/lib/products"

interface VariantPickerProps {
  variants: ProductVariant[]
  selectedIndex: number
  onSelect: (index: number) => void
}

export function VariantPicker({ variants, selectedIndex, onSelect }: VariantPickerProps) {
  if (variants.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-verdana-charcoal">
        Color: <span className="font-normal">{variants[selectedIndex]?.label}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant, index) => (
          <button
            key={variant.label}
            onClick={() => onSelect(index)}
            className={`h-8 w-8 rounded-full border-2 transition-all ${
              index === selectedIndex
                ? "ring-2 ring-verdana-teal ring-offset-2 border-verdana-teal"
                : "border-gray-200 hover:border-gray-400"
            }`}
            style={{ backgroundColor: variant.colorHex }}
            title={variant.label}
            aria-label={variant.label}
          />
        ))}
      </div>
    </div>
  )
}
