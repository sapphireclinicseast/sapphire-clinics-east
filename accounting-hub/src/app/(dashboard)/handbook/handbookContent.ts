/* ------------------------------------------------------------------ */
/*  Accounting Hub — User Handbook CONTENT (single source)              */
/*  Edit the SECTIONS array to update the handbook. Both the in-app     */
/*  page and the Word/PDF generator read from here.                     */
/*  Text supports **bold** mini-markdown.                              */
/* ------------------------------------------------------------------ */

export type Block =
  | { k: 'p'; t: string }
  | { k: 'sub'; t: string }
  | { k: 'steps'; items: string[] }
  | { k: 'ul'; items: string[] }
  | { k: 'note'; label: string; t: string }
  | { k: 'table'; head: string[]; rows: string[][] }
  | { k: 'faq'; q: string; a: string }

export type Section = { id: string; num: string; group: string; title: string; tag?: string; blocks: Block[] }

/* Groups render in this order, both in the Table of Contents and the body. */
export const GROUP_ORDER = [
  'Getting Started',
  'Overview',
  'General Ledger',
  'Transactions',
  'Planning & Analysis',
  'Administration',
  'Reference',
  'Help & FAQ',
]

export const SECTIONS: Section[] = [
  /* ===================== GETTING STARTED ===================== */
  {
    id: 'welcome', num: '1', group: 'Getting Started', title: 'Welcome — what this system is',
    blocks: [
      { k: 'p', t: `The **Accounting Hub** runs the money side of the clinics and store — sales at the counter, expenses, payroll, receivables, taxes, equity, referrals and the financial reports. This handbook is a step-by-step guide written for someone using the system for the **first time**. Read Getting Started once, then jump to the section you need using the **word search** or the **Table of Contents** at the top.` },
      { k: 'p', t: `Everything is in **Philippine pesos (₱)**. The company runs four branches/units: **Aura Health East (AHEA)**, **Aura Health Greenhills (AHGH)**, **Verdana Store**, and **Aura Health Institute**. You will see these names in almost every screen's branch picker.` },
      { k: 'note', label: 'You only see what your role allows.', t: `The menu on the left shows only the screens your account is permitted to open, so some sections in this handbook may not appear on your screen — that is normal, not a fault.` },
    ],
  },
  {
    id: 'signing-in', num: '1.1', group: 'Getting Started', title: 'Signing in and out',
    blocks: [
      { k: 'steps', items: [
        `Open **accounting.sapphireclinicseast.org** in Google Chrome or Microsoft Edge.`,
        `Type the **email and password** the Clinic Manager gave you, then press **Sign in**. Never share your login — the system records who did what under your name.`,
        `You land on the **Dashboard**. Branch users are automatically limited to their own branch.`,
        `To leave, click your **name/initials at the top-right** and choose **Sign out**. Closing the tab or refreshing the page does **not** sign you out.`,
      ] },
      { k: 'note', label: 'Says "Insufficient permissions" or a screen looks wrong?', t: `Fully **Sign out and back in** first — your browser may be holding an old copy of your access. If it still happens, tell the Clinic Manager with a screenshot.` },
    ],
  },
  {
    id: 'roles', num: '1.2', group: 'Getting Started', title: 'The roles — who can do what',
    blocks: [
      { k: 'p', t: `Your **role** decides which screens you see and whether you can only view or also edit. Roles are set by the Clinic Manager in **Users**. These are the roles the system offers:` },
      { k: 'ul', items: [
        `**Administrator (Clinic Manager)** — full access to everything, plus Users and company settings.`,
        `**Accountant** — full bookkeeping access and can do the **audit** sign-off on petty-cash and expense entries.`,
        `**Bookkeeper** — same as Accountant **except** the final audit sign-off, and no Sales/Products Analysis.`,
        `**Payroll Officer** — Payroll, plus Services and Point of Sale.`,
        `**Front Desk (AHEA / AHGH)** — Point of Sale, Services, Asset Management, PayMongo, Quotations, Dashboard, Sales Summary and Referral — limited to their branch.`,
        `**HMO Officer** — the HMO side of Accounts Receivable (and Chart of Accounts, read paths).`,
        `**Medical Representative** — the Referral directory and Reports (revenue only).`,
        `**Investor** — the Financial Reports and the Investor Subsidiary Ledger, view-only, with no patient-level detail.`,
        `**Viewer** — a read-only view across most finance screens.`,
        `**Branch Admins (AHEA / AHGH / Verdana)** — full finance access scoped to their branch.`,
      ] },
      { k: 'note', label: 'View-only vs edit.', t: `Many people can **open** a screen but only Admin/Accountant/Bookkeeper can **change** it. When you cannot edit, the create/edit buttons simply do not appear. Money-movement screens (Taxes, Cash Advances, Accounts Payable, General Journal, Unearned Revenue, Fund Transfer, Equity, Loans & Advances, Scholars) are limited to Admin/Accountant/Bookkeeper.` },
    ],
  },
  {
    id: 'getting-around', num: '1.3', group: 'Getting Started', title: 'Getting around the screen',
    blocks: [
      { k: 'ul', items: [
        `**Left sidebar** — every screen you can open, grouped into **Overview**, **General Ledger**, **Transactions**, **Planning & Analysis** and **Administration**. On a phone, tap the **☰ menu** button to open it.`,
        `**Top search box** — the box in the middle of the top bar (or press **⌘K / Ctrl-K**) jumps straight to a specific **order, supplier, inventory item, expense, account, asset or journal entry**. Type at least 2 characters; pick a result to open that record.`,
        `**Your account menu** — top-right, shows your name and role; this is where **Sign out** lives.`,
        `**Branch picker** — most screens have a branch selector (buttons or a dropdown) near the top. Pick the branch you are working on first; branch users are locked to their own.`,
        `**Download / Export** — most tables have **Excel / CSV / PDF** buttons to save or print what is on screen.`,
        `**Upload / proof** — a small upload or "scan" control attaches a receipt or document; you can send a photo from a phone.`,
        `**Sort & filter** — click a **column heading** to sort; many tables have a search box or a small filter box under each heading.`,
      ] },
    ],
  },
  {
    id: 'buttons', num: '1.4', group: 'Getting Started', title: 'Buttons and words you will see everywhere',
    blocks: [
      { k: 'p', t: `The same building blocks repeat across the whole system. Learn these once:` },
      { k: 'ul', items: [
        `**Add / ＋ New …** — a teal button (usually top-right) that opens a blank form to create something. Fill the form, then **Save** / **Add** / **Create**.`,
        `**Edit (pencil)** — change an existing row. **Delete (trash)** — remove it; the system asks you to confirm and, where money is involved, reverses the related bookkeeping entry.`,
        `**Audited** — for expenses and petty cash, a **Yes/No** the Accountant sets to approve an entry before it can be paid.`,
        `**RFP (Request for Payment)** — a batch of approved entries grouped for payment. It prints as a **Billing Voucher** and is later marked **Record as Paid**.`,
        `**Journal entry** — the underlying bookkeeping record (debit = one account, credit = another). Screens post these for you; the **General Journal** lets you write them by hand.`,
        `**Valid / Invalid** — a supplier or expense is "Valid" if it has proper BIR documents (official receipt, TIN); "Invalid" if not. RFPs are grouped by validity.`,
        `**Proof** — an uploaded receipt, deposit slip or document. Attach it as you go; reports and vouchers rely on it.`,
        `**Lock / Finalize** — freezes records (e.g. a payroll run) so they cannot be edited; unlocking reverses that.`,
      ] },
      { k: 'note', label: 'Golden rule.', t: `If a button will move money or send something outward — **Complete Order, Record as Paid, Generate RFP, Lock Payroll, Void, Delete** — read the confirmation before clicking. Prefer **Void** over **Delete** for anything already paid, so the audit trail stays intact.` },
    ],
  },

  /* ===================== OVERVIEW ===================== */
  {
    id: 'dashboard', num: '2', group: 'Overview', title: 'Dashboard', tag: 'Overview',
    blocks: [
      { k: 'p', t: `The first screen after you sign in ("**Welcome back, {your name}**"). It is a grid of **tiles**, one per module — click a tile to open that screen. There are no tabs.` },
      { k: 'sub', t: 'What you will see' },
      { k: 'ul', items: [
        `**Module tiles** — each shows an icon, a name and a small **Active** or **Coming Soon** badge. Click any Active tile to jump there.`,
        `**Recurring expense reminders** — a card near the top listing bills that are due, each with a **Due today / Due tomorrow / Due in N days** badge; it links to **Expenses**.`,
        `**Pending Queue** (front desk only) — sales that were started but not yet turned into an order for your branch.`,
      ] },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Read the greeting and the **Recurring expense reminders** to see what is due.`,
        `Click the tile for the screen you need (or use the sidebar / top search box).`,
      ] },
      { k: 'note', label: 'Good to know.', t: `Some roles skip the tiles and open straight to their main screen — HMO Officer opens **Accounts Receivable**; Medical Rep and Investor open **Reports**. Front desk see only the **Point of Sale** and **Services** tiles.` },
    ],
  },

  /* ===================== GENERAL LEDGER ===================== */
  {
    id: 'chart-of-accounts', num: '3', group: 'General Ledger', title: 'Chart of Accounts', tag: 'General Ledger',
    blocks: [
      { k: 'p', t: `The **master list of accounts** — every peso the business handles is filed under one of these. Think of it as the labelled folders the whole system posts into (e.g. **7010 Physical Therapy Revenue**, **4010 Accounts Payable**, **2070 PPE & Lease Improvements**). Subtitle on screen: "Manage your general ledger account structure."` },
      { k: 'sub', t: 'The table' },
      { k: 'p', t: `Columns: **Account No. · Account Title · Type · Sub Type · Normal Balance · Currency · Description · Actions.** Use the search/filter bar at the top to find an account; **Download** exports the list to Excel or PDF.` },
      { k: 'sub', t: 'Add an account' },
      { k: 'steps', items: [
        `Click **Add Account** (teal, top-right).`,
        `Enter the **Account Number** and **Account Title**.`,
        `Pick the **Account Type** — Asset, Liability, Equity, Revenue or Expense. This auto-sets the **Normal Balance** (Debit or Credit), which you can override.`,
        `Choose a **Sub Type** (and, for inventory/sales/cost-of-sales accounts, a **Sub-Sub Type** such as Department). Leave **Currency** as PHP unless it is a foreign account. Add a **Description** if useful.`,
        `Click **Add Account**.`,
      ] },
      { k: 'sub', t: 'Make an account a bank account' },
      { k: 'p', t: `When the Sub Type is **Current Assets**, a question appears: **"Is this a bank account?"** → then **"Is this a checking account?"** and **"Which branch owns this account?"** Ticking bank account is what makes it show up in **Bank Reconciliation** and **Fund Transfer**. A **checking** account also feeds **Check Release Monitoring**.` },
      { k: 'sub', t: 'Import many accounts' },
      { k: 'steps', items: [
        `Click **Import** → **Download CSV Template** and fill it in.`,
        `**Choose File** → the system shows **Review Import** with each row marked Ready or Duplicate; untick any you don't want.`,
        `Click **Import Selected (N)**.`,
      ] },
      { k: 'note', label: 'Deleting.', t: `The **Remove Account** dialog offers **Deactivate** (hides it from lists but keeps history — the safe choice) and, for the Clinic Manager only, a permanent **Delete**. A bank account can only be **Retired** once its last statement balance is zero and all its lines are matched.` },
    ],
  },
  {
    id: 'subsidiary-ledger', num: '3.1', group: 'General Ledger', title: 'Subsidiary Ledger', tag: 'General Ledger',
    blocks: [
      { k: 'p', t: `The finance team's working **general ledger**: every individual posting behind each account, with an opening balance, a running balance and the counter-account ("Split"). This is the screen to answer "show me everything that hit account X between these dates."` },
      { k: 'sub', t: 'Reading it' },
      { k: 'ul', items: [
        `Accounts are grouped by type — **Assets, Liabilities, Equity, Revenue, Expenses** — each collapsible. Use **Expand all** / **Collapse all**.`,
        `Per account, columns are **Date · Transaction Type · Num · Memo / Description · Split · Debit · Credit · Balance**, with an **"Opening balance as of …"** row and a **"Total for …"** row.`,
        `The summary strip shows **Accounts · Transactions · Total debits · Total credits · Difference**.`,
      ] },
      { k: 'sub', t: 'Find and export' },
      { k: 'steps', items: [
        `Pick a **Quick range** (This month / Last month / This quarter / This year / Last year) or set **from / to** dates.`,
        `Optionally narrow by account type, a specific **account**, **branch**, or transaction type; or type in **"Search memo, reference or account…"**.`,
        `Click any posting row to open the **full journal entry** (both sides), where the current account is badged **THIS ACCOUNT**.`,
        `**Download** the view as Excel or PDF.`,
      ] },
      { k: 'note', label: 'Note.', t: `This screen is read-only. If your account is limited to one branch, a banner says the ledger is showing that branch only. Very long accounts show the first batch of lines, but the totals always cover everything.` },
    ],
  },
  {
    id: 'bank-reconciliation', num: '3.2', group: 'General Ledger', title: 'Bank Reconciliation', tag: 'General Ledger',
    blocks: [
      { k: 'p', t: `On-screen title **"Bank transactions."** Here you tick off every line on a bank statement against what the Hub already recorded, so the books agree with the bank. Matching or categorising a line **posts the bookkeeping entry** for it.` },
      { k: 'sub', t: 'Lay of the land' },
      { k: 'ul', items: [
        `A strip of **account cards** — one per bank account, each showing its posted balance and how many lines are pending.`,
        `Status tabs: **Pending (N) · Posted (N) · Excluded (N) · Archived (N)**.`,
        `Collapsible panels below: **Untagged transactions · Opening balance · exchange rates** (foreign accounts) · **Uploaded data**.`,
      ] },
      { k: 'sub', t: 'Reconcile a statement' },
      { k: 'steps', items: [
        `Click the **account card** for the bank you're working on.`,
        `On **Pending**, handle each line: **Match** it to a recorded transaction; **Categorise** it to an account (this posts the entry — money out = debit the category, credit the bank; money in = the reverse); record it as a **Transfer**; or **Exclude** it if it doesn't belong.`,
        `Matched/categorised lines move to **Posted**. Use **Undo** on a Posted row to reverse it.`,
      ] },
      { k: 'sub', t: 'Import a statement & automate' },
      { k: 'ul', items: [
        `**Upload from file** — upload the bank's CSV/Excel, map the **Date / Description / Spent / Received / Balance** columns (there's a **Download Template**), then **Import N rows**.`,
        `**Auto-rules** — teach the system that a recurring payee always maps to a certain account; then **Apply rules to N pending** and one-click **Auto-post**.`,
        `**Match settlements** — bulk-match a day's card/e-wallet settlement to its POS orders. **Match transfers** — bulk-pair transfers between your own accounts.`,
        `**Record Fund Transfer** and **Add transaction** let you record a transfer or a manual bank line here.`,
      ] },
      { k: 'note', label: 'Opening balance & start date.', t: `The **Opening balance** panel sets, per bank account, the figure the Balance Sheet starts from and the **date reconciliation begins counting** Hub entries. Lines dated before that are kept but **Archived** (locked from tagging). Use **Read from statements** to fill it, then **Save**. (This is the same figure you can set in **Beginning Balances**.)` },
    ],
  },
  {
    id: 'beginning-balances', num: '3.3', group: 'General Ledger', title: 'Beginning Balances', tag: 'General Ledger',
    blocks: [
      { k: 'p', t: `Sets each account's **opening balance for the fiscal year**, so the Balance Sheet reflects the cumulative position. This screen is reached by link (it is not in the left sidebar). Subtitle: "Opening balance per account for the fiscal year."` },
      { k: 'sub', t: 'Enter the openings' },
      { k: 'steps', items: [
        `Pick the **fiscal year**.`,
        `For each account, type the **Opening Balance (PHP)**, and optionally a **Start Date** and **Notes**. Accounts are grouped Assets / Liabilities / Equity / Revenue / Expense; bank accounts carry a **BANK** badge.`,
        `Watch the **Trial Balance Check** banner — it must read **Balanced** (debits = credits).`,
        `Click **Save (N)** (the number is how many rows you changed).`,
      ] },
      { k: 'note', label: 'Bank shortcut.', t: `**Prefill bank balances** reads each bank account's opening figure from its uploaded statements as of a date you choose — review the figures, then **Save**. A bank account's opening balance and start date here are the **same record** as the one in Bank Reconciliation's Opening balance panel; the **Start Date** is exactly the cutoff Bank Reconciliation uses to decide which lines are matchable.` },
    ],
  },

  /* ===================== TRANSACTIONS ===================== */
  {
    id: 'petty-cash', num: '4', group: 'Transactions', title: 'Petty Cash', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The log for small spending out of the **petty-cash float**. You encode each spend, the Accountant **audits** it, approved entries are grouped into an **RFP** to replenish the float, and paid entries flow to the Expense Report.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Entries** — the working grid of petty-cash spends.`,
        `**RFP (N)** — the batches raised for replenishment.`,
        `**Flowchart** — a picture of the whole process.`,
      ] },
      { k: 'sub', t: 'Record and replenish' },
      { k: 'steps', items: [
        `On **Entries**, pick your branch, click **Add Row** and fill the line — Reference Number, Requestor, Department, Date, Description, whether it is **Valid/Invalid** and **Vatable**, SI/TIN, **Gross Amount** (VAT splits out), and the **Account Title**. Attach the **Proof**. (Use the copy-last-row button to repeat a similar entry.)`,
        `The **Accountant** sets **Audited = Yes** (you cannot audit a row whose Account Title is blank).`,
        `Click **RFP (Valid)** or **RFP (Invalid)**, tick the audited rows, then **Generate RFP (…) · N**.`,
        `Open the RFP tab → **Download PDF** / **Billing Voucher**, submit for approval, then **Record as Paid** once the float is reimbursed and replenished.`,
        `Paid entries appear in the **Expense Report** (in the Expenses section).`,
      ] },
      { k: 'note', label: 'Rules.', t: `Only an **Accountant or Admin** can change **Audited**. Rows inside an RFP are **locked**. Deleting an RFP returns its entries to **For Replenishment**. Branches you can only view show a **"View only"** pill.` },
    ],
  },
  {
    id: 'expenses', num: '4.1', group: 'Transactions', title: 'Expenses', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The main **payables workspace** for larger expenses (over ₱2,000) — recurring and one-time. Same idea as Petty Cash: record → audit → RFP → pay → Expense Report, plus a credit-card statement flow and the supplier directory.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Recurring expense** — repeating bills (rent, utilities, subscriptions). The system reminds you before they are due; **Enter** turns a due one into a one-time entry. Supports spreading a prepaid amount over months.`,
        `**One-time expense** — ad-hoc purchases (the main grid).`,
        `**Credit Card SOA** — settle a company-card statement.`,
        `**RFP** — the payment batches.`,
        `**Credit Card Report** and **Expense Report** — the paid views.`,
        `**Suppliers** — the vendor directory.`,
        `**Flowchart** — the process picture. Top-right has branch buttons, **Collapse/Expand** and **Settings**.`,
      ] },
      { k: 'sub', t: 'Record & pay a one-time expense' },
      { k: 'steps', items: [
        `On **One-time expense**, **Add Row** and fill it: Reference Number, Payee, Department, Date, Description, **Valid/Invalid**, **Vatable**, SI/TIN, **Gross Amount** (Net of VAT and VAT compute), the **Account Title**, and **Has EWT? / EWT %** if withholding applies. Attach **Proof**.`,
        `The **Accountant** sets **Audited = Yes** (blocked while the Account Title is blank).`,
        `Click **RFP (Valid)** or **RFP (Invalid)**, tick the audited rows, then **Generate RFP (…) · N**.`,
        `On the **RFP** tab: **RFP Summary** / **Billing Voucher** to print, then **Record as Paid** (cash / check / bank / credit card). **Unpay** or **Delete (releases entries)** if you must reverse.`,
        `Paid items land in the **Expense Report** with a **Source** column.`,
      ] },
      { k: 'sub', t: 'Suppliers & credit card' },
      { k: 'ul', items: [
        `**Suppliers** — **Add Supplier**, edit, or import from Excel (**Template** downloads the format). Click a supplier to see all its transactions.`,
        `**Credit card** — on an entry, **Paid by Credit Card**; the charge appears under **Credit Card SOA**, where you **Upload SOA** and settle it by **Request for RFP** or **Pay through petty cash**; once paid it shows in **Credit Card Report**.`,
      ] },
      { k: 'note', label: 'Billing Voucher order & accounts.', t: `Voucher lines print in the exact order they were entered, so always set the **Account Title** on every entry — a blank account prints blank. Payroll/consultant pay cannot be entered here (it runs through Payroll).` },
    ],
  },
  {
    id: 'refunds', num: '4.2', group: 'Transactions', title: 'Refunds', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Refunds of **prepaid therapy balances** (money the patient paid in advance that hasn't been earned yet) for **East, Greenhills and Aura Health Institute**. Paying a refund posts **debit 4055 Refunds of Unearned Revenue / credit Cash**.` },
      { k: 'note', label: 'Not for store returns.', t: `Verdana **merchandise returns** are not done here — those are handled in **Point of Sale** (they post to 7160 Sales Returns).` },
      { k: 'sub', t: 'Record and pay a refund' },
      { k: 'steps', items: [
        `Pick the branch, and on the **Refunds** tab click **＋ New Refund**.`,
        `Search the **Patient**, set the **Date** and **Reason**, enter the **Refund Amount** and any **Charges Deducted** (the **Net to Patient** calculates itself), attach **Proof**, then **Save Refund**.`,
        `Tick **OK** on each row to audit it. Select the audited rows and click **Generate RFP** → optionally enter an RFP Number → **Generate RFP**.`,
        `On the **RFP** tab, use **BV** for the Billing Voucher and **Record as Paid** — set Date Paid, Method, the Cash/Bank Account credited, Check/Ref No. and Proof → **Record Paid**.`,
      ] },
      { k: 'note', label: 'Rules.', t: `A refund locks once it is in an RFP. Charges deducted can't be more than the refund. **Unpay** removes the refund's journal entry.` },
    ],
  },
  {
    id: 'cash-advances', num: '4.3', group: 'Transactions', title: 'Cash Advances', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `For cash handed to staff up front — event floats and the like. You **release** the cash, staff spend it, you **liquidate** against receipts, **return** any unspent balance, or **reimburse** an overspend. Releases and returns show up in **Bank Reconciliation**; liquidations become expenses on the Income Statement.` },
      { k: 'sub', t: 'The cycle' },
      { k: 'steps', items: [
        `On **Advances**, click **Release Advance** → choose the **Accountable** staff, the **Purpose/Event**, the **Date**, the **Amount** and the **Source bank account**, attach **Proof** → this records money out (debit **1160 Due from Employees**, credit the bank).`,
        `Click **Manage** on the advance → switch to **Liquidate** and add each receipt line (Payee/Supplier, Date, TIN, VAT, SI/OR #, Gross, **Expense account**, EWT if any, Proof). Each liquidation moves that amount from the receivable into an expense.`,
        `Use **Return** to send unspent cash back to the bank, or **Reimburse** if staff spent more than the float.`,
        `The advance closes automatically when **Outstanding** reaches ₱0.`,
      ] },
      { k: 'ul', items: [
        `Columns: **Reference · Date · Accountable · Purpose · Released · Liquidated · Returned · Outstanding · Status.**`,
        `**Delete advance** reverses every related journal entry and can't be undone — use with care.`,
      ] },
    ],
  },
  {
    id: 'inventory', num: '4.4', group: 'Transactions', title: 'Inventory & Procurement', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Manages **stock**: the item master, a classification dictionary, suppliers and purchase requests, stock adjustments and replenishment, inter-branch consignment transfers, live per-branch stock, and consumable-form control logs.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Inventory** — the item list. **Add Item**, **Import CSV** (with **CSV Template**), print **Barcodes**, or bulk-edit. Click an item to see its movement history and purchase lots.`,
        `**SKU Guide** — the classification dictionary (SKU Code, Department, Main/Sub category). **Add SKU** or **Pre-fill from products**.`,
        `**Suppliers** — the vendor list. **Add Supplier**, edit, delete.`,
        `**Supplier Request** — raise a purchase request; **Print request sheet (PDF)**.`,
        `**Adjustments** — **Add Stocks** (replenishment, with unit/foreign cost), **Shrinkage of Stocks** (write-off), or **Inventory Audit** (physical count that applies the differences).`,
        `**Consignments** — **New Transfer** stock between branches → **Approve** → **Receive** at the destination; **Generate Transmittal Form PDF**.`,
        `**Branch Stock** — a live, read-only matrix of In / Sold / Left per branch.`,
        `**Forms** — log receipts of controlled consumable forms with their control-number range.`,
      ] },
      { k: 'sub', t: 'Common tasks' },
      { k: 'steps', items: [
        `Add stock: **Adjustments → Add Stocks**, enter the quantity and unit cost — the item's quantity rises.`,
        `Count stock: **Adjustments → Inventory Audit**, key the **Actual Count**; shortages are deducted and overages added back.`,
        `Move stock between branches: **Consignments → New Transfer**, then **Approve**, then **Receive** at the other branch.`,
      ] },
    ],
  },
  {
    id: 'asset-management', num: '4.5', group: 'Transactions', title: 'Asset Management', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **fixed-asset register** — the official list of the clinics' equipment and improvements, with cost, depreciation, custody and annual physical audits. Assets are usually **created automatically** from an expense entry rather than typed here from scratch.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Assets** — the full register.`,
        `**Auditable Assets** — the ones that can be physically counted.`,
        `**Asset Audit** — run a physical count; **Add New Audit**, mark each item **Usable** or **For Replacement**, then **Finalize** to lock it.`,
        `**Recording Flowchart** — the process picture.`,
      ] },
      { k: 'sub', t: 'How an asset gets here (the normal way)' },
      { k: 'steps', items: [
        `Record the purchase as an expense in **Petty Cash** or **One-time Expense**, choosing a fixed-asset (PPE, 2020–2100) or intangible (3010–3130) **Account Title**.`,
        `On that entry, click **"Add this asset to Asset Management"** — the asset record is created with its details pre-filled (branch, net-of-VAT cost, date, classification, depreciation, supplier, department).`,
        `It then appears on the **Balance Sheet** under Non-Current Assets and **depreciates monthly** on its own.`,
      ] },
      { k: 'p', t: `You can also **Add Asset** directly. Key fields: **Branch, Asset Name, Price during Purchase, Date Bought, Asset Classification, Years for Depreciation** (Monthly Depreciation and End Month compute), Supplier, Departments, **Accountability** (custodian), **Control Number**, and Photos. **Freight Calculator / Asset Calculator** work out landed cost when there is shipping or foreign currency.` },
      { k: 'note', label: 'Who can edit.', t: `Front desk can add and rename; deleting is limited to Admin/Accountant/Bookkeeper/branch admin. A **Finalized** audit is locked; only a draft audit can be deleted.` },
    ],
  },
  {
    id: 'services', num: '4.6', group: 'Transactions', title: 'Services', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **catalogue of clinic services** and their prices — "Manage clinic services, pricing, and PWD discount rules." What you set here drives the prices in Point of Sale and PayMongo.` },
      { k: 'p', t: `Columns: **Service Name · Department · Payment Type · Branch · Price · Pricing · Revenue · PWD Rule · Actions.** Filter by search, department, payment type or branch. **Download** exports the list.` },
      { k: 'sub', t: 'Add or edit a service' },
      { k: 'steps', items: [
        `Click **＋ Add Service**.`,
        `Enter **Service Name**, **Department**, **Branch**, **Total Price (PHP)** and a **Price Type** (**Fixed**, or **Adjustable by Cashier**).`,
        `To schedule a price change, set a **New Price (PHP)** and an **Effective Date**. To charge branches differently, use **Per-Branch Price Overrides**.`,
        `Set **Revenue Classification** — **Earned** (normal sale) or **Unearned** (a wallet: Package / VIP Card / Prepaid Card / Downpayment / Advance) — and pick the **Revenue Account**.`,
        `Set the **Service Payment Type** (Cash / HMO / Guarantee Letter), the doctor-vs-clinic **fee split** if any, and toggles like **PWD 20% applies to clinic fee only** or **Issued Official Sales Invoice**.`,
        `Click **Add Service** (or **Update Service**). Use **Price History** on a row to see past changes.`,
      ] },
      { k: 'note', label: 'Auto-tag HMO/GL.', t: `The **Auto-tag HMO/GL** button tags therapy and "- OP" services as HMO/Guarantee-Letter so they post as receivables. **Delete** here is a **Deactivate** (it hides the service, keeping history).` },
    ],
  },
  {
    id: 'pos', num: '4.7', group: 'Transactions', title: 'Point of Sale (POS)', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **cashier and order book** — ring up therapy sessions and product sales, take payments, manage prepaid wallets, and review the day's sales.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Services** — the cashier, with sub-tabs **Cashier · Digital Wallet · Discount Settings · Payment Mode Settings · Vouchers**.`,
        `**Orders** — every completed sale.`,
        `**Products** — retail selling, with **Products (Onsite)** and **Products (Online)**.`,
        `**Sales Summary** — a per-branch sales breakdown.`,
      ] },
      { k: 'sub', t: 'Ring up a session (Cashier)' },
      { k: 'steps', items: [
        `On **Services → Cashier**, pick the **branch** and **date**. Either click **Convert to Order** on a row in the Appointment Queue, or click **＋ New Payment** to start a blank order.`,
        `In the order form, search and **add services**, set the **clinician** and **patient**.`,
        `Apply a discount if needed — tick **PWD / Senior Citizen (20%)**, type a **voucher code**, or set a custom discount.`,
        `Add the **payment method(s)** (cash, card, GCash/Maya, HMO, Guarantee Letter, package/wallet). If issuing an invoice, tick **Official Sales Invoice** and enter the **SI number**.`,
        `Click **Complete Order**, or **Save as Unpaid (collect later)** to bill later. You can **Show bill on patient tablet** with Patient View.`,
      ] },
      { k: 'sub', t: 'Other everyday actions' },
      { k: 'ul', items: [
        `**Collect an unpaid order** — Orders tab → **Record Payment** → date, amount, method, optionally **Issue Sales Invoice**.`,
        `**Void** — Orders tab → **Void** → type a **reason** (required); it restores stock and reverses wallet/points.`,
        `**Refund / Return a product** — **Refunded** (adds stock back and records the refund to 7160 Sales Returns) or **Returned by Buyer (restock)**.`,
        `**Digital Wallet** — create VIP / Package / Downpayment / Advance / Prepaid / HMO / GL wallets, **Print Card**, or print a **Statement of Account**.`,
        `**Discount Settings / Payment Mode Settings / Vouchers** — define reusable discounts, payment methods, and printable vouchers.`,
        `**Products (Online)** — **TikTok Bulk Upload** imports store orders.`,
      ] },
      { k: 'note', label: 'Mentorship sessions.', t: `A yellow queue row with a **Mentorship** badge means a mentor sat in — add the **Mentorship** service to the order before completing payment, or payroll can't pay the mentor. Anything missed is caught later in **Mentorship Audit**.` },
    ],
  },
  {
    id: 'quotations', num: '4.8', group: 'Transactions', title: 'Quotations', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `A **Quotation Maker** — build a priced quotation from branch services and Verdana products and generate it onto the branch's own letterhead as a Word (.docx) file.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**New Quotation** — build one.`,
        `**Saved** — past quotations; **Download .docx** or delete.`,
        `**Settings** — upload each branch's **.docx letterhead** (required before that branch can generate).`,
      ] },
      { k: 'sub', t: 'Make a quotation' },
      { k: 'steps', items: [
        `On **New Quotation**, pick the **Branch**, toggle **Services / Products**, search and **add items** (set Qty and any per-line or blanket discount, or **Use PWD rate for all**).`,
        `Fill **"Quotation for"** (name/company, contact person, email, number, date prepared, valid for), the **Payment** terms (downpayment %, deposit bank), any **Remarks**, and **Prepared by** (name, position, signature — draw or upload).`,
        `Click **Save & generate**, then **Download .docx**.`,
      ] },
      { k: 'note', label: 'Setup first.', t: `If a branch has no letterhead uploaded in **Settings**, it can't generate a quotation. Deleting a saved quotation means its number won't be reused.` },
    ],
  },
  {
    id: 'paymongo', num: '4.9', group: 'Transactions', title: 'PayMongo (online payments)', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **online-payment console**. Create payment links to send patients (for tuition, downpayments, etc.), watch the money arrive and land in the bank, and manage promo vouchers. When a link is paid, it records a POS sale net of the PayMongo fee.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `A tab per account — **AHEA · AHGH · Verdana · Aura Health Institute**.`,
        `**Voucher Discounts** — promo codes.`,
        `**POS Links** — POS-linked payment links with bank-payout reconciliation.`,
      ] },
      { k: 'sub', t: 'Create and collect a link' },
      { k: 'steps', items: [
        `Pick the **branch account tab**, then in **Generate Payment Link** choose **Service** or **Product**, search the item, set **Qty** and any voucher → **Create Payment Link**.`,
        `**Copy link** (or open the payer page / show the QR) and send it to the patient. You can **Disable** or **Delete** a link while it is still unpaid.`,
        `When paid, it flips to **Paid**, records a POS Order net of the PayMongo fee (**7140 Merchant Discount Rate**), and parks the money in **PayMongo Clearing**. Use **Sync from PayMongo** if a paid link hasn't updated.`,
        `Set **"PayMongo deposits to"** your bank once (POS Links tab); payouts then reconcile automatically, or use **Sync now** / **Settle manually now** (posts debit Bank / credit PayMongo Clearing).`,
      ] },
      { k: 'note', label: 'Test vs live.', t: `A **TEST MODE / LIVE MODE** banner shows which you're in. In **TEST MODE** no real money moves and test links never post to the real books — delete them after testing. **Paid** transactions can't be deleted.` },
    ],
  },
  {
    id: 'referral', num: '4.10', group: 'Transactions', title: 'Referral', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Keeps the **referrer directory** (doctors, partner schools, law firms), links **referred patients** to their referrer, and reports how many referrals and how much net sales each referrer brought in.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Referrers** — add and manage referrers by type (Doctors / Partner Schools / Law Firms). Each can be limited to a branch.`,
        `**Referred patients** — **Add referred patient**: pick a referrer, search a patient (from the patient CRM), add a note, **Save**. Click a row to see that patient's sessions.`,
        `**Referral Dashboard** — tick which referrer types to include; see **Total referrals**, **Total net sales**, and the **Top 5 referrers**.`,
      ] },
      { k: 'note', label: 'Access.', t: `Everyone can open Referral **except the HMO Officer**.` },
    ],
  },
  {
    id: 'accounts-receivable', num: '4.11', group: 'Transactions', title: 'Accounts Receivable', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Tracks and collects money **owed to the clinic** — mainly by **HMO providers** and **Guarantee-Letter (GL) agencies**, plus other credit customers. Subtitle: "Monitor and record payments from HMO providers and Guarantee Letter agencies."` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**HMO Providers** — with sub-tabs **Overview · Per HMO · Generate SOA · SOA Submissions · LOA Submission · For Follow Up**.`,
        `**Guarantee Letters (GL)** — with **Overview** and **Detailed GL** (tracks each letter's documents, approval, SOA and payment).`,
        `**Other Customers** — other credit customers, with staggered payment plans.`,
      ] },
      { k: 'sub', t: 'Record a collection' },
      { k: 'steps', items: [
        `Open the **HMO** or **GL** tab and click **Record Payment**.`,
        `Choose the **HMO Provider / Agency**, the **date**, **amount**, any **discount** (and its account), the **Sales Invoice number**, and the **bank/Debit Account** the money went into.`,
        `**Tag the covered orders** from the searchable list, then save.`,
      ] },
      { k: 'sub', t: 'The SOA cycle (HMO)' },
      { k: 'steps', items: [
        `**Generate SOA** builds the statement from eligible unbilled sessions.`,
        `After filing it, click **Submitted** and log the date and proof — the sessions flip to "SOA submitted" and the batch is recorded under **SOA Submissions**.`,
      ] },
      { k: 'note', label: 'Access.', t: `The **HMO Officer** sees only the HMO tab. Branch front desk get HMO read-only plus an editable GL/Detailed GL, and don't see Other Customers or the **Record Payment** button.` },
    ],
  },
  {
    id: 'accounts-payable', num: '4.12', group: 'Transactions', title: 'Accounts Payable', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `A small, separate register that **itemises the 4010 Accounts Payable balance** on the ledger and lets you **close** each item against the account that actually settled it. This is **not** the same as Expenses — it doesn't create expenses or RFPs; it just breaks down and clears an existing payable balance. (Salaries and taxes clear through their own RFPs.)` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Open (N)** — payables still owed.`,
        `**Closed (N)** — settled ones (with a "Settled by" column).`,
        `A banner ties the register's open total to the **4010 balance on the ledger**.`,
      ] },
      { k: 'sub', t: 'Itemise and close' },
      { k: 'steps', items: [
        `Click **Add payable** → enter **who it's owed to**, what for, the **Amount**, date and branch. (Listing it posts nothing yet.)`,
        `When it's paid, click **Close** on the row → either tick **"Already settled — close without posting"**, or pick the **Settling account** (search the chart), the date and a note. Closing posts **debit 4010 Accounts Payable / credit the settling account**.`,
        `**Reopen** on a closed row removes that settling entry.`,
      ] },
    ],
  },
  {
    id: 'general-journal', num: '4.13', group: 'Transactions', title: 'General Journal', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **catch-all manual bookkeeping book** (the sidebar calls it **General Journal**; the route is journal-entries). Use it to record a transaction by hand when no dedicated screen fits. Entries post straight to the ledger every report reads. Only Admin/Accountant/Bookkeeper can use it.` },
      { k: 'sub', t: 'Post a manual entry' },
      { k: 'steps', items: [
        `Click **New journal entry**.`,
        `Set the **Journal date**, **Branch**, a **Memo**, and optional **Department** tags.`,
        `**Add lines**: pick an **Account** (search as you type) and enter a **Debit** or a **Credit** on each line.`,
        `When total debits equal total credits the footer shows **Balanced** — then click **Save & post**. (It won't save while it's "Out of balance.")`,
      ] },
      { k: 'ul', items: [
        `Columns: **Date · Journal no. · Source · Memo · Branch · Amount** (expand a row to see its lines).`,
        `Tick **"Manual entries only"** to hide system-generated entries; only **manual** entries can be deleted (which removes them from every ledger and statement).`,
      ] },
    ],
  },
  {
    id: 'unearned-revenue', num: '4.14', group: 'Transactions', title: 'Unearned Revenue', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `A **read-only** view of account **4050 Unearned Revenue** — money received before it is earned (package deposits, advance payments) that is released as sessions are used or refunded. In plain terms: money you're holding but haven't earned yet. Credits grow the balance; debits release it.` },
      { k: 'sub', t: 'How to read it' },
      { k: 'steps', items: [
        `Set a **From / to** date range and a **branch**.`,
        `Read the summary — **Opening**, **Received (credits)**, **Released (debits)** and **Balance at end of range**.`,
        `Click a **month** in the movement matrix to drill into that month's lines; filter by **Source** if you're chasing a specific type.`,
      ] },
      { k: 'p', t: `Line columns: **Date · Branch · Source · Description · Debit · Credit.** There are no edit buttons — this screen only reports.` },
    ],
  },
  {
    id: 'payroll', num: '4.15', group: 'Transactions', title: 'Payroll', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Runs pay for **employees** and **consultants**: build and lock payslips per cutoff, post the payroll bookkeeping, and track what's payable. At the top of every tab pick the **Branch, Month, Year and Cutoff (1st / 2nd)**; **Payroll Settings** (top-right) maps payroll to the right accounts.` },
      { k: 'sub', t: 'Main tabs' },
      { k: 'ul', items: [
        `**Consultants** — sub-tabs include Consultant List, Unit Pay Settings, Clinician Pay Rules, Benefits Setting, **Initial Evaluation** and **Progress Report** (the IE/PR pair), **Payslip Generation**, **Mentorship Meetings** and Staff Directory.`,
        `**Employees** — sub-tabs include Employee List, Employee Settings, Staff Requests, **Timekeeping Upload**, Timekeeping Data, Benefits Setting, Leave Setting, **Allowance/Deduction**, Holiday Setting, **Payslip Generation** and Lates.`,
        `**Salaries Payable** — remit salaries with proof and raise the RFP.`,
        `**Payroll Settings** — the account mapping.`,
      ] },
      { k: 'sub', t: 'Run employee payroll' },
      { k: 'steps', items: [
        `Set **Branch / Month / Year / Cutoff**.`,
        `**Employees → Timekeeping Upload** → **Choose .dat File & Upload** the biometric file; review it under **Timekeeping Data**.`,
        `**Allowance/Deduction** → set any allowances or deductions (**Pre-fill from Previous** carries the last cutoff forward; staff-loan deductions appear here automatically).`,
        `**Payslip Generation** → **Generate Payslips**, review, then **Finalize All**.`,
        `**Lock & Finalize Payroll** (red) — this **posts the journal entry**. **Create Bank File** and **Download All PDFs** for release; **Generate Payreg** for the register.`,
      ] },
      { k: 'sub', t: 'Run consultant payroll' },
      { k: 'steps', items: [
        `**Consultants → Payslip Generation** → **Generate Payslips** → **Save All as Draft** → **Finalize All** → **Lock Payroll**.`,
        `In **Mentorship Meetings**, tick a meeting to charge the mentee the set fee and pay the mentor — both appear as adjustment lines on the next payslip preview.`,
      ] },
      { k: 'note', label: 'Important.', t: `**Locking cannot be undone without unlocking**, and **Unlock Payroll** deletes the journal entry so you can edit again. A locked payslip can't be regenerated until you unlock. Consultant payslips **keep Administration** consultants (they start at zero so an adjustment line can pay them) — they are not excluded.` },
    ],
  },
  {
    id: 'benefits-payable', num: '4.16', group: 'Transactions', title: 'Benefits Payable', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Collects the **SSS, PhilHealth and Pag-IBIG** contributions from **locked** payroll (employees and consultants) and turns the ticked lines into a **Request for Payment** per agency — which then appears under **Expenses → RFP**. A separate view tracks statutory **benefit availments** (maternity/sickness/ECC) the company advanced and SSS reimburses.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `Agency sub-tabs: **SSS · PhilHealth (PHIC) · Pag-IBIG (HDMF)**, then **Combined RFP**, then **Benefit Availments**. A branch switch sits on top.`,
      ] },
      { k: 'sub', t: 'Remit contributions' },
      { k: 'steps', items: [
        `Pick the **branch** and an **agency** sub-tab, and filter by **cutoff**.`,
        `Tick the **Pending** lines, click **Generate RFP**, optionally set an RFP Number and other fees, then **Generate RFP · ₱…**. The rows lock (status **In RFP**) until paid.`,
        `Use **Combined RFP** to remit several agencies as one bank transfer.`,
      ] },
      { k: 'ul', items: [
        `**Record Govcon catch-up** — recognises contributions for a month with **no payroll** (an unpaid month or maternity): either **Deduct from coming payrolls (hulugan)** or **Company-shouldered**.`,
        `**Benefit Availments** — record what the company advanced to staff and later the SSS reimbursement. These rows only document and age the claim (they do **not** post entries — the cash moves through the RFPs).`,
      ] },
    ],
  },
  {
    id: 'taxes', num: '4.17', group: 'Transactions', title: 'Taxes', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **BIR tax workspace** — it shows filing deadlines, computes each tax from your ledger and payroll data, and produces a Request for Payment you can track to paid and filed. Limited to Admin/Accountant/Bookkeeper.` },
      { k: 'sub', t: 'Tabs (one per obligation, plus admin views)' },
      { k: 'ul', items: [
        `**Guide & Summary** — deadlines and quick links (a banner warns of anything due within 5 days).`,
        `**Withholding on Compensation (1601-C)** · **Expanded Withholding (0619E / 1601EQ)** · **Business Tax (2550Q)** · **Income Tax (1702Q)** — each has a computation panel.`,
        `**RFP** — every tax RFP in one list. **Taxes Paid** — a month grid of paid vs pending. **Taxes Report** — the paid-tax report with Filing status.`,
      ] },
      { k: 'sub', t: 'Remit a tax' },
      { k: 'steps', items: [
        `Open the obligation's tab and set the **branch** and **period**.`,
        `Review the **computation panel**, tick the lines to remit, and click **Generate … RFP** (you can type the pre-printed RFP number and add other fees).`,
        `On any RFP row, **Record as Paid** → set the payment date, method (Online Fund Transfer / Check / Cash) and reference → **Save payment**.`,
        `In **Taxes Report**, set **Filing** to **Filed** once you've filed with the BIR. Use **PDF** or **Billing Voucher** for documents.`,
      ] },
      { k: 'note', label: 'Note.', t: `Tax RFPs use the **same numbering series** as petty-cash and expense RFPs. Deadlines assume manual/eBIRForms filing — always confirm against the BIR Tax Calendar.` },
    ],
  },
  {
    id: 'fund-transfer', num: '4.18', group: 'Transactions', title: 'Fund Transfer', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Records **money moved between the company's own bank accounts**, foreign-currency exchanges, and issued checks. A blue banner reminds you: **record the transfer under the branch that is the *receiver* of the funds**.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Fund Transfers** — bank-to-bank moves.`,
        `**Foreign Exchange** — currency conversions between two accounts (the rate is worked out for you).`,
        `**Check Release Monitoring** — every issued cheque, pulled together from petty cash, expenses/RFP, tax and transfers.`,
      ] },
      { k: 'sub', t: 'Record a transfer' },
      { k: 'steps', items: [
        `On **Fund Transfers**, click **New Transfer**.`,
        `Set the **Date**, **From** and **To** bank accounts, the **Amount**, the **Check Number** (if any), a description, and attach **Proof**.`,
        `Both bank sides post; each shows up in **Bank Reconciliation** for matching (a **★** appears once matched).`,
      ] },
      { k: 'note', label: 'Set-up.', t: `Bank accounts and checking accounts come from the **Chart of Accounts** ("Is this a bank account? / a checking account?"). If none exist, the screen tells you to set them there first. **Settings** sets the next reference number.` },
    ],
  },
  {
    id: 'equity', num: '4.19', group: 'Transactions', title: 'Equity', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The **shareholder cap table** — common and founders shares, preferred shares, deposits, buybacks (into treasury), share sales, dividend releases and stock certificates, with authorized-share limits.` },
      { k: 'sub', t: 'Tabs & cards' },
      { k: 'ul', items: [
        `Tabs: **Common Shares · Preferred Shares · Dividend Release History · Certificates**.`,
        `KPI cards (Admin): Total Capitalization, **Authorized Shares** (editable, with Common/Founders sub-limits), Total Number of Shares, Total Common, Total Founders, Total Treasury, Active Shareholders.`,
      ] },
      { k: 'sub', t: 'Common tasks' },
      { k: 'ul', items: [
        `**Add Common/Preferred Shareholder** — enter shares, class and price, record deposits, upload the certificate.`,
        `**Buyback** — inside a shareholder, add bought-back shares (they move into **Treasury Shares**).`,
        `**Release a dividend** — **Dividend Release History → Add Dividend Release** (per-share × outstanding, then finalize and email); preferred dividends use a quarter grid.`,
        `**Edit authorized shares** — the pencil on the Authorized Shares card.`,
      ] },
      { k: 'note', label: 'Guardrails.', t: `Only the **Clinic Manager** edits equity; Accountant/Bookkeeper see the **Preferred** tab (and preferred dividends) view-only. A red **"⚠ Over authorized"** banner appears if a class exceeds its limit, and saving a shareholder that would breach a cap asks you to confirm.` },
    ],
  },
  {
    id: 'loans-and-advances', num: '4.20', group: 'Transactions', title: 'Loans & Advances', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `The register of money **owed to or by the company** — shareholder/third-party advances and loans, credit lines, corporate bonds, and per-employee **staff loans and perks** — with the payment schedule that posts the ledger. Limited to Admin/Accountant/Bookkeeper.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Advances · Loans · Credit Line · Staff Loans & Perks · Payment History.**`,
        `A **"Near-due payments"** popup flags what's coming up when you open the screen.`,
      ] },
      { k: 'sub', t: 'Common tasks' },
      { k: 'ul', items: [
        `**Add Advance / Add Loan** — set the principal, interest (annual % or amortization), schedule (monthly/quarterly/bi-annual/annual), the paying bank and branch split, and upload proof; it posts debit bank / credit the liability.`,
        `**New Staff Loan / Perk** — link the employee, pick a **Category** (Cash Loan, BIR Assistance, Training, Medical Bill, SOS Program, Perk/Other, Govcon Catch-up) and the **per-cutoff** deduction; the release debits **1160 Due from Employees** and each payroll cutoff credits it back.`,
        `**Payment History** — tick the month cells that were paid and click **Record Payment**.`,
      ] },
    ],
  },
  {
    id: 'scholars', num: '4.21', group: 'Transactions', title: 'Scholars', tag: 'Transactions',
    blocks: [
      { k: 'p', t: `Tracks **approved scholars** (pulled live from the scholarship portal), records monthly **stipend releases** against a Scholarship Fund, and emails deposit notices. Limited to Admin/Accountant/Bookkeeper.` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Open a scholar (row or pencil) and set the terms — **Amount Awarded**, **Amount Released Monthly**, **Start Month**, **Release Day**, **Number of Months**, and the **Scholarship Fund** and **Bank** accounts; attach the signed RSA → **Save scholar terms**.`,
        `Each month click **Record Monthly Release** → confirm the eligible scholars, attach **proof of deposit**, and **Record the release**. This posts **debit Scholarship Fund / credit Bank** (a drawdown of the fund, **not** an expense). Then **Email** the notice.`,
        `**Top up fund** → **Record appropriation** refills the fund (debit Retained Earnings / credit Scholarship Fund).`,
      ] },
      { k: 'note', label: 'Watch the fund bar.', t: `It shows **Appropriated / Released / Remaining** and turns red if you over-release — top up the fund when that happens.` },
    ],
  },

  /* ===================== PLANNING & ANALYSIS ===================== */
  {
    id: 'budgets', num: '5', group: 'Planning & Analysis', title: 'Budgets', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `Enter a whole year's budget in income-statement shape, lock each month, and then compare **Budget vs Actual** against the real ledger. Only Admin/Accountant/Bookkeeper can edit; others view.` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Switch to **Enter Budget**, pick the **Year** and **Branch**.`,
        `Type each line's amount across the months (sections: **Revenue, Cost of Sales, Operating Expenses, Net Income, Capital Expenditure**). Click **Save all**.`,
        `**Lock** a month (the lock icon in its column) once it's final — it greys out and can't be edited until unlocked.`,
        `Switch to **Budget vs Actual**, pick **Full Year** or a locked month, and read the **Budget / Actual / Variance** columns (green = favourable, red = unfavourable).`,
      ] },
      { k: 'note', label: 'Note.', t: `A month's Budget-vs-Actual only appears once that month is **locked**; Full Year is always available. (The Dashboard tile may say "Coming Soon" — the page itself works.)` },
    ],
  },
  {
    id: 'reports', num: '5.1', group: 'Planning & Analysis', title: 'Reports (Financial Statements)', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `The company's **financial statements**, built live from the ledger. On-screen title "Financial Reports."` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Balance Sheet · Income Statement · Cash Flow Statement · Graphs · Contribution Margin.**`,
      ] },
      { k: 'sub', t: 'Read a statement' },
      { k: 'steps', items: [
        `Pick the **tab**, then the **Year** and a **View Mode** (**Whole Year / Quarterly / Monthly**).`,
        `Pick the **Branch** (on the Income Statement and Contribution Margin you can tick a subset of branches to total).`,
        `Click any **teal amount** to open a drill-down panel of the underlying transactions (with **Download Excel**).`,
        `Tick **Vertical Analysis** to show each line as a % of revenue. Use **CSV / Excel / PDF** (top-right) to export.`,
      ] },
      { k: 'ul', items: [
        `**Graphs** — the "Monthly Income Statement Metrics" chart (Gross Sales, Net Sales, Gross Profit, EBITDA, Net Income); toggle **Table** for the data behind it.`,
        `**Contribution Margin** — a per-department profit view; **Expense allocation** sets how shared costs split by department.`,
        `A presentation-**currency** dropdown can show figures in another currency (books stay in pesos).`,
      ] },
    ],
  },
  {
    id: 'investor-subsidiary-ledger', num: '5.2', group: 'Planning & Analysis', title: 'Investor · Subsidiary Ledger', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `An **investor-safe** subsidiary ledger. It's built from the very same data as the financial statements, so it can't disagree with them — each account shows an on-screen **"Ties to the statements"** check. Patient and personnel names are withheld. It differs from the finance team's **Subsidiary Ledger** (which shows every posting line, arbitrary date ranges and full drill-down).` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Pick the **Year** and, if needed, search an **account number or title**.`,
        `Read the roll-up per account — **Opening · Debits · Credits · Closing**.`,
        `Click an account to see its entries by month and source, confirm the green **"Ties to the statements"** badge, and **Download Excel** (the file carries its own proof).`,
      ] },
    ],
  },
  {
    id: 'sales-summary', num: '5.3', group: 'Planning & Analysis', title: 'Sales Summary', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `A **transaction-level sales report with invoice tracking** — it splits sales into invoiced vs non-invoiced, checks your Sales Invoice (SI) booklet for gaps and duplicates, and compares sales against a target.` },
      { k: 'sub', t: 'Tabs' },
      { k: 'ul', items: [
        `**Summary** — every sales line, split into **Report 1 — With Official Sales Invoice** and **Report 2 — Without Sales Invoice**. Columns: **Date · Order # · Patient Name · Service Availed · Qty · Sales Invoice No. · Gross · Net.** Click a heading to sort; type under a heading to filter. **Export CSV** / **Print / PDF** reflect what you've filtered.`,
        `**With SI** — reconciles the SI booklet: the left list shows every used SI number; the right **Flagged Sales Invoices** panel lists missing (gap) and duplicate numbers, which you can **Declare Cancelled SI**, add **Remarks**, or **Tag to Order**, then **Save**.`,
        `**Sales Target** — pick a month/year/branch to compare **Sales with SI** against the **Target** you set (only Admin/Accountant/Bookkeeper edit the target).`,
      ] },
      { k: 'sub', t: 'Run the report' },
      { k: 'steps', items: [
        `On **Summary**, set **Branch** and **Date From / To**, tick one or both report types, and click **Generate Report**.`,
        `Review Report 1 / Report 2 and the combined bar, then **Export CSV** or **Print / PDF**.`,
      ] },
    ],
  },
  {
    id: 'mentorship-audit', num: '5.4', group: 'Planning & Analysis', title: 'Mentorship Audit', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `A **read-only check** that reconciles clinic sessions booked **"With Mentor"** against whether a **Mentorship** service was actually billed on the POS order — so payroll only pays the mentor when the session was billed. It's the safety net for the (non-blocking) cashier prompt.` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Set the **From / To** dates and **Branch**, then click **Refresh**.`,
        `Review the KPI cards — **Ticked With Mentor**, **Mentorship billed**, **Missing the service** (paid but not tagged), **Not yet converted** (no order yet — a cashiering backlog, not a miss).`,
        `For each **Missing service** row (yellow), have the cashier add the **Mentorship** service to that order so payroll can pay the mentor.`,
      ] },
    ],
  },
  {
    id: 'products-analysis', num: '5.5', group: 'Planning & Analysis', title: 'Products Analysis', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `Analytics on **physical product sales** — movement (fast/slow), samples, reward redemptions, payment modes, refunds and cancellations, and purchase timing.` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Set **Branch** and **Date From / To** (or use a quick range: **This month / Year to date / Last 12 months / last year**).`,
        `Click **Generate**.`,
        `Read the KPI row (**Products Sold**, average gross/net per unit), the **Refund Rate** block, the **Purchase Times** heatmap, and the top/slow-moving tables.`,
      ] },
      { k: 'note', label: 'Note.', t: `There's no export button here. Free samples are excluded from sold/average figures; TikTok cancellations are informational.` },
    ],
  },
  {
    id: 'sales-analysis', num: '5.6', group: 'Planning & Analysis', title: 'Sales Analysis', tag: 'Planning & Analysis',
    blocks: [
      { k: 'p', t: `Sales analytics by **branch, department, payment method, unearned revenue and patient age**.` },
      { k: 'sub', t: 'How to use it' },
      { k: 'steps', items: [
        `Set **Branch** and **Date From / To**, then click **Generate**.`,
        `Read the KPIs (**Gross Sales**, **Net Sales**) and the tables — Gross Sales by Department, By Form of Payment, Unearned Revenue by wallet, and Gross/Net by Age. Click any column heading to re-sort.`,
      ] },
      { k: 'note', label: 'Note.', t: `Earned sales only — voided/returned and unearned-revenue orders are excluded. "Unknown" age means the order has no linked patient or birthday. No export button.` },
    ],
  },

  /* ===================== ADMINISTRATION ===================== */
  {
    id: 'users', num: '6', group: 'Administration', title: 'Users', tag: 'Administration',
    blocks: [
      { k: 'p', t: `**Clinic Manager only.** Create and manage staff accounts, set each person's **role** and **branch access**, and deactivate people who leave. The **Branches Registry** here is read-only (branch details are edited in the HR Platform).` },
      { k: 'sub', t: 'Create a user' },
      { k: 'steps', items: [
        `Click **Add User**.`,
        `Enter **Full Name**, **Email** and a **Password** (at least 8 characters).`,
        `Pick the **Role** and tick the **Branch access** (leave all unticked to allow every branch).`,
        `Click **Create User**. Later, edit to change role/branches or reset the password.`,
      ] },
      { k: 'note', label: `Deactivate, don't delete.`, t: `The trash icon **deactivates** an account — the person can no longer sign in, but their records and audit trail are kept. Use **Reactivate** to restore. You can't deactivate your own account.` },
    ],
  },
  {
    id: 'handbook', num: '6.1', group: 'Administration', title: 'Handbook', tag: 'Administration',
    blocks: [
      { k: 'p', t: `This document. Read it in the app, use the **word search** at the top to find any topic, or click **Download Word** / **Download PDF** to save a copy. It is available to every signed-in staff member so anyone can learn the system.` },
    ],
  },

  /* ===================== REFERENCE ===================== */
  {
    id: 'connections', num: '7', group: 'Reference', title: 'How the Accounting Hub connects to the other systems',
    blocks: [
      { k: 'p', t: `The clinics run on several connected systems that share data automatically, so you never re-type staff or patient lists. Here's what flows where:` },
      { k: 'table', head: ['Information', 'Direction', 'Used in Accounting for'], rows: [
        ['Patients (CRM)', 'Operations Hub → Accounting', 'Referral patient search, per-patient session drill-downs, patient lookup in POS'],
        ['Staff & consultants — East / Greenhills', 'Operations Hub → Accounting', 'Payroll register and payslips for the two Aura Health branches'],
        ['Staff — Verdana', 'HR Hub → Accounting', 'Payroll register and payslips for Verdana'],
        ['Branches registry', 'HR Platform → Accounting', 'The read-only branch list in Users (Sync Branches)'],
        ['Approved scholars', 'Scholarship portal → Accounting', 'The live feed on the Scholars screen'],
        ['Consultant Service-Invoice status & TINs', 'HR Hub → Accounting', 'Expanded Withholding (Sync with HR Hub)'],
        ['Equity / shareholder figures', 'Accounting → HR Hub', 'The Shareholders view in the HR Hub reads equity from here'],
      ] },
      { k: 'ul', items: [
        `If a **patient** is missing in Referral or POS, they're added first in the **Operations Hub** CRM.`,
        `If a **staff member** is missing from Payroll, fix it at the source — Operations Hub for Aura Health, HR Hub for Verdana.`,
        `If the **Shareholders** figures look wrong in the HR Hub, correct them in **Equity** here.`,
      ] },
    ],
  },
  {
    id: 'good-practice', num: '7.1', group: 'Reference', title: 'Good practice & cautions',
    blocks: [
      { k: 'ul', items: [
        `**One login per person** — the system logs who did what.`,
        `**Sign out** on shared computers.`,
        `**Attach proofs** as you go — reports and vouchers depend on them.`,
        `**Audit before paying** — an entry should be Audited = Yes before it goes into an RFP.`,
        `**Void, don't delete**, a paid POS order.`,
        `**Set the Account Title** on every expense/petty-cash entry, or it prints blank on the voucher.`,
        `**Test PayMongo in TEST MODE first**, delete the test links, then switch to LIVE.`,
        `**Blocked or something looks wrong?** Fully sign out and back in first; if it persists, report to the Clinic Manager with a screenshot.`,
      ] },
    ],
  },

  /* ===================== HELP & FAQ ===================== */
  {
    id: 'faq', num: '8', group: 'Help & FAQ', title: 'Frequently asked questions',
    blocks: [
      { k: 'p', t: `Use the **word search** box at the very top of this page to find any topic by keyword — it filters the handbook and highlights your word. Common questions:` },
      { k: 'faq', q: `A screen I need isn't in my sidebar. Where is it?`, a: `You only see screens your role allows. Ask the Clinic Manager to check your role in Users, and remember money-movement screens (Taxes, Cash Advances, Equity, Loans, Fund Transfer, General Journal) are limited to Admin/Accountant/Bookkeeper.` },
      { k: 'faq', q: `It says "Insufficient permissions" right after an update.`, a: `Fully Sign out and back in — your browser may be holding an old copy of your access.` },
      { k: 'faq', q: `How do I find one specific order, supplier or expense fast?`, a: `Use the search box in the middle of the top bar (or press Ctrl-K / ⌘K), type at least 2 characters, and pick the result.` },
      { k: 'faq', q: `A patient isn't showing up in POS or Referral.`, a: `Patients come from the Operations Hub CRM. Add the patient there first; the Accounting Hub reads that list.` },
      { k: 'faq', q: `A staff member is missing from Payroll.`, a: `Fix it at the source — Operations Hub for Aura Health East/Greenhills, HR Hub for Verdana — and it syncs across.` },
      { k: 'faq', q: `What's the difference between Petty Cash and Expenses?`, a: `Petty Cash is for small spends out of the cash float; Expenses is for larger bills (over ₱2,000) and recurring bills. Both follow record → audit → RFP → pay, and both feed the Expense Report.` },
      { k: 'faq', q: `What is an RFP and how do I pay one?`, a: `A Request for Payment groups audited entries for payment. Generate it from Valid/Invalid entries, print the Billing Voucher, then open the RFP and click Record as Paid.` },
      { k: 'faq', q: `Why does my Billing Voucher have a blank line?`, a: `An entry was left without an Account Title. Set the Account Title on every entry — voucher lines print in the order entered.` },
      { k: 'faq', q: `How do I refund a patient vs a store product?`, a: `Prepaid therapy balances (East/Greenhills/Institute) are refunded in the Refunds section. Verdana merchandise returns are done in Point of Sale (Refunded / Returned by Buyer).` },
      { k: 'faq', q: `How do I cancel a completed sale?`, a: `In POS → Orders, use Void (a reason is required). It restores stock and reverses wallet/points. Don't delete paid orders.` },
      { k: 'faq', q: `I locked payroll by mistake.`, a: `Use Unlock Payroll — it deletes the payroll journal entry and lets you edit again, then re-generate and re-lock.` },
      { k: 'faq', q: `A PayMongo payment came in but the link still says unpaid.`, a: `Open the branch tab and click Sync from PayMongo (or Sync now on POS Links).` },
      { k: 'faq', q: `How does a bank transfer show up correctly?`, a: `Record it in Fund Transfer under the receiving branch; both bank legs then appear in Bank Reconciliation to match.` },
      { k: 'faq', q: `Where do I set an account's opening balance?`, a: `In Beginning Balances for any account, or in the Bank Reconciliation opening-balance panel for a bank account — they are the same record.` },
      { k: 'faq', q: `Reports look wrong for one month.`, a: `Check that Bank Reconciliation is up to date and that expenses/payroll for the month are audited/locked; click a teal figure in Reports to drill into what makes it up.` },
      { k: 'faq', q: `Can I get the handbook as a file?`, a: `Yes — use Download Word or Download PDF at the top of this page.` },
    ],
  },
]
