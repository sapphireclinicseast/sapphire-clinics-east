// ── Static product data for Verdana Rehab Store ─────────────────
// Used as fallback when DB is unavailable, and as seed source.

export interface ProductVariant {
  label: string
  colorHex: string
}

export interface Product {
  id: string
  slug: string
  title: string
  description: string
  price: number
  collectionSlug: string
  variants: ProductVariant[]
  images: string[]
}

export interface Collection {
  id: string
  slug: string
  name: string
  description: string
  imageUrl: string
}

// ── Collections ─────────────────────────────────────────────────

export const collections: Collection[] = [
  {
    id: 'col_books_manuals',
    slug: 'books-manuals',
    name: 'Books & Manuals',
    description: 'Educational books and clinical manuals for therapists and parents.',
    imageUrl: '/images/collections/books-manuals.jpg',
  },
  {
    id: 'col_merchandise',
    slug: 'merchandise',
    name: 'Merchandise',
    description: 'In partnership with Sandbox Clinic',
    imageUrl: '/images/collections/merchandise.jpg',
  },
  {
    id: 'col_sensory_gel_toys',
    slug: 'sensory-gel-toys',
    name: 'Sensory Gel Toys',
    description: 'Oral-motor and sensory chew tools designed for children in therapy.',
    imageUrl: '/images/collections/sensory-gel-toys.jpg',
  },
  {
    id: 'col_sensory_swings',
    slug: 'sensory-swings',
    name: 'Sensory Swings',
    description: 'Therapeutic swings for vestibular input and sensory integration.',
    imageUrl: '/images/collections/sensory-swings.jpg',
  },
  {
    id: 'col_therapeutic_toys',
    slug: 'therapeutic-toys',
    name: 'Therapeutic Toys (OT, SLP, PT)',
    description: 'Therapeutic toys and tools for occupational, speech-language, and physical therapy.',
    imageUrl: '/images/collections/therapeutic-toys.jpg',
  },
]

// ── Products ────────────────────────────────────────────────────

