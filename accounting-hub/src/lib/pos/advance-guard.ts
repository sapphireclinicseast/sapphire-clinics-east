// HMO and Guarantee Letter payers settle AFTER the session, so a sale they pay
// for is never an advance payment. The POS "Is this an advance payment?" box
// once let HMO/GL sessions through as Unearned Revenue, each with an
// auto-created Advance wallet holding prepaid sessions (#47418, #47848 and
// #7039, repaired 2026-11-18). Unearned stays allowed when a line's SERVICE is
// itself classified Unearned (a real package): the catalog decides, not the box.

export const CREDIT_PAYER_METHODS: readonly string[] = ['HMO', 'GL']

export const isCreditPayer = (method?: string | null): boolean =>
  !!method && CREDIT_PAYER_METHODS.includes(method)

export const CREDIT_PAYER_ADVANCE_ERROR =
  "An HMO or Guarantee Letter payment can't be an advance payment — the HMO or STAR pays after the session. Save it as a regular sale (untick \"Is this an advance payment?\")."
