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
    ['Sales Summary', y, y, y, n, y, n],
    ['Products / Sales Analysis', y, n, n, n, n, n],
    ['Chart of Accounts / Ledger', y, y, y, n, n, n],
    ['Users & Settings', y, n, n, n, n, n],
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <style>{`@media print { body * { visibility: hidden } #handbook, #handbook * { visibility: visible } #handbook { position: absolute; left: 0; top: 0; width: 100% } .no-print { display: none } #handbook img { max-width: 100% !important; page-break-inside: avoid } #handbook figure { page-break-inside: avoid } #handbook h2, #handbook h3 { page-break-after: avoid } }`}</style>

      <div className="flex items-center gap-3 mb-1">
        <BookOpen size={24} className="text-teal-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Accounting Hub — User Handbook</h1>
        <div className="ml-auto flex items-center gap-2 no-print">
          <a href="/Accounting-Hub-User-Handbook.docx" download className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--teal)' }}><Download size={14} /> Download Word</a>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--deep-teal)' }}><Printer size={14} /> Download PDF</button>
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
        <P>Cashier and first point of contact. You can open <strong>Point of Sale, Services, Asset Management, PayMongo, Dashboard, Sales Summary, and Referral</strong> — for your branch.</P>
        <UL>
          <li><strong>POS</strong> — ring up sessions/products, take payments (cash, card, GCash/Maya, HMO, Guarantee Letter, packages, wallet), apply discounts, record &ldquo;unpaid&rdquo; sessions, print receipts/invoices.</li>
          <li><strong>PayMongo</strong> — create online payment links for tuition/downpayments; they mark Paid and appear in POS Orders once paid.</li>
          <li><strong>Referral</strong> — see/add referred patients for referrers tagged to your branch.</li>
        </UL>
        <Note label="If a charge is denied:">confirm the session is fresh (sign out/in) — front-desk access is branch-based and needs a current login.</Note>

        <H3>2.6 Medical Representative</H3>
        <P>Manage the <strong>Referral</strong> directory and view <strong>Reports</strong>. Keep the Doctors / Law Firms / Partner Schools lists current, link <strong>referred patients</strong>, and use the <strong>Referral Dashboard</strong> for counts, net sales, and Top-5 referrers.</P>

        {/* 3. DETAILED SECTION-BY-SECTION GUIDE */}
        <H2>3. Detailed Section-by-Section Guide</H2>
        <P>Every screen in the sidebar, explained — including each screen&apos;s <strong>tabs</strong>. Open only the ones your role shows. Sections are grouped the same way as the sidebar: <em>Overview</em>, <em>General Ledger</em>, <em>Transactions</em>, and <em>Planning &amp; Analysis</em>.</P>

        <H3>3.1 Dashboard <span style={{ fontWeight: 400, color: 'var(--mid-gray)' }}>(Overview)</span></H3>
        <P>The landing page. Shows today&apos;s and this month&apos;s sales, cash position, and quick counts. Use it as your morning check together with the <strong>🔔 notification bell</strong> (new concerns, submitted forms, and deadline reminders such as the 5th-of-month service invoice).</P>

        <H3>3.2 Chart of Accounts <span style={{ fontWeight: 400, color: 'var(--mid-gray)' }}>(General Ledger)</span></H3>
        <P>The master list of accounts — every peso lands in one of these. Each account has a <strong>number</strong> (e.g. 7010 Physical Therapy Revenue, 2070 PPE &amp; Lease Improvements), a <strong>type</strong> (Asset / Liability / Equity / Revenue / Expense), and flags such as <strong>&ldquo;is a bank account.&rdquo;</strong> This is the backbone every other screen posts to. Add or edit accounts here; the ⌘K global search can jump straight to one.</P>

        <H3>3.3 Beginning Balances &amp; Bank Reconciliation</H3>
        <UL>
          <li><strong>Beginning Balances</strong> — the opening figure per account for a year (e.g. each bank&apos;s starting balance). Bank reconciliation only counts Hub entries on/after the balance&apos;s start date.</li>
          <li><strong>Bank Reconciliation</strong> — match the Hub&apos;s recorded bank movements against the actual bank statement, and tick off what has cleared. Fund transfers, PayMongo payouts, and payments all surface here for matching.</li>
        </UL>

        <H3>3.4 Petty Cash <span style={{ fontWeight: 400, color: 'var(--mid-gray)' }}>(Transactions)</span></H3>
        <P>The small-cash log. Each entry gets a <strong>PCV number</strong>, an account, a supplier, an amount (with VAT split), and a <strong>proof upload</strong>. Entries are reviewed and <strong>audited</strong> before they flow into reports and can be reimbursed. Locked once used in a reimbursement.</P>

        <H3>3.5 Expenses</H3>
        <P>The main payables workspace. Its tabs:</P>
        <UL>
          <li><strong>Recurring</strong> — repeating bills (rent, utilities, subscriptions); the system schedules them and reminds you before they are due. Supports prepaid amortization.</li>
          <li><strong>One-time</strong> — ad-hoc purchases.</li>
          <li><strong>Credit Card Report</strong> — expenses charged to a company card, grouped for the statement.</li>
          <li><strong>Expense Report</strong> — the consolidated paid-expenses view, with a <strong>Source</strong> column (One-time, Recurring, Petty Cash, Salaries, Benefits, Cash Advance).</li>
          <li><strong>Suppliers</strong> — the vendor directory. <strong>Add / edit</strong> details, import via Excel, filter by <strong>Valid / Invalid</strong> (a supplier with both is treated as Valid), and <strong>click a supplier</strong> to see all its transactions — date, description, valid/invalid, gross, VAT, and net of VAT.</li>
        </UL>
        <P>Audited entries are grouped into a <strong>Request for Payment (RFP)</strong> that prints as a <strong>Billing Voucher</strong>; then record the payment (cash / check / bank / credit card).</P>
        <Note label="Voucher order &amp; accounts:">Billing-Voucher lines print in the exact order they were entered. Always set the <strong>Account Title</strong> on every entry — a blank account prints blank on the voucher.</Note>

        <H3>3.6 Cash Advances</H3>
        <P>For event floats and staff advances. <strong>Release</strong> cash (recorded as a receivable — money owed back to the company), <strong>liquidate</strong> it against receipts (the spent portion becomes an expense), and <strong>return</strong> the unused balance. Proof is attached at each step, and liquidations also appear in the Expense Report tagged &ldquo;Cash Advance.&rdquo;</P>

        <H3>3.7 Inventory &amp; Procurement</H3>
        <UL>
          <li><strong>Inventory</strong> — stock on hand, opening batches, consumption, and freight capitalization; product stock can auto-sync with the store by SKU.</li>
          <li><strong>Forms</strong> subtab — attach and track operational forms. The list of available forms is pulled live from the <strong>HR Hub Templates</strong> catalogue (see Section 4).</li>
        </UL>

        <H3>3.8 Asset Management</H3>
        <P>The <strong>fixed-asset register</strong> (the audit&apos;s official asset list). Each asset carries a control number (e.g. AHEA-2024-0007), cost, purchase date, <strong>classification</strong> (which PPE account it belongs to, e.g. 2050 Furniture, 2070 PPE &amp; Lease Improvements), useful life, monthly depreciation, custodian, supplier, and photos. Front desk can add/rename; only Admin/Accountant/Bookkeeper/branch-admin can delete.</P>

        <H3>3.9 Services</H3>
        <UL>
          <li>Maintain each service&apos;s name, department, branch, price, VAT, revenue account, and HMO/GL tagging.</li>
          <li>Schedule a change with a <strong>New Price</strong> + <strong>Effective Date</strong> (e.g. SPED PT +10% from Aug 1).</li>
          <li>Use <strong>Per-Branch Price Overrides</strong> when East and Greenhills charge differently.</li>
        </UL>

        <H3>3.10 Point of Sale (POS)</H3>
        <P>The cashier and order book. Its areas:</P>
        <UL>
          <li><strong>Cashier</strong> — pick branch, add services/products, set patient/clinician, apply a discount (PWD/Senior 20% or a custom discount), take payment (cash, card, GCash/Maya, HMO, Guarantee Letter, package/wallet), or save as <strong>Unpaid</strong> to collect later. Print receipt / official invoice.</li>
          <li><strong>Orders</strong> — every sale becomes an order you can view, reprint, record payment on, refund, void, or reopen (with a reason). Voiding restores stock, reverses wallet/points, and keeps the audit trail.</li>
          <li><strong>Discount Settings</strong> — define reusable discounts. Each can be limited to specific <strong>departments</strong> (tick/untick), tied to a wallet type, and mapped to a discount account.</li>
          <li><strong>Referrers</strong> were moved out of POS into their own <strong>Referral</strong> section.</li>
        </UL>

        <H3>3.11 PayMongo (online payments)</H3>
        <OL>
          <li>Keep <strong>Record as a POS sale</strong> ticked; choose <strong>Payment type</strong> (Tuition = earned; Downpayment = unearned deposit) and branch.</li>
          <li><strong>+ Add a service</strong> — the branch price fills in; add a voucher/discount if needed.</li>
          <li><strong>Create payment link</strong> and send it (or show the QR); delete a link while it is still unpaid if it was a mistake.</li>
          <li>On payment it flips to <strong>Paid</strong>, records a POS Order net of the PayMongo fee (<strong>7140 Merchant Discount Rate</strong>), and parks the money in <strong>PayMongo Clearing</strong>.</li>
          <li>Set <strong>&ldquo;PayMongo deposits to&rdquo;</strong> to your bank once; payouts then auto-reconcile to it. Use <strong>Sync</strong> if a paid link did not update.</li>
        </OL>
        <Note label="Test vs live:">In TEST MODE no real money moves and test links never post to the real books — delete them after testing. Real collection begins only in LIVE MODE.</Note>

        <H3>3.12 Referral</H3>
        <UL>
          <li><strong>Referrers</strong> — three searchable, sortable cards: <strong>Doctors</strong>, <strong>Law Firms</strong>, <strong>Partner Schools</strong>. Each referrer can be limited to a branch (untagged = all branches). Add / edit / CSV import; Affiliation &amp; Specialization show only for Doctors.</li>
          <li><strong>Referred Patients</strong> — link a patient (searched from the <strong>Operations Hub</strong> patient CRM) to a referrer; click a row to see that patient&apos;s sessions with service, <strong>department</strong>, date, and net amount.</li>
          <li><strong>Referral Dashboard</strong> — tick which types to include; see the count of referrals and total net sales per referrer, plus the Top 5.</li>
        </UL>

        <H3>3.13 Accounts Receivable</H3>
        <P>Tracks <strong>HMO</strong> and <strong>Guarantee-Letter (GL)</strong> billings that come from POS on a consumption basis. Click an HMO/GL total for the per-patient breakdown, then record collections against it.</P>

        <H3>3.14 Payroll</H3>
        <OL>
          <li>Upload <strong>timekeeping</strong>.</li>
          <li>Generate the <strong>payroll register</strong>; use <strong>Pre-fill from Previous</strong> to carry items forward.</li>
          <li>Generate <strong>employee</strong> and <strong>consultant</strong> payslips (Administration staff are auto-excluded from consultant payslips).</li>
          <li>Record government contributions, produce the <strong>IEPR</strong>, and download the bank file for release.</li>
        </OL>
        <P>Staff records feed in automatically — Aura Health East/Greenhills from the Operations Hub, Verdana from the HR Hub (see Section 4).</P>

        <H3>3.15 Taxes</H3>
        <P>Six tabs, one per obligation: <strong>Withholding on Compensation</strong>, <strong>Expanded Withholding (EWT)</strong>, <strong>VAT</strong>, <strong>Business Tax</strong>, <strong>Corporate Income Tax</strong>, and an <strong>RFP</strong> tab. Each computes the figure and can produce a Request for Payment / Billing Voucher with continuous numbering.</P>

        <H3>3.16 Fund Transfer</H3>
        <P>Move money between the company&apos;s own bank accounts. The transfer posts a proper journal entry (out of one bank, into another) and both sides show up in Bank Reconciliation.</P>

        <H3>3.17 Equity</H3>
        <UL>
          <li><strong>Cards</strong> — Total Capitalization, <strong>Authorized Shares</strong> (with editable <strong>Common</strong> and <strong>Founders</strong> sub-limits), Outstanding, <strong>Treasury</strong>, and <strong>Total Common / Total Founders</strong> counts.</li>
          <li><strong>Tabs</strong> — <strong>Common Shares</strong>, <strong>Preferred Shares</strong>, and <strong>Dividend Release History</strong>. Record issuances, buybacks (which move shares into Treasury), and dividend releases.</li>
          <li>An <strong>⚠ over-authorized alarm</strong> warns when a class would exceed its authorized limit — including at the moment you add a shareholder that would breach the cap.</li>
          <li><strong>Download</strong> exports the shareholder list with <strong>Source</strong> (Original vs Purchase-from-Treasury) and <strong>Buyback date(s)</strong>.</li>
          <li>Accountant/Bookkeeper see this view-only (Preferred tab); only the Clinic Manager edits equity. The same equity figures are shown in the HR Hub Shareholders module (Section 4).</li>
        </UL>

        <H3>3.18 Loans &amp; Advances</H3>
        <P>Records cash loans, advances, and corporate bonds. Set the schedule (monthly / quarterly / bi-annual / annual), the principal-vs-interest split, and the paying bank; a <strong>tick-to-pay matrix</strong> marks each period paid. Loan charges post as expenses.</P>

        <H3>3.19 Scholars</H3>
        <P>A <strong>live feed of approved scholars</strong> coming from the Staff Portal (Section 4). Record award terms and <strong>monthly stipend releases</strong> (posted against the Scholarship Fund), and <strong>top-up appropriations</strong> that refill the fund. A near-due popup flags releases coming up in 3 days.</P>

        <H3>3.20 Budgets</H3>
        <P>Set expected figures per account/period and compare them against actuals so you can see where spending is over or under plan.</P>

        <H3>3.21 Reports <span style={{ fontWeight: 400, color: 'var(--mid-gray)' }}>(Planning &amp; Analysis)</span></H3>
        <P>The financial statements: <strong>Income Statement</strong>, <strong>Balance Sheet</strong>, and cash flow, with drill-downs into revenue and receivables. Revenue is built from POS orders plus the general-ledger journal, with payroll and POS entries excluded from the journal fold so nothing double-counts.</P>

        <H3>3.22 Sales Summary</H3>
        <P>Transaction-level sales with invoice tracking. Choose a branch and date range, then work in its three tabs:</P>
        <UL>
          <li><strong>Summary</strong> — every sales line for the period, split into <strong>Report 1 — With Official Sales Invoice</strong> and <strong>Report 2 — Without Sales Invoice</strong>, each with its own subtotal and a combined Gross/Net bar. Columns: Date, Order #, Patient, Service, Qty, SI No., Gross, Net. <strong>Click any column heading to sort ascending/descending, and type in the box under a heading to filter that column.</strong> Export CSV / Print reflect exactly what you have filtered.</li>
          <li><strong>With SI</strong> — reconciles your official Sales Invoice booklet. The left <strong>Sales Invoices</strong> list shows every used SI number (also <strong>sortable and filterable</strong> by SI No., Date, Patient, or Amount); the right <strong>Flagged Sales Invoices</strong> panel lists missing (gap) and duplicate numbers so you can declare them Cancelled, add Remarks, or Tag them to the correct order.</li>
          <li><strong>Sales Target</strong> — pick a month/year and branch to compare <strong>Sales with SI</strong> against the <strong>Target</strong> you set, showing the difference (below target / target met). Only Admin/Accountant/Bookkeeper can edit the target.</li>
        </UL>

        <H3>3.23 Products Analysis &amp; Sales Analysis</H3>
        <P>Trend views for the Clinic Manager, branch admins, and Viewer (not Accountant/Bookkeeper). <strong>Products Analysis</strong> looks at what sells; <strong>Sales Analysis</strong> looks at sales trends over time.</P>

        <H3>3.24 Users &amp; Handbook <span style={{ fontWeight: 400, color: 'var(--mid-gray)' }}>(Administration)</span></H3>
        <UL>
          <li><strong>Users</strong> (Admin only) — create staff accounts and assign roles; roles control exactly what each person sees.</li>
          <li><strong>Handbook</strong> (Admin only) — this document, readable in-app and downloadable as Word/PDF.</li>
        </UL>

        {/* 4. HOW THE SYSTEMS CONNECT */}
        <H2>4. How the Accounting Hub Connects to the Other Systems</H2>
        <P>The clinics run on four connected systems. The Accounting Hub does not re-type data that already lives elsewhere — instead, specific pieces of information are shared automatically between them over a secure key. Here is what each system is and what flows in or out of Accounting.</P>
        <UL>
          <li><strong>Operations Hub</strong> (operations.sapphireclinicseast.org) — bookings, schedules, and the <strong>patient CRM</strong> for the Aura Health branches.</li>
          <li><strong>HR Hub</strong> — staff records, HR forms/templates, and a shareholders view.</li>
          <li><strong>Staff Portal</strong> (staff.sapphireclinicseast.org) — the staff-facing portal, including the scholarship/scholars programme.</li>
          <li><strong>Accounting Hub</strong> — this system (money, sales, payroll, reports).</li>
        </UL>

        <H3>4.1 What flows in and out</H3>
        <div className="overflow-auto rounded-xl border mb-4" style={{ borderColor: 'var(--light-gray)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--deep-teal)', color: 'white' }}>
                {['Information', 'Direction', 'Used in Accounting for'].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-semibold ${i === 1 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ['Patients (CRM)', 'Operations Hub → Accounting', 'Referral → Referred Patients search; the per-patient session drill-down; patient lookup in POS'],
                ['Staff & consultants — Aura Health East / Greenhills', 'Operations Hub → Accounting', 'Payroll register & payslips for the two Aura Health branches'],
                ['Staff — Verdana', 'HR Hub → Accounting', 'Payroll register & payslips for Verdana'],
                ['HR form templates', 'HR Hub → Accounting', 'The Forms dropdown inside Inventory & Procurement'],
                ['Approved scholars', 'Staff Portal → Accounting', 'The live feed on the Scholars screen; stipend releases'],
                ['Equity / shareholder figures', 'Accounting → HR Hub', 'The Shareholders module in the HR Hub reads Common/Preferred equity from here'],
                ['Sales & session data', 'Within Accounting', 'Feeds Reports, Sales Summary, Accounts Receivable, and the Referral dashboard'],
              ] as [string, string, string][]).map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? '#f5f8f8' : 'white' }}>
                  <td className="px-3 py-1.5 text-left font-semibold" style={{ color: '#2b2f33' }}>{r[0]}</td>
                  <td className="px-3 py-1.5 text-center" style={{ color: TEAL }}>{r[1]}</td>
                  <td className="px-3 py-1.5 text-left" style={{ color: '#2b2f33' }}>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note label="In plain terms:">Accounting mostly <strong>receives</strong> people and patients (so you never re-type staff or patient lists) and <strong>supplies</strong> the equity figures the HR Hub displays. Sales, receivables, and reports are all built from the orders created here.</Note>

        <H3>4.2 Why it matters</H3>
        <UL>
          <li>If a <strong>patient</strong> is missing in Referral or POS search, they are usually added first in the <strong>Operations Hub</strong> CRM — the Accounting Hub reads that list.</li>
          <li>If a <strong>staff member</strong> is missing from Payroll, fix it at the source — Operations Hub for Aura Health, HR Hub for Verdana — and it syncs across.</li>
          <li>If a <strong>form</strong> is missing from the Inventory Forms dropdown, it is added in the <strong>HR Hub</strong> Templates catalogue.</li>
          <li>If the <strong>Shareholders</strong> figures look wrong in the HR Hub, correct them in <strong>Equity</strong> here — the HR Hub only displays what Accounting supplies.</li>
          <li>A one-time exception around a system rename can leave a login holding an old role — a full <strong>sign out and back in</strong> refreshes it.</li>
        </UL>

        {/* 5. GOOD PRACTICE */}
        <H2>5. Good Practice &amp; Cautions</H2>
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
