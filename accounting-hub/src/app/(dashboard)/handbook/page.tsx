'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { BookOpen, Download, Printer } from 'lucide-react'

const TEAL = 'var(--deep-teal)'

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-xl font-bold mt-8 mb-2" style={{ color: 'var(--deep-teal)' }}>{children}</h2>
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold mt-5 mb-1.5" style={{ color: 'var(--gold, #b8863b)' }}>{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed mb-3" style={{ color: '#2b2f33' }}>{children}</p>
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1 mb-3 text-sm leading-relaxed" style={{ color: '#2b2f33' }}>{children}</ul>
}
function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-1 mb-3 text-sm leading-relaxed" style={{ color: '#2b2f33' }}>{children}</ol>
}
function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--pale-teal)', borderLeft: '4px solid var(--teal)', color: '#2b2f33' }}>
      <strong style={{ color: 'var(--deep-teal)' }}>{label} </strong>{children}
    </div>
  )
}
const y = '✔', n = '—'

export default function HandbookPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role

  if (status === 'unauthenticated') redirect('/login')
  if (status === 'authenticated' && role !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">The Handbook is available to the Clinic Manager (main admin) only.</div>
  }

  const matrix: [string, string, string, string, string, string, string][] = [
    ['Dashboard', y, y, y, n, y, n],
    ['Point of Sale', y, y, y, y, y, n],
    ['Services', y, y, y, y, y, n],
    ['PayMongo (online pay)', y, y, y, n, y, n],
    ['Asset Management', y, y, y, n, y, n],
    ['Petty Cash / Expenses', y, y, y, n, n, n],
    ['Cash Advances', y, y, y, n, n, n],
    ['Inventory & Procurement', y, y, y, n, n, n],
    ['Accounts Receivable', y, y, y, n, n, n],
    ['Payroll', y, y, y, y, n, n],
    ['Taxes / Fund Transfer', y, y, y, n, n, n],
    ['Equity', y, 'view', 'view', n, n, n],
    ['Loans & Advances', y, y, y, n, n, n],
    ['Scholars', y, y, y, n, n, n],
    ['Referral', y, y, y, y, y, y],
    ['Reports', y, y, y, n, n, y],
    ['Sales Summary', y, y, y, n, n, n],
    ['Products / Sales Analysis', y, n, n, n, n, n],
    ['Chart of Accounts / Ledger', y, y, y, n, n, n],
    ['Users & Settings', y, n, n, n, n, n],
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <style>{`@media print { body * { visibility: hidden } #handbook, #handbook * { visibility: visible } #handbook { position: absolute; left: 0; top: 0; width: 100% } .no-print { display: none } }`}</style>

      <div className="flex items-center gap-3 mb-1">
        <BookOpen size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Accounting Hub — User Handbook</h1>
        <div className="ml-auto flex items-center gap-2 no-print">
          <a href="/Accounting-Hub-User-Handbook.docx" download className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><Download size={14} /> Download (Word)</a>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--light-gray)', color: 'var(--mid-gray)' }}><Printer size={14} /> Print / Save as PDF</button>
        </div>
      </div>
      <p className="text-xs mb-6" style={{ color: 'var(--mid-gray)' }}>Visible to the Clinic Manager (main admin) only. Internal use — handle in confidence.</p>

      <div id="handbook">
        {/* 1. OVERVIEW */}
        <H2>1. Welcome &amp; Overview</H2>
        <P>The <strong>Accounting Hub</strong> runs the day-to-day money side of the clinics — point of sale, expenses, payroll, receivables, taxes, equity, referrals and reports. Each person sees only the parts their role allows, so some sections below may not appear on a given user&apos;s screen — that is normal.</P>

        <H3>1.1 Signing in</H3>
        <OL>
          <li>Open <strong>accounting.sapphireclinicseast.org</strong> in Chrome or Edge.</li>
          <li>Enter the <strong>email and password</strong> issued by the Clinic Manager. Never share a login.</li>
          <li>Branch users automatically see their branch (Aura Health East, Aura Health Greenhills, or Verdana).</li>
          <li>To leave, use the account menu to <strong>Sign out</strong> — a browser refresh does <em>not</em> log you out.</li>
        </OL>
        <Note label="Tip:">If a user sees &ldquo;Insufficient permissions&rdquo; right after a system update, have them fully <strong>sign out and back in</strong> — their session may hold an old copy of their role.</Note>

        <H3>1.2 The roles</H3>
        <UL>
          <li><strong>Clinic Manager (Main Admin)</strong> — full access to everything, plus user management and company settings.</li>
          <li><strong>Accountant</strong> — full bookkeeping access and can <strong>audit</strong> petty-cash/expense entries.</li>
          <li><strong>Bookkeeper</strong> — same as Accountant, except cannot do the final audit sign-off.</li>
          <li><strong>HR Officer / Payroll Officer</strong> — runs Payroll, plus Services, Point of Sale and Referral.</li>
          <li><strong>Front Desk</strong> — Point of Sale, Services, Asset Management, PayMongo, Dashboard and Referral, limited to their branch.</li>
          <li><strong>Medical Representative</strong> — Referral directory and Reports only.</li>
        </UL>

        <H3>1.3 Who can open what</H3>
        <P>✔ = available · — = not shown. (Admin = Clinic Manager; Acct. = Accountant; Book. = Bookkeeper; Payroll = HR/Payroll Officer.)</P>
        <div className="overflow-auto rounded-xl border mb-4" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--deep-teal)', color: 'white' }}>
                {['Module', 'Admin', 'Acct.', 'Book.', 'Payroll', 'Front Desk', 'MedRep'].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-semibold ${i === 0 ? 'text-left' : 'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((r, ri) => (
                <tr key={r[0]} style={{ background: ri % 2 ? '#f5f8f8' : 'white' }}>
                  {r.map((c, i) => <td key={i} className={`px-3 py-1.5 ${i === 0 ? 'text-left font-semibold' : 'text-center'}`} style={{ color: i === 0 ? '#2b2f33' : c === '—' ? '#9aa4ac' : TEAL }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note label="Note:">Accountant/Bookkeeper see <strong>Equity</strong> view-only (Preferred Shares); only the Clinic Manager edits equity. Only the Accountant (and Admin) can do the petty-cash <strong>audit</strong> sign-off.</Note>

        <H3>1.4 Getting around</H3>
        <UL>
          <li><strong>Left sidebar</strong> lists every module the user can open, grouped by area.</li>
          <li><strong>Global search</strong> — press <strong>⌘K / Ctrl-K</strong> to jump to a patient, order, supplier or account.</li>
          <li><strong>Notifications (🔔)</strong> — new concerns, forms and deadline reminders.</li>
          <li><strong>Download / Export</strong> — Excel and PDF buttons on most tables.</li>
          <li><strong>Uploads / Scan QR</strong> — attach documents or send a photo from a phone.</li>
          <li><strong>Filter &amp; sort</strong> — click a column header to sort; many tables have search and per-column filters.</li>
        </UL>

        {/* 2. ROLE GUIDES */}
        <H2>2. Role Guides</H2>

        <H3>2.1 Clinic Manager (Main Admin)</H3>
        <UL>
          <li><strong>Oversight</strong> — Dashboard, Reports, Sales Summary, and Sales/Products Analysis for trends.</li>
          <li><strong>People &amp; access</strong> — create staff accounts and set roles in <strong>Users</strong> (only you).</li>
          <li><strong>Company setup</strong> — Chart of Accounts, Beginning Balances, Budgets, and settings such as authorized shares (Equity).</li>
          <li><strong>Money movement</strong> — Fund Transfer, Taxes, Loans &amp; Advances, Equity, Scholars.</li>
          <li>Everything the other roles can do — POS, Payroll, Expenses, Receivables, PayMongo, Referral.</li>
        </UL>
        <Note label="Start here daily:">open the <strong>Dashboard</strong>, check <strong>🔔 notifications</strong>, then <strong>Reports</strong> or <strong>Sales Summary</strong> for yesterday.</Note>

        <H3>2.2 Accountant</H3>
        <OL>
          <li>Record and review <strong>Petty Cash</strong> and <strong>Expenses</strong> (one-time and recurring).</li>
          <li><strong>Audit</strong> entries — you (with Admin) give the final sign-off before they flow to reports and RFP.</li>
          <li>Prepare <strong>RFP / Billing Vouchers</strong>, then <strong>Taxes</strong> and <strong>Fund Transfers</strong>.</li>
          <li>Manage <strong>Accounts Receivable</strong> (HMO / Guarantee-Letter billing and collections).</li>
          <li>Maintain <strong>Loans &amp; Advances</strong>, <strong>Scholars</strong>; review <strong>Equity</strong> (view-only) and <strong>Reports</strong>.</li>
        </OL>
        <Note label="Reminder:">Assign a Chart-of-Accounts account to every entry, or it prints blank on the Billing Voucher (which lists items in the order they were entered).</Note>

        <H3>2.3 Bookkeeper</H3>
        <P>Same access as the Accountant — Petty Cash, Expenses, Inventory, Receivables, Payroll, Taxes, Fund Transfer, Loans, Equity (view), Reports — <strong>except you cannot perform the final audit sign-off</strong>. Record and prepare everything; the Accountant or Clinic Manager completes the audit.</P>

        <H3>2.4 HR Officer / Payroll Officer</H3>
        <P>You run pay for staff and consultants. You can open <strong>Payroll, Services, Point of Sale, and Referral</strong>.</P>
        <UL>
          <li><strong>Payroll</strong> — timekeeping upload, payroll register, employee &amp; consultant payslips, contributions, IEPR.</li>
          <li><strong>Services &amp; POS</strong> — view/maintain the catalogue and process sales when needed.</li>
        </UL>
        <Note label="Good to know:">Administration employees are excluded from consultant payslips automatically.</Note>

        <H3>2.5 Front Desk</H3>
        <P>Cashier and first point of contact. You can open <strong>Point of Sale, Services, Asset Management, PayMongo, Dashboard, and Referral</strong> — for your branch.</P>
        <UL>
          <li><strong>POS</strong> — ring up sessions/products, take payments (cash, card, GCash/Maya, HMO, Guarantee Letter, packages, wallet), apply discounts, record &ldquo;unpaid&rdquo; sessions, print receipts/invoices.</li>
          <li><strong>PayMongo</strong> — create online payment links for tuition/downpayments; they mark Paid and appear in POS Orders once paid.</li>
          <li><strong>Referral</strong> — see/add referred patients for referrers tagged to your branch.</li>
        </UL>
        <Note label="If a charge is denied:">confirm the session is fresh (sign out/in) — front-desk access is branch-based and needs a current login.</Note>

        <H3>2.6 Medical Representative</H3>
        <P>Manage the <strong>Referral</strong> directory and view <strong>Reports</strong>. Keep the Doctors / Law Firms / Partner Schools lists current, link <strong>referred patients</strong>, and use the <strong>Referral Dashboard</strong> for counts, net sales, and Top-5 referrers.</P>

        {/* 3. MODULE REFERENCE */}
        <H2>3. Module Reference</H2>
        <P>Step-by-step for each screen. Open only the ones in your sidebar.</P>

        <H3>Point of Sale (POS)</H3>
        <OL>
          <li>In <strong>Cashier</strong>, pick the branch, add services/products, set patient/clinician.</li>
          <li>Apply a discount (PWD/Senior 20% or a custom discount).</li>
          <li>Choose payment method(s) — split allowed; for HMO/GL pick the patient&apos;s wallet.</li>
          <li>Pay later? Save as <strong>Unpaid</strong> — the session is dated today; record cash on the collection day.</li>
          <li>Save and print the receipt / official invoice.</li>
        </OL>
        <P>Every sale becomes an <strong>Order</strong>: view, reprint, record payment, refund, void, or reopen (with reason). Voiding restores stock and reverses wallet/points and keeps the trail.</P>

        <H3>PayMongo (online payments)</H3>
        <OL>
          <li>Keep <strong>Record as a POS sale</strong> ticked; choose <strong>Payment type</strong> (Tuition = earned; Downpayment = unearned deposit) and branch.</li>
          <li><strong>+ Add a service</strong> — the branch price fills in; add a voucher/discount if needed.</li>
          <li><strong>Create payment link</strong> and send it (or show the QR).</li>
          <li>On payment it flips to <strong>Paid</strong>, records a POS Order net of the PayMongo fee (7140 Merchant Discount Rate), and holds the money in <strong>PayMongo Clearing</strong>.</li>
          <li>Set <strong>&ldquo;PayMongo deposits to&rdquo;</strong> to your bank once; payouts auto-reconcile to it.</li>
        </OL>
        <Note label="Test vs live:">In TEST MODE no real money moves and test links never post to the real books — delete them after testing. Real collection begins only in LIVE MODE.</Note>

        <H3>Services</H3>
        <UL>
          <li>Maintain name, department, branch, price, VAT, revenue account, HMO/GL tagging.</li>
          <li>Set a <strong>New Price</strong> + <strong>Effective Date</strong> to schedule a change automatically.</li>
          <li>Use <strong>Per-Branch Price Overrides</strong> when East and Greenhills charge differently.</li>
        </UL>

        <H3>Petty Cash &amp; Expenses</H3>
        <UL>
          <li><strong>Petty Cash</strong> — replenishment entries with PCV numbering and proof uploads.</li>
          <li><strong>Expenses</strong> — one-time and recurring; group audited entries into a <strong>Request for Payment (RFP)</strong> that prints as a <strong>Billing Voucher</strong>; record payment (cash/check/bank/credit card).</li>
          <li><strong>Suppliers</strong> — add/edit details, import via Excel, filter by <strong>Valid/Invalid</strong>, and click a supplier to see its transactions (date, description, valid/invalid, gross, VAT, net of VAT).</li>
        </UL>
        <Note label="Voucher order:">Billing-Voucher lines print in the order entered. Always set the <strong>Account Title</strong> on each entry.</Note>

        <H3>Cash Advances</H3>
        <P>Event floats: <strong>release</strong> cash (a receivable), <strong>liquidate</strong> against receipts (becomes expense), and <strong>return</strong> the unused balance — with proof at each step.</P>

        <H3>Payroll</H3>
        <OL>
          <li>Upload <strong>timekeeping</strong>.</li>
          <li>Generate the <strong>payroll register</strong>; use <strong>Pre-fill from Previous</strong> to carry items forward.</li>
          <li>Generate <strong>employee</strong> and <strong>consultant</strong> payslips (Administration excluded from consultant payslips).</li>
          <li>Record contributions, produce the <strong>IEPR</strong>, and download the bank file for release.</li>
        </OL>

        <H3>Accounts Receivable</H3>
        <P>Track <strong>HMO</strong> and <strong>Guarantee-Letter (GL)</strong> billings from POS (consumption-based). Click an HMO/GL total for the per-patient breakdown; record collections against it.</P>

        <H3>Taxes &amp; Fund Transfer</H3>
        <UL>
          <li><strong>Taxes</strong> — Withholding on Compensation, EWT, VAT, Business Tax, Corporate Income Tax; each can produce an RFP/Billing Voucher.</li>
          <li><strong>Fund Transfer</strong> — move funds between company bank accounts with a proper journal entry.</li>
        </UL>

        <H3>Equity</H3>
        <UL>
          <li>Cards: Total Capitalization, <strong>Authorized Shares</strong> (with editable <strong>Common</strong>/<strong>Founders</strong> sub-limits), Outstanding, <strong>Treasury</strong>, and <strong>Total Common / Total Founders</strong>.</li>
          <li>Tabs: Common Shares, Preferred Shares, Dividend Release History. Record issuances, buybacks (→ Treasury), dividends.</li>
          <li>An <strong>⚠ over-authorized alarm</strong> warns when a class exceeds its authorized limit — including when adding a shareholder that would breach the cap.</li>
          <li><strong>Download</strong> exports the shareholder list with Source (Original vs Purchase-from-Treasury) and Buyback dates.</li>
        </UL>

        <H3>Loans &amp; Advances</H3>
        <P>Record cash loans, advances and corporate bonds with a monthly/quarterly/bi-annual/annual schedule, principal-vs-interest split, the paying bank, and a tick-to-pay payment matrix.</P>

        <H3>Scholars</H3>
        <P>Live feed of approved scholars; record award terms, monthly stipend releases, and top-up appropriations against the Scholarship Fund.</P>

        <H3>Referral</H3>
        <UL>
          <li><strong>Referrers</strong> — three searchable, sortable cards: Doctors, Law Firms, Partner Schools. Each can be limited to a branch (untagged = all). Add/edit/CSV import.</li>
          <li><strong>Referred patients</strong> — link a patient (from the Operations Hub CRM) to a referrer; click a row for that patient&apos;s sessions (service, department, date, net amount).</li>
          <li><strong>Referral Dashboard</strong> — filter by Doctor/School/Law Firm; see count of referrals and total net sales per referrer, plus Top 5.</li>
        </UL>

        <H3>Reports, Sales Summary &amp; the rest</H3>
        <UL>
          <li><strong>Reports</strong> — Income Statement, Balance Sheet, cash flow; drill into revenue and receivables.</li>
          <li><strong>Sales Summary</strong> — daily cash-drawer reconciliation.</li>
          <li><strong>Products / Sales Analysis</strong> — Admin/Viewer only.</li>
          <li><strong>Chart of Accounts / Beginning Balances / Bank Reconciliation / Budgets</strong> — the ledger foundation.</li>
          <li><strong>Users &amp; Settings</strong> (Admin only) — create accounts and assign roles.</li>
        </UL>

        {/* 4. GOOD PRACTICE */}
        <H2>4. Good Practice &amp; Cautions</H2>
        <UL>
          <li><strong>One login per person</strong> — the system logs who did what.</li>
          <li><strong>Sign out</strong> on shared computers.</li>
          <li><strong>Attach proofs</strong> as you go — reports and vouchers depend on them.</li>
          <li><strong>Audit before paying</strong> — entries should be audited before an RFP.</li>
          <li><strong>Void, don&apos;t delete</strong>, a paid POS order.</li>
          <li><strong>Test PayMongo in TEST MODE first</strong>, delete test links, then switch to LIVE.</li>
          <li><strong>Blocked or wrong?</strong> Fully sign out and back in first; if it persists, report to the Clinic Manager with a screenshot.</li>
        </UL>
      </div>
    </div>
  )
}
