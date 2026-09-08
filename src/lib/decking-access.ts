// Who may read and write which branch's decking board.
//
// Both branches SEE both boards: a patient gets coordinated across branches and
// front desk needs to look at the other side's week to do it.
//
// Writing is narrower. Face-to-face sessions belong to the branch whose room
// they occupy, so only that branch decks them. Teletherapy belongs to neither
// room — either branch can book a remote session with a consultant — so a
// teletherapy slot is editable from both.
//
// This is enforced here, on the server, because until now it was not enforced
// anywhere: the API accepted any branch from any signed-in user and the only
// thing stopping a branch front desk from editing the other branch's board was
// that the UI hid the toggle. A filter the client sends is a request, not a
// permission.

import { branchForRole } from '@/lib/role-branch'

/** Everyone signed in may READ any branch's board. */
export function canViewBranch(): boolean {
  return true
}

/**
 * May this role write a slot on `slotBranch` with this delivery mode?
 *
 * Unclassified slots (deliveryMode null) on another branch are NOT writable.
 * They pre-date the delivery-mode column, so there is no evidence they are
 * teletherapy — and treating "unknown" as "allowed" would hand the other
 * branch's face-to-face schedule to anyone who asked.
 */
export function canWriteSlot(
  role: string | null | undefined,
  slotBranch: string,
  deliveryMode: string | null | undefined,
): boolean {
  const own = branchForRole(role)
  if (!own) return true                    // admins are not branch-scoped
  if (slotBranch === own) return true      // your own branch, any kind of session
  return deliveryMode === 'TELETHERAPY'    // the other branch: teletherapy only
}

/** Message explaining a refusal, so the UI does not have to invent one. */
export const CROSS_BRANCH_DENIED =
  'This is another branch’s board. You can view it, but only teletherapy sessions can be edited across branches.'
