// One card number, one card per branch (Hannah, 2026-11-09: "add the block and
// edit button"). The Greenhills Chinabank Prime card had been saved five times:
// cards could not be edited, and Remove only switches a card off, so fixing a
// name or bank code meant adding the card again. Numbers compare by digits only
// (spaces and dashes ignored).

export const cardDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export interface CardLike {
  id: string; bank: string; cardNumber: string; bankCode: string; isActive: boolean
  createdAt?: Date | string
}

/** The other card in the branch with the same number: an active one first, else the newest switched-off one. */
export function findSameCard<T extends CardLike>(branchCards: T[], cardNumber: unknown, exceptId?: string): { active: T | null; inactive: T | null } {
  const digits = cardDigits(cardNumber)
  if (!digits) return { active: null, inactive: null }
  const same = branchCards.filter(c => c.id !== exceptId && cardDigits(c.cardNumber) === digits)
  const time = (c: T) => (c.createdAt ? new Date(c.createdAt).getTime() : 0)
  const inactive = same.filter(c => !c.isActive).sort((a, b) => time(b) - time(a))[0] ?? null
  return { active: same.find(c => c.isActive) ?? null, inactive }
}

export const cardTail = (cardNumber: unknown) => `•••• ${cardDigits(cardNumber).slice(-4)}`

export function duplicateCardMessage(other: CardLike, editing = false): string {
  const saved = `${other.bank} (${other.bankCode})`
  if (editing) {
    return `This card number (${cardTail(other.cardNumber)}) is already saved as ${saved}${other.isActive ? '' : ', which is switched off'}. Each card number can be saved once per branch.`
  }
  return `This card (${cardTail(other.cardNumber)}) is already saved as ${saved}. Use the pencil on that card to change its name or bank code instead of adding it again.`
}
