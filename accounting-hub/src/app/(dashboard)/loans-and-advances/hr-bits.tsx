// Small HR-look helpers shared by the Loans & Advances tabs.

/** 11px bold uppercase table header cell (on a `var(--hr-head)` row). */
export const TH = 'px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[.4px] whitespace-nowrap text-[var(--mid-gray)]'

/** Loading rows (needs the page's HrShimmerStyle). */
export function ShimmerRows({ cols, rows = 3 }: { cols: number; rows?: number }) {
  return <>{Array.from({ length: rows }, (_, i) => <tr key={i} className="border-t" style={{ borderColor: 'var(--hr-line)' }}><td colSpan={cols} className="px-4 py-2.5"><div className="h-5 rounded hr-shimmer" /></td></tr>)}</>
}
