"use client"

import { Minus, Plus } from "lucide-react"

interface QuantitySelectorProps {
  quantity: number
  onQuantityChange: (quantity: number) => void
  min?: number
}

export function QuantitySelector({ quantity, onQuantityChange, min = 1 }: QuantitySelectorProps) {
  return (
    <div className="flex items-center border border-gray-300 rounded-md w-fit">
      <button
        onClick={() => onQuantityChange(Math.max(min, quantity - 1))}
        disabled={quantity <= min}
        className="px-3 py-2 text-gray-600 hover:text-verdana-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="px-4 py-2 text-sm font-medium min-w-[3rem] text-center border-x border-gray-300">
        {quantity}
      </span>
      <button
        onClick={() => onQuantityChange(quantity + 1)}
        className="px-3 py-2 text-gray-600 hover:text-verdana-charcoal transition-colors"
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
