// Drill-down keys that are not plain account numbers. Client-safe (no engine
// import): the statement builds them, the engine and the APIs read them.

/** A 7080 Sales of Product Income category row (Department · Category) —
 *  drills to the POS order items that make up that category's amount. */
export const PRODUCT_SUBTYPE_PREFIX = '7080:'
export const productSubtypeDrillKey = (label: string) => `${PRODUCT_SUBTYPE_PREFIX}${label}`
