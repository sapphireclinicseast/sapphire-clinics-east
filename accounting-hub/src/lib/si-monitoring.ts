/**
 * Parser for the standardized SalesInvoiceFlag remarks written by the 2026-09-09
 * manual-SI-monitoring reconciliation (East branch, SI booklet history migrated
 * from the "SALES - Sales Invoice and CONSULTANTS INFO" workbook).
 *
 * A migrated flag carries its evidence only inside the remark text, in one of
 * two fixed shapes:
 *
 *   REMARKS:   "Manual SI monitoring (SALE 2025): 2025-10-23 - CUSTOMER - PHP 1,600.00"
 *              (the date is sometimes absent or literally "NA"; a few rows have
 *               customer+amount only)
 *   CANCELLED: "Cancelled per manual SI monitoring (SALE 2026) — CUSTOMER"
 *              (the customer tail is optional)
 *
 * Parsing this format lets the With SI table and the Sales Summary report show
 * real Date / Customer / Amount columns for migrated invoices without a schema
 * change (flag rows have no linked Order). A remark that doesn't match returns
 * null and the caller falls back to showing the raw remark.
 */

export interface MonitoringInfo {
  tab: string
  date: string | null // YYYY-MM-DD
  customer: string | null
  amount: number | null // gross
  netAmount: number | null // present when the workbook recorded a PWD/SC-discounted net
  cancelled: boolean
}

export function parseMonitoringRemark(remarks: string | null | undefined): MonitoringInfo | null {
  if (!remarks) return null

  const cancelled = remarks.match(/^Cancelled per manual SI monitoring \(([^)]+)\)(?:\s*[—-]\s*(.+))?$/)
  if (cancelled) {
    return { tab: cancelled[1], date: null, customer: cancelled[2]?.trim() || null, amount: null, netAmount: null, cancelled: true }
  }

  const m = remarks.match(/^Manual SI monitoring \(([^)]+)\):\s*(.*)$/)
  if (!m) return null
  const tab = m[1]
  let tail = m[2].trim()
  if (!tail) return { tab, date: null, customer: null, amount: null, netAmount: null, cancelled: false }

  let date: string | null = null
  const d = tail.match(/^(\d{4}-\d{2}-\d{2})\s*-\s*/)
  if (d) {
    date = d[1]
    tail = tail.slice(d[0].length)
  } else if (/^NA\s*-\s*/i.test(tail)) {
    tail = tail.replace(/^NA\s*-\s*/i, '')
  }

  let amount: number | null = null
  let netAmount: number | null = null
  const a = tail.match(/\s-\sPHP\s([\d,]+(?:\.\d+)?)(?:\s-\sNET\sPHP\s([\d,]+(?:\.\d+)?))?$/)
  if (a) {
    amount = parseFloat(a[1].replace(/,/g, ''))
    if (a[2]) netAmount = parseFloat(a[2].replace(/,/g, ''))
    tail = tail.slice(0, tail.length - a[0].length)
  }

  const customer = tail.trim() || null
  return { tab, date, customer, amount, netAmount, cancelled: false }
}
