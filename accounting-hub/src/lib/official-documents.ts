// Official Documents: business papers are renewed yearly, so the page lists them
// under a year that opens on click (Hannah, 2026-11-06), and the bell only counts
// a paper's latest year.

const YEAR = /\b20\d{2}\b/

export const NO_YEAR = 'No year'

// A year in the title wins, because some papers carry no dates and a renewal can
// be issued the year before.
export const docYear = (d: { title: string; expiryDate: string | null; issuedDate: string | null }) =>
  d.title.match(YEAR)?.[0] || d.expiryDate?.slice(0, 4) || d.issuedDate?.slice(0, 4) || NO_YEAR

// "Business Permit 2024" stops counting once the same branch has "Business Permit 2026".
export function latestRenewals<T extends { category: string; branch: string | null; title: string; expiryDate: Date | null }>(docs: T[]): T[] {
  const paper = (d: T) => [d.category, d.branch, d.title.replace(YEAR, ' ').replace(/\s+/g, ' ').trim().toUpperCase()].join('|')
  const latest = new Map<string, number>()
  for (const d of docs) latest.set(paper(d), Math.max(latest.get(paper(d)) ?? 0, d.expiryDate?.getTime() ?? 0))
  return docs.filter(d => (d.expiryDate?.getTime() ?? 0) === latest.get(paper(d)))
}
