/**
 * Customer-facing product categories on verdanarehab.com.
 *
 * Deliberately separate from the internal SKU department/category hierarchy: shoppers
 * browse by what a thing *is for*, while SKUs stay numbered by the accounting scheme.
 * An item can therefore move between store categories without its SKU changing.
 *
 * `slug` matches the storefront's collectionSlug so the two can be reconciled by value.
 * Source: Verdana_Grove_Website_Classification.xlsx (05 Verdana Trading / 01 Products:Services).
 */
export const WEBSITE_CLASSIFICATIONS = [
  { label: 'Merch & Resources', slug: 'merch-resources' },
  { label: 'Pretend Play & Learning Toys', slug: 'pretend-play-learning-toys' },
  { label: 'Sensory Therapeutic Tools', slug: 'sensory-therapeutic-tools' },
  { label: 'Active & Sensory Play', slug: 'active-sensory-play' },
  { label: 'Furniture & Room Pieces', slug: 'furniture-room-pieces' },
] as const

export type WebsiteClassification = (typeof WEBSITE_CLASSIFICATIONS)[number]['label']

export const WEBSITE_CLASSIFICATION_LABELS: string[] = WEBSITE_CLASSIFICATIONS.map((c) => c.label)

export function classificationSlug(label?: string | null): string | null {
  if (!label) return null
  return WEBSITE_CLASSIFICATIONS.find((c) => c.label === label)?.slug ?? null
}
