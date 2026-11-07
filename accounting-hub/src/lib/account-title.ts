// One chart of accounts, one account per name. Two accounts with the same
// title (8100 and 8101 "Laundry Expense") split one expense across two lines
// in every report and budget, so a name may be used only once. Titles compare
// ignoring case and extra spaces: "Laundry Expense" = " laundry  expense".
export const accountTitleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase()

export type TitleHolder = { id: string; accountNumber: string; accountTitle: string; isActive: boolean }

// The account already using this title, other than `exceptId` (the account
// being edited). Inactive accounts count: their history still carries the name.
export function titleHolder(accounts: TitleHolder[], title: string, exceptId?: string): TitleHolder | null {
  const key = accountTitleKey(title)
  return accounts.find((a) => a.id !== exceptId && accountTitleKey(a.accountTitle) === key) ?? null
}

export function titleTakenMessage(holder: TitleHolder): string {
  const inactive = holder.isActive ? '' : ' (currently INACTIVE — show inactive accounts and reactivate it instead)'
  return `Account ${holder.accountNumber} is already named "${holder.accountTitle}"${inactive}. Each account name can be used only once.`
}
