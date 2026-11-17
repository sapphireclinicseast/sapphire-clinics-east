/**
 * QuickBooks era (Hannah 2026-11-17). Sales and collections dated before 2026
 * are on the books through the QuickBooks import (QB_IMPORT_JE). The 2025
 * reports read only that, and a branch's 2026 opening is built from every
 * earlier entry. So the hub must not post its own entry for them a second
 * time, whether from a POS reopen/edit of a 2025 order or a Payment History
 * re-tag of a 2025 HMO cheque.
 */
export const QB_ERA_END = new Date('2026-01-01T00:00:00+08:00')
