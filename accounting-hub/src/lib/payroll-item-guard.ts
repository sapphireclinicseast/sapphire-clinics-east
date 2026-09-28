// Employee/consultant compensation must go through Payroll, never One-Time
// Expense: paying it here bypasses payslips, statutory deductions and the
// payroll GL mapping (a hand-built maternity benefit is what broke the
// May–July 2026 balance sheet). Hannah's ruling 2026-09-29: HARD BLOCK.
// If a legitimate non-payroll expense trips this (e.g. "payroll software
// subscription"), reword its description — or tune this pattern.
export const PAYROLL_ITEM_RX = /final\s*pay|last\s*pay|back\s*pay|13(th)?\s*month|thirteenth\s*month|maternity|paternity|sickness\s*benefit|separation\s*pay|salar(y|ies)|payroll/i

export const isPayrollItem = (e: { description?: string | null; accountTitle?: string | null }) =>
  PAYROLL_ITEM_RX.test(`${e.description || ''} ${e.accountTitle || ''}`)
