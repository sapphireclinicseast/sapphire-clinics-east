// A bank line left open on purpose, because the entry for its money is already
// posted. The line still has to be tied to that entry, and categorising it would
// post the same money a second time. The same prefix on a journal entry's
// description is what offers that entry in the Match picker.
export const FOR_MATCHING_PREFIX = '[FOR MATCHING]'

export const isForMatching = (text?: string | null) => !!text && text.startsWith(FOR_MATCHING_PREFIX)

export const forMatchingText = (text: string) => text.slice(FOR_MATCHING_PREFIX.length).trim()