export const products: Product[] = [
  // ── sensory-gel-toys ──────────────────────────────────────────
  {
    id: 'prod_velura_textured_spoon',
    slug: 'velura-textured-spoon',
    title: 'Velura Textured Spoon',
    description:
      'A soft, textured silicone spoon designed to provide gentle oral-sensory input during mealtimes. Ideal for children with feeding difficulties or sensory processing needs.',
    price: 350,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Baby Pink', colorHex: '#F4C2C2' },
      { label: 'Beige', colorHex: '#D2B48C' },
      { label: 'Brown', colorHex: '#8B4513' },
      { label: 'Yellow', colorHex: '#FFD700' },
      { label: 'Off White', colorHex: '#FAF0E6' },
      { label: 'Green', colorHex: '#4CAF50' },
      { label: 'Blue Grey', colorHex: '#6E7F80' },
      { label: 'Rose Gold', colorHex: '#B76E79' },
    ],
    images: ['/images/products/velura-textured-spoon.jpg'],
  },
  {
    id: 'prod_hexaring_chew_keys',
    slug: 'hexaring-chew-keys',
    title: 'HexaRing Chew Keys',
    description:
      'Hexagonal ring-shaped chew keys that provide multiple textures for oral-motor exploration. Great for teething and sensory-seeking children.',
    price: 350,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Red', colorHex: '#E53935' },
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Blue', colorHex: '#1E88E5' },
      { label: 'Purple', colorHex: '#8E24AA' },
    ],
    images: ['/images/products/hexaring-chew-keys.jpg'],
  },
  {
    id: 'prod_aerogrip_chew_sleeves',
    slug: 'aerogrip-chew-sleeves',
    title: 'AeroGrip Chew Sleeves',
    description:
      'Ergonomic chew sleeves that slide onto pencils or utensils, redirecting chewing behaviour to a safe, food-grade silicone surface.',
    price: 250,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Purple', colorHex: '#8E24AA' },
      { label: 'Blue', colorHex: '#1E88E5' },
    ],
    images: ['/images/products/aerogrip-chew-sleeves.jpg'],
  },
  {
    id: 'prod_prism_brick_pencil_chew_toppers',
    slug: 'prism-brick-pencil-chew-toppers',
    title: 'Prism Brick Pencil Chew Toppers',
    description:
      'Brick-shaped chew toppers that fit standard pencils, providing a discreet oral-sensory outlet for children who chew on writing tools.',
    price: 250,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Orange', colorHex: '#FF9800' },
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Red', colorHex: '#E53935' },
      { label: 'Blue', colorHex: '#1E88E5' },
      { label: 'Purple', colorHex: '#8E24AA' },
    ],
    images: ['/images/products/prism-brick-pencil-chew-toppers.jpg'],
  },
  {
    id: 'prod_prism_brick_chew_pendant',
    slug: 'prism-brick-chew-pendant',
    title: 'Prism Brick Chew Pendant',
    description:
      'A wearable brick-shaped chew pendant on a breakaway lanyard. Keeps a safe chew tool accessible for children throughout the day.',
    price: 250,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Red', colorHex: '#E53935' },
      { label: 'Yellow', colorHex: '#FFD700' },
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Orange', colorHex: '#FF9800' },
    ],
    images: ['/images/products/prism-brick-chew-pendant.jpg'],
  },
  {
    id: 'prod_precision_tongue_trainer',
    slug: 'precision-tongue-trainer',
    title: 'Precision Tongue Trainer',
    description:
      'A specialised oral-motor tool for targeted tongue exercises. Used by speech-language pathologists to improve tongue lateralisation, elevation, and strength.',
    price: 1200,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/precision-tongue-trainer.jpg'],
  },
  {
    id: 'prod_crimson_sensory_bars',
    slug: 'crimson-sensory-bars',
    title: 'Crimson Sensory Bars',
    description:
      'Firm, textured chew bars designed for children who need intense proprioceptive input through the jaw. Suitable for heavy chewers.',
    price: 1000,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/crimson-sensory-bars.jpg'],
  },
  {
    id: 'prod_flexi_t_chew_tools',
    slug: 'flexi-t-chew-tools',
    title: 'Flexi-T Chew Tools',
    description:
      'T-shaped flexible chew tools that target the back molars for jaw strengthening. Available in multiple resistance levels by colour.',
    price: 350,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Red', colorHex: '#E53935' },
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Blue', colorHex: '#1E88E5' },
      { label: 'Purple', colorHex: '#8E24AA' },
      { label: 'Yellow', colorHex: '#FFD700' },
    ],
    images: ['/images/products/flexi-t-chew-tools.jpg'],
  },
  {
    id: 'prod_butterfly_calm_chews',
    slug: 'butterfly-calm-chews',
    title: 'Butterfly Calm Chews',
    description:
      'Butterfly-shaped silicone chew toys that provide calming oral-sensory input. Lightweight and easy for small hands to hold.',
    price: 250,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Blue', colorHex: '#1E88E5' },
      { label: 'Purple', colorHex: '#8E24AA' },
      { label: 'Pink', colorHex: '#E91E63' },
    ],
    images: ['/images/products/butterfly-calm-chews.jpg'],
  },
  {
    id: 'prod_aurora_tag_chews',
    slug: 'aurora-tag-chews',
    title: 'Aurora Tag Chews',
    description:
      'Small tag-shaped chew pendants that clip to clothing or lanyards. A subtle sensory tool for school and community settings.',
    price: 200,
    collectionSlug: 'sensory-gel-toys',
    variants: [
      { label: 'Purple', colorHex: '#8E24AA' },
      { label: 'Red', colorHex: '#E53935' },
      { label: 'Blue', colorHex: '#1E88E5' },
      { label: 'Green', colorHex: '#43A047' },
      { label: 'Sky Blue', colorHex: '#87CEEB' },
    ],
    images: ['/images/products/aurora-tag-chews.jpg'],
  },
  {
    id: 'prod_preschool_sensory_mealtime_set',
    slug: 'preschool-sensory-mealtime-set',
    title: 'Preschool Sensory Mealtime Set',
    description:
      'A curated set of textured utensils and oral-motor tools to support picky eaters and children with mealtime sensory sensitivities.',
    price: 1500,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/preschool-sensory-mealtime-set.jpg'],
  },
  {
    id: 'prod_intensive_oral_motor_dev_kit',
    slug: 'intensive-oral-motor-development-kit',
    title: 'Intensive Oral Motor Development Kit',
    description:
      'A comprehensive kit for speech-language pathologists featuring graded oral-motor tools for intensive jaw, lip, and tongue exercises.',
    price: 2450,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/intensive-oral-motor-development-kit.jpg'],
  },
  {
    id: 'prod_clinic_assessment_pack',
    slug: 'clinic-assessment-pack',
    title: 'Clinic Assessment Pack',
    description:
      'An essential pack of oral-sensory tools for clinic-based feeding and oral-motor assessments. Includes a variety of textures and resistances.',
    price: 2350,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/clinic-assessment-pack.jpg'],
  },
  {
    id: 'prod_all_in_one_oral_sensory_mega_kit',
    slug: 'all-in-one-oral-sensory-mega-kit',
    title: 'All-in-one Oral Sensory Mega Kit',
    description:
      'The most complete oral-sensory collection, bundling chew tools, feeding utensils, and oral-motor trainers for home and clinic use.',
    price: 2800,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/all-in-one-oral-sensory-mega-kit.jpg'],
  },
  {
    id: 'prod_starter_oral_sensory_kit',
    slug: 'starter-oral-sensory-kit',
    title: 'Starter Oral-Sensory Kit',
    description:
      'An introductory set of oral-sensory tools for families beginning their sensory therapy journey. Therapist-recommended starter bundle.',
    price: 1350,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/starter-oral-sensory-kit.jpg'],
  },
  {
    id: 'prod_school_homework_chew_pack',
    slug: 'school-and-homework-chew-pack',
    title: 'School and Homework Chew Pack',
    description:
      'A portable chew-tool pack designed for school and homework time. Includes pencil toppers, a chew pendant, and a tag chew for on-the-go sensory support.',
    price: 900,
    collectionSlug: 'sensory-gel-toys',
    variants: [],
    images: ['/images/products/school-and-homework-chew-pack.jpg'],
  },

  // ── therapeutic-toys ──────────────────────────────────────────
  {
    id: 'prod_3d_puzzle_sets',
    slug: '3d-puzzle-sets',
    title: '3D Puzzle Sets',
    description:
      'Colourful 3D puzzles that develop fine-motor skills, spatial reasoning, and hand-eye coordination. Perfect for occupational therapy sessions.',
    price: 250,
    collectionSlug: 'therapeutic-toys',
    variants: [],
    images: ['/images/products/3d-puzzle-sets.jpg'],
  },
  {
    id: 'prod_abc_explorers',
    slug: 'abc-explorers',
    title: 'ABC Explorers',
    description:
      'Tactile letter-learning toys that combine alphabet recognition with fine-motor manipulation. Great for early literacy and speech therapy activities.',
    price: 300,
    collectionSlug: 'therapeutic-toys',
    variants: [],
    images: ['/images/products/abc-explorers.jpg'],
  },

  // ── merchandise ───────────────────────────────────────────────
  {
    id: 'prod_active_recovery_kids_shirt',
    slug: 'active-recovery-active-life-kids-shirt',
    title: 'Active Recovery, Active Life (for Kids) Shirt',
    description:
      'A fun, comfortable kids t-shirt featuring the "Active Recovery, Active Life" tagline. Made in partnership with Sandbox Clinic.',
    price: 498,
    collectionSlug: 'merchandise',
    variants: [],
    images: ['/images/products/active-recovery-active-life-kids-shirt.jpg'],
  },
]

// ── Helper functions ────────────────────────────────────────────

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

export function getProductsByCollection(collectionSlug: string): Product[] {
  return products.filter((p) => p.collectionSlug === collectionSlug)
}

export function getAllProducts(): Product[] {
  return products
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug)
}
