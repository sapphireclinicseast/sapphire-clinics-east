import { prisma } from '@/lib/prisma'

// Consultant SSS/PhilHealth/Pag-IBIG are the consultant's own SELF-EMPLOYED
// contributions — never declared under the company as employer contributions.
// The company only shoulders/remits them on the consultant's behalf, so they
// post to their own accounts, separate from the employee ER expense accounts
// (8250/8150/8080) and the 4040 employee benefits payable (owner directive
// 2026-10-28).
export const CONSULTANT_CONTRIB_EXPENSE_NO = '8195' // Consultant Benefits — Self-Employed Contributions
export const CONSULTANT_CONTRIB_PAYABLE_NO = '4045' // Consultant Contributions Payable (Self-Employed)

export async function consultantContribAccounts(): Promise<{ expenseId: string | null; payableId: string | null }> {
  const [expense, payable] = await Promise.all([
    prisma.account.findFirst({ where: { accountNumber: CONSULTANT_CONTRIB_EXPENSE_NO, isActive: true }, select: { id: true } }),
    prisma.account.findFirst({ where: { accountNumber: CONSULTANT_CONTRIB_PAYABLE_NO, isActive: true }, select: { id: true } }),
  ])
  return { expenseId: expense?.id ?? null, payableId: payable?.id ?? null }
}
