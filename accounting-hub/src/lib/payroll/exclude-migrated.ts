// Orders imported from QuickBooks history (tagged by referenceNumber) carry
// compensation that was already paid and expensed in that era — they must
// never feed payroll generation, session matching, or payroll exports, or
// consultant/employee pay would be counted twice. Include this fragment in
// every payroll-side prisma.order query.
export const MIGRATED_ORDER_TAGS = ['QB2024', 'QB2025', 'QB2026']

// Null-safe exclusion: a bare NOT { referenceNumber: { in: … } } would also
// drop live orders whose referenceNumber is null.
export const notMigratedOrder = {
  OR: [
    { referenceNumber: null },
    { referenceNumber: { notIn: MIGRATED_ORDER_TAGS } },
  ],
}
