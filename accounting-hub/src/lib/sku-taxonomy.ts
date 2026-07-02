/**
 * Canonical SKU taxonomy: Department → Category → Subcategory (human-readable labels).
 * Kept in sync with the SKU builder used in the Inventory page. Shared so the income
 * statement can sub-classify "Sales of Product Income" by product subtype.
 */
export const SKU_HIERARCHY: Record<string, { label: string; categories: Record<string, { label: string; subcategories: Record<string, string> }> }> = {
  PT: { label: 'Physical Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { MOB: 'Mobility', STR: 'Strength', BAL: 'Balance' } },
    ACC: { label: 'Accessories', subcategories: { TAP: 'Taping' } },
    MAT: { label: 'Materials', subcategories: { MAS: 'Massage' } },
  }},
  OT: { label: 'Occupational Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { FUN: 'Functional', FIN: 'Fine Motor' } },
    SEN: { label: 'Sensory', subcategories: { INT: 'Integration' } },
    TOY: { label: 'Toys', subcategories: { THP: 'Therapeutic' } },
    ACC: { label: 'Accessories', subcategories: { GRI: 'Grip' } },
  }},
  ST: { label: 'Speech Therapy', categories: {
    EQP: { label: 'Equipment', subcategories: { ORA: 'Oral Motor' } },
    MAT: { label: 'Materials', subcategories: { LAN: 'Language', SND: 'Sound' } },
    TOY: { label: 'Toys', subcategories: { COM: 'Communication' } },
    ACC: { label: 'Accessories', subcategories: { DEV: 'Devices' } },
  }},
  SP: { label: 'Special Education', categories: {
    MAT: { label: 'Materials', subcategories: { LRN: 'Learning' } },
    EQP: { label: 'Equipment', subcategories: { BEH: 'Behavior' } },
    TOY: { label: 'Toys', subcategories: { EDU: 'General' } },
  }},
  PSY: { label: 'Psychology & Assessment', categories: {
    ASM: { label: 'Assessment', subcategories: { STD: 'Standardized Tests', SCR: 'Screening Tests' } },
    MAT: { label: 'Materials', subcategories: { THP: 'Therapy Aids' } },
  }},
  CLI: { label: 'Clinic & Institutional', categories: {
    FUR: { label: 'Furniture', subcategories: { GEN: 'General' } },
    EQP: { label: 'Equipment', subcategories: { MON: 'Monitoring Devices' } },
    ACC: { label: 'Accessories', subcategories: { SAN: 'Sanitary and Safety' } },
  }},
  DIG: { label: 'Digital & Tech', categories: {
    APP: { label: 'Application', subcategories: { TRN: 'Training & Simulation Apps' } },
    EQP: { label: 'Equipment', subcategories: { AUG: 'Augmentative & Assistive Tech' } },
    SUB: { label: 'Subscription', subcategories: { SFT: 'Software Subscriptions' } },
  }},
  EDU: { label: 'Training & Education', categories: {
    MAT: { label: 'Materials', subcategories: { BOK: 'Books & Manuals' } },
    KIT: { label: 'Kit', subcategories: { TRN: 'Training Kits' } },
    ACC: { label: 'Accessories', subcategories: { CER: 'Certification Materials' } },
  }},
  MER: { label: 'Merchandise', categories: {
    GEN: { label: 'General', subcategories: { STK: 'Stickers', EMB: 'Car Emblems', TLS: 'Tagless Shirt', PCH: 'Pouch', PBG: 'Paper Bags' } },
  }},
}

/** Human-readable "Department · Category" label for a product subtype. Falls back to the raw codes. */
export function productSubtypeLabel(dept?: string | null, category?: string | null): string {
  const d = (dept || '').trim().toUpperCase()
  const c = (category || '').trim().toUpperCase()
  const deptEntry = SKU_HIERARCHY[d]
  const deptLabel = deptEntry?.label || d || 'Other'
  const catLabel = deptEntry?.categories?.[c]?.label || c
  return catLabel ? `${deptLabel} · ${catLabel}` : deptLabel
}
