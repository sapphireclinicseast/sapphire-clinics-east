'use client'

// Force dynamic — matches /admin and /documents. Without it Next.js
// serves a prerendered shell that hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, ADMIN_EMAIL } from '@/lib/session'

/**
 * Main-admin-only user handbook. Non-admins are redirected on mount.
 * The content mirrors the standalone HTML handbook the operators can
 * bookmark externally, but living inside the portal shell means it
 * follows the sidebar auth state + brand chrome.
 *
 * Kept in one file (no separate content component) so the handbook is
 * easy to edit — the whole thing is scannable in a single view.
 */
export default function HandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    // Only the main admin (single email, not just role=ADMIN) can view
    // the handbook — branch admins and everyone else get bounced. If
    // there's no session at all, send to sign-in.
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN' || auth.email !== ADMIN_EMAIL) {
      router.replace(auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div className="animate-fade-up max-w-4xl mx-auto handbook-root">
      {/* Handbook-specific styles. Scoped via .handbook-root so they
          don't leak into the rest of the portal. */}
      <style>{`
        .handbook-root h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; font-weight: 600; color: var(--deep-teal); }
        .handbook-root h2 { font-size: 22px; margin: 2.5rem 0 0.75rem; font-weight: 600; color: var(--deep-teal); letter-spacing: -0.01em; }
        .handbook-root h3 { font-size: 17px; margin: 1.5rem 0 0.5rem; font-weight: 600; color: var(--deep-teal); }
        .handbook-root h4 { font-size: 13px; margin: 1.25rem 0 0.5rem; font-weight: 600; color: var(--sage); text-transform: uppercase; letter-spacing: 0.06em; }
        .handbook-root p, .handbook-root li { font-size: 14.5px; line-height: 1.65; }
        .handbook-root ul, .handbook-root ol { padding-left: 1.4rem; margin: 0.5rem 0 1rem; }
        .handbook-root li { margin: 0.35rem 0; }
        .handbook-root code, .handbook-root kbd {
          font-family: 'JetBrains Mono', Menlo, Consolas, monospace;
          font-size: 12.5px;
          background: var(--paper-2);
          padding: 1px 5px;
          border-radius: 4px;
          color: var(--deep-teal);
        }
        .handbook-root kbd {
          background: #fff;
          border: 1px solid var(--paper-3);
          padding: 2px 6px;
          box-shadow: 0 1px 0 rgba(0,0,0,0.08);
        }
        .handbook-root a { color: var(--sage); text-decoration: none; border-bottom: 1px solid rgba(74,128,115,0.35); }
        .handbook-root a:hover { border-bottom-color: var(--sage); }
        .handbook-root .lead {
          font-size: 15px;
          color: var(--mid-gray);
          margin: 0 0 1.75rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--paper-3);
        }
        .handbook-root .tag {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 2px 9px;
          border-radius: 999px; text-transform: uppercase; letter-spacing: 0.08em;
        }
        .tag-sage  { background: #dcfce7; color: #166534; }
        .tag-amber { background: #fef3c7; color: #b45309; }
        .tag-rose  { background: #fee2e2; color: #9f1239; }
        .tag-info  { background: #dbeafe; color: #1e40af; }
        .tag-due   { background: #fed7aa; color: #9a3412; }
        .handbook-root .role-card {
          background: #fff;
          border: 1px solid var(--paper-3);
          border-left: 3px solid var(--sage);
          border-radius: 12px;
          padding: 1.1rem 1.4rem;
          margin: 1.25rem 0;
        }
        .handbook-root .role-card > h3:first-child { margin-top: 0; }
        .handbook-root .callout {
          background: var(--paper-2);
          border: 1px solid var(--paper-3);
          border-radius: 10px;
          padding: 0.8rem 1rem;
          margin: 1rem 0;
          font-size: 13.5px;
        }
        .handbook-root .callout-warn { border-left: 3px solid var(--clay); background: #fffbeb; }
        .handbook-root .callout-note { border-left: 3px solid var(--mid-gray); }
        .handbook-root .callout .label {
          display: block; font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--sage); margin-bottom: 4px;
        }
        .handbook-root .callout-warn .label { color: var(--clay); }
        .handbook-root .callout-note .label { color: var(--mid-gray); }
        .handbook-root table.matrix { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 12.5px; }
        .handbook-root table.matrix th, .handbook-root table.matrix td {
          border: 1px solid var(--paper-3); padding: 7px 9px; text-align: left; vertical-align: top;
        }
        .handbook-root table.matrix th {
          background: var(--paper-2); font-weight: 600; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--mid-gray);
        }
        .handbook-root table.matrix td.yes { color: #166534; font-weight: 500; }
        .handbook-root table.matrix td.no  { color: var(--mid-gray); }
        .handbook-root table.matrix td.partial { color: #9a3412; font-weight: 500; }
        .handbook-root .task-step { counter-increment: step; position: relative; padding-left: 2rem; margin: 0.7rem 0; }
        .handbook-root .task-step::before {
          content: counter(step);
          position: absolute; left: 0; top: 1px;
          width: 22px; height: 22px; border-radius: 50%;
          background: var(--sage); color: white;
          font-size: 11.5px; font-weight: 600;
          display: flex; align-items: center; justify-content: center;
        }
        .handbook-root .task-steps { counter-reset: step; padding-left: 0; list-style: none; }
        .handbook-root .task-steps li { list-style: none; }
        .handbook-root .quick-nav {
          background: #fff; border: 1px solid var(--paper-3);
          border-radius: 12px; padding: 0.9rem 1.2rem; margin: 0 0 2rem;
        }
        .handbook-root .quick-nav h4 { margin-top: 0; }
        .handbook-root .quick-nav ol { margin: 0; padding-left: 1.4rem; }
        .handbook-root .quick-nav li { margin: 3px 0; font-size: 14px; }
        .handbook-root .toc-role {
          display: inline-block; font-size: 11px; font-weight: 500;
          color: var(--mid-gray); margin-left: 6px;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        @media print {
          .handbook-root .role-card, .handbook-root .callout { break-inside: avoid; }
          .handbook-root h2 { break-before: page; }
          .handbook-root h2:first-of-type { break-before: auto; }
        }
      `}</style>

      {/* Header + print action */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Aura Academy · Handbook
          </div>
          <h1>Class Portal — User Handbook</h1>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs whitespace-nowrap"
          onClick={() => window.print()}
        >
          Print / Save PDF
        </button>
      </div>

      <p className="lead">A practical guide to <code>class.sapphireclinicseast.org</code> for the clinic manager, HR officer, front desk, SPED teacher, and student roles.</p>

      <div className="quick-nav">
        <h4>Table of contents</h4>
        <ol>
          <li><a href="#getting-started">Getting started</a> — signing in, portal layout, roles at a glance</li>
          <li><a href="#main-admin">Clinic manager</a><span className="toc-role">Main admin</span></li>
          <li><a href="#branch-admin">HR officer</a><span className="toc-role">Branch admin</span></li>
          <li><a href="#frontdesk">Front desk</a><span className="toc-role">Frontdesk</span></li>
          <li><a href="#teacher">SPED teacher</a><span className="toc-role">Teacher</span></li>
          <li><a href="#student">Student / parent</a><span className="toc-role">Student</span></li>
          <li><a href="#common">Common workflows</a> — payments, vouchers, plan switches</li>
          <li><a href="#troubleshooting">Troubleshooting</a></li>
        </ol>
      </div>

      <h2 id="getting-started">1. Getting started</h2>

      <h3>Signing in</h3>
      <ol>
        <li>Open <a href="https://class.sapphireclinicseast.org">class.sapphireclinicseast.org</a> in Chrome, Safari, or Edge.</li>
        <li>Click <strong>Sign In</strong> in the top-right.</li>
        <li>Enter the email and password issued to you by the main admin.</li>
      </ol>

      <div className="callout">
        <span className="label">If you can’t sign in</span>
        Ask the main admin (<code>main@sapphireclinicseast.org</code>) to reset your password from <em>Admin → Users</em>. If the whole site is down, check that <code>class.sapphireclinicseast.org</code> loads at all — a domain-level outage looks identical to a bad password.
      </div>

      <h3>What you see once signed in</h3>
      <ul>
        <li><strong>Left sidebar</strong> — always visible on desktop, hamburger menu on mobile. Contains your role-scoped nav (Dashboard, Classes, Calendar, Documents, Pay tuition) plus a user chip with a <strong>Sign out</strong> button.</li>
        <li><strong>Main area</strong> — the current page. Cards are compact; tables scroll internally when they get long.</li>
        <li><strong>Payment badges</strong> — every student profile shows their tuition status as one or more badges:
          <ul>
            <li><span className="tag tag-sage">Paid for July 2026</span> — this month is settled.</li>
            <li><span className="tag tag-amber">Owes for June 2026</span> — a past month was skipped.</li>
            <li><span className="tag tag-rose">Due for July 2026</span> — the current period is unpaid.</li>
          </ul>
        </li>
      </ul>

      <h3>Who can do what</h3>
      <div className="overflow-x-auto">
      <table className="matrix">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Main admin<br/>(clinic mgr)</th>
            <th>Branch admin<br/>(HR officer)</th>
            <th>Front desk</th>
            <th>SPED teacher</th>
            <th>Student / parent</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>See students across both branches</td><td className="yes">Yes</td><td className="no">Own branch only</td><td className="no">Own branch only</td><td className="no">Their classes only</td><td className="no">Themselves only</td></tr>
          <tr><td>Create / disable staff accounts</td><td className="yes">Yes</td><td className="partial">Own branch</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Record cash / bank / PayMongo payments</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Confirm pending payments</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Edit shared voucher codes (AURA30, etc.)</td><td className="yes">Yes</td><td className="no">Read only</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Issue personal early-bird voucher</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Edit fee schedule</td><td className="yes">Yes</td><td className="partial">Own branch only</td><td className="no">Read only</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Create / edit classes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Own classes</td><td className="no">—</td></tr>
          <tr><td>Post announcements</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="partial">To their classes</td><td className="no">—</td></tr>
          <tr><td>Pay own tuition (PayMongo)</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
        </tbody>
      </table>
      </div>

      <h2 id="main-admin">2. Clinic manager <span className="tag tag-sage">Main admin</span></h2>

      <p>The clinic manager account (<code>main@sapphireclinicseast.org</code>) sees every branch, every student, every payment, every reminder. Everything below is inherited by branch admins on their own branch.</p>

      <h3>Where you land</h3>
      <p>Signing in redirects you to <code>/admin</code>. Below the header you’ll see nine tabs:</p>
      <ul>
        <li><strong>Users</strong> — every staff and student account, filterable by role.</li>
        <li><strong>Students</strong> — a searchable roster with plan (Monthly / Bi-annual / Annual), branch, and current-period payment badge.</li>
        <li><strong>Classes</strong> — every class across both branches. Click <strong>+ Add Class</strong> to create one.</li>
        <li><strong>Curriculum</strong> — per-grade curriculum documents you upload for the whole school.</li>
        <li><strong>Templates</strong> — free-form template library (IEP forms, lesson plans, parent forms).</li>
        <li><strong>Notifications</strong> — the announcement composer.</li>
        <li><strong>Payments</strong> — pending confirmations, confirmed payments, pending-by-deadline, the consolidated <em>Paying students</em> table, and the automated <em>Notifications</em> log.</li>
        <li><strong>Fees</strong> — annual / bi-annual / monthly tuition and misc for each branch, plus shared voucher codes.</li>
        <li><strong>Assignments</strong> — the teacher ↔ class assignment matrix.</li>
      </ul>

      <div className="role-card">
        <h3>Key workflows</h3>

        <h4>Add a new staff account</h4>
        <ol className="task-steps">
          <li className="task-step">Open <strong>Users</strong>. Click <strong>+ New user</strong>.</li>
          <li className="task-step">Pick a role — <code>BRANCH_ADMIN</code>, <code>FRONTDESK</code>, or <code>TEACHER</code> — set their branch (East or Greenhills), enter their email, and generate a password.</li>
          <li className="task-step">Hand the password over out-of-band (in person or on a signed sticky note). Never email it. Passwords rotate on next login when the user changes it themselves.</li>
        </ol>

        <h4>Change a student’s payment plan</h4>
        <p>Use this when a parent decides to switch from monthly to bi-annual (or any other combo) mid-year.</p>
        <ol className="task-steps">
          <li className="task-step">Open the student’s profile (<em>Admin → Students → click a row</em>).</li>
          <li className="task-step">Scroll to the <strong>Plan change — Switch payment plan</strong> card. Pick the target plan; the card shows the exact balance to collect, net of any 30% voucher and cash already paid.</li>
          <li className="task-step">Go to <em>Payments → + Record payment</em>, enter that balance under the target plan, and confirm once the parent pays.</li>
          <li className="task-step">Once confirmed, the student’s inferred plan flips to the new one and all future badges use the new period logic.</li>
        </ol>

        <h4>Set up fees for the new school year</h4>
        <ol className="task-steps">
          <li className="task-step">Open <strong>Fees</strong>. Pick a branch tab.</li>
          <li className="task-step">Update annual, bi-annual, and monthly tuition + misc figures (all in PHP, no comma).</li>
          <li className="task-step">Save. Every <em>/pay</em> checkout and every plan-switch calculator on that branch picks up the new numbers immediately.</li>
        </ol>

        <h4>Edit the shared voucher codes</h4>
        <ol className="task-steps">
          <li className="task-step"><em>Fees → Voucher codes</em>. Add a code like <code>AURA30</code>, set a discount percent, and an expiry (end-of-day, Manila time).</li>
          <li className="task-step">To pause a code, untick <strong>Active</strong> instead of deleting — the audit trail is worth keeping.</li>
          <li className="task-step">Personal early-bird vouchers (per-student) are edited from the student profile, not here — see the personal voucher workflow below.</li>
        </ol>

        <h4>Post an announcement</h4>
        <ol className="task-steps">
          <li className="task-step"><em>Notifications tab → + New announcement</em>. Write the title and body.</li>
          <li className="task-step">Optionally attach a PDF (parent letter, calendar) and pick which grade levels see it. Leave grades blank for a school-wide post.</li>
          <li className="task-step">Tick <strong>Email everyone</strong> if you want it blasted; otherwise it only appears in the recipient portals.</li>
        </ol>
      </div>

      <h2 id="branch-admin">3. HR officer <span className="tag tag-info">Branch admin</span></h2>
      <p>The HR officer is a branch-scoped mirror of the main admin. Everything you see is filtered to your branch (East or Greenhills) at the server level, so cross-branch data never reaches your screen.</p>

      <h3>Where you land</h3>
      <p>Same landing as the main admin: <code>/admin</code> with the same nine tabs. Differences:</p>
      <ul>
        <li><strong>Students</strong> — only your branch.</li>
        <li><strong>Payments → Confirmed / Pending / Reminders</strong> — only your branch.</li>
        <li><strong>Fees</strong> — you see all branches’ fees but can only edit your own.</li>
        <li><strong>Users</strong> — you can add teachers and front desk for your branch. You cannot create another branch admin or a main admin.</li>
        <li><strong>Shared vouchers</strong> — read-only. Ask the main admin to add or edit a shared code.</li>
      </ul>

      <div className="role-card">
        <h3>Key workflows</h3>

        <h4>Add a new teacher to your branch</h4>
        <ol className="task-steps">
          <li className="task-step"><em>Users → + New user</em>. Role: <code>TEACHER</code>. Branch: yours.</li>
          <li className="task-step">After the account is created, go to <em>Assignments</em> and tick the classes they’ll handle. Only assigned teachers can grade or take attendance for a class.</li>
        </ol>

        <h4>Issue a personal early-bird voucher</h4>
        <p>Use this for a monthly / bi-annual parent who availed of the 30% AURA30 promo before the public code expired but still needs to redeem it on future installments.</p>
        <ol className="task-steps">
          <li className="task-step">Open the student’s profile. Scroll to <strong>Personal vouchers</strong>.</li>
          <li className="task-step">Click <strong>+ Issue AURA30 early-bird voucher</strong>. A code like <code>AURA30-BRUCE-A4K7Q9</code> is minted, locked to that student, valid through May 31.</li>
          <li className="task-step">Share the code with the parent. Their <em>/pay</em> page will auto-apply it next time they open it; they don’t need to type it.</li>
        </ol>

        <h4>See who has been auto-emailed a payment reminder</h4>
        <ol className="task-steps">
          <li className="task-step"><em>Payments tab</em> → scroll to <strong>Notifications: Automated payment reminders</strong>.</li>
          <li className="task-step">Pick a window (7 / 30 / 90 / 365 days). Rows are grouped by period (e.g. August 2026) so you can see everyone contacted about the same billing period at once.</li>
          <li className="task-step">Reminder types: <em>5-day heads-up</em>, <em>Due tomorrow</em>, <em>Past due</em>. The cron fires them automatically — you don’t need to click anything to send.</li>
        </ol>
      </div>

      <h2 id="frontdesk">4. Front desk <span className="tag tag-amber">Frontdesk</span></h2>
      <p>The front desk is a payment-focused, branch-scoped account. You take cash, confirm bank deposits, generate paperwork, and keep the enrollment register clean.</p>

      <h3>Where you land</h3>
      <p><code>/frontdesk</code> with six tabs:</p>
      <ul>
        <li><strong>Students</strong> — your branch’s active roster with search, plan pill, branch badge, and current-period payment status.</li>
        <li><strong>Calendar</strong> — your branch’s events, embedded from the shared calendar.</li>
        <li><strong>Payments</strong> — the heart of your day. Contains four cards: Pending confirmations, Confirmed payments (scrollable with search), Pending-by-deadline, and the consolidated Paying students table.</li>
        <li><strong>Enrollment register</strong> — one row per PAID student with LRN, LSEN, PSA birth cert, remittance status, and every DepEd field you file at year-end. Excel and PDF export in the top-right.</li>
        <li><strong>Curriculum</strong> and <strong>Templates</strong> — read + upload access for materials you hand out to parents.</li>
      </ul>

      <div className="role-card">
        <h3>Key workflows</h3>

        <h4>Record a cash payment from a parent</h4>
        <ol className="task-steps">
          <li className="task-step"><em>Payments → + Record payment</em>.</li>
          <li className="task-step">Pick the student from the branch-scoped picker. Pick method: <strong>Frontdesk payment</strong> with sub-option Cash / GCash / PayMaya / Credit / Debit.</li>
          <li className="task-step">Pick the plan (Monthly / Bi-annual / Annual). Enter the amount in PHP. Type the period as an explicit month or half — for example <code>August 2026</code> or <code>First half SY 2026–2027</code>. Don’t use <code>2026-2027</code> or <code>AY 2026-2027</code> — the badge logic won’t know which month that was for.</li>
          <li className="task-step">Click <strong>Record</strong>. The row lands in <em>Pending confirmations</em>. Once you have the cash in hand, click <strong>Confirm payment</strong> on that row — it moves to <em>Confirmed Payments</em> and the student’s badge flips to <span className="tag tag-sage">Paid for &lt;that period&gt;</span>.</li>
        </ol>

        <div className="callout callout-warn">
          <span className="label">The period text matters</span>
          The system attributes a payment to a specific month <em>only</em> when the period explicitly names the month. So <code>July 2026</code> counts as July, and <code>Back balance · June–September 2026</code> covers all four. Vague periods like <code>2026-2027</code> stay in the payment history but do <strong>not</strong> mark any specific month as paid. If a parent hands you cash for June, type <code>June 2026</code> — anything else silently drops the attribution.
        </div>

        <h4>Handle a late enrollee’s back balance</h4>
        <ol className="task-steps">
          <li className="task-step">When a parent signs up in July on the Monthly plan, their first <em>/pay</em> visit already shows a lump-sum callout — for example “2-month back balance (June–July) ₱14,300”. They can pay that lump via PayMongo or over the counter.</li>
          <li className="task-step">If you’re recording it in <em>+ Record payment</em>, enter the amount as the lump and use the period <code>Back balance · June–July 2026</code>. Both months light up as paid.</li>
          <li className="task-step">If a late enrollee already paid for the current month but skipped an earlier one, their profile shows an amber <span className="tag tag-due">Owes for June 2026</span> badge and the Pending-by-deadline list surfaces them with a Jun 5 deadline flagged <em>overdue</em>. Coordinate with the parent to collect that missing installment separately.</li>
        </ol>

        <h4>Switch a student’s plan (monthly → bi-annual)</h4>
        <p>Same flow as the main admin. On the student’s profile, use the <strong>Plan change — Switch payment plan</strong> card to compute the balance owed (accounting for the 30% voucher and what they’ve already paid), then <em>Record payment</em> that exact amount under the new plan. Recording it as <em>Bi-annual</em> flips their inferred plan going forward.</p>

        <h4>Fix a payment that was recorded with the wrong period</h4>
        <ol className="task-steps">
          <li className="task-step">Open <em>Payments → Confirmed Payments</em>. Find the row (use the search box).</li>
          <li className="task-step">Click <strong>Edit</strong>. Adjust the period text, amount, or date. Save.</li>
          <li className="task-step">If the student’s badge doesn’t update immediately, hard-refresh (Cmd/Ctrl + Shift + R).</li>
        </ol>

        <h4>Generate a school registration letter or fee schedule</h4>
        <ol className="task-steps">
          <li className="task-step">Open the student’s profile. Scroll to <strong>Documents</strong>.</li>
          <li className="task-step">Click <strong>Generate registration letter</strong>. Fill in the Purpose field (e.g. “DepEd enrollment verification”), then <strong>Download PDF</strong>. The letter carries HANNAH JARA’s pre-embedded signature.</li>
          <li className="task-step">The <strong>Schedule of Fees</strong> PDF is generated the same way and shows the correct paid / balance rows based on the student’s history.</li>
        </ol>

        <h4>Keep the enrollment register clean</h4>
        <ol className="task-steps">
          <li className="task-step">Open <strong>Enrollment register</strong> tab. Every cell is click-to-edit and saves automatically.</li>
          <li className="task-step">Fill in LRN once the parent brings the document; if they don’t have one yet, use the LRN Status dropdown and mark it <code>NO_LRN</code>.</li>
          <li className="task-step">For SPED / IEP-flagged students, use the LSEN classification cell. Only trained staff should fill this.</li>
          <li className="task-step">Export to Excel or PDF for DepEd filings from the top-right buttons.</li>
        </ol>
      </div>

      <h2 id="teacher">5. SPED teacher <span className="tag tag-info">Teacher</span></h2>
      <p>Teachers see students, classes, and materials — no payment data, no user administration.</p>

      <h3>Where you land</h3>
      <p><code>/profile</code> with tabs for your own profile, your assigned <em>Classes</em>, <em>Calendar</em>, and <em>Documents</em>.</p>

      <div className="role-card">
        <h3>Key workflows</h3>

        <h4>Open a class</h4>
        <ol className="task-steps">
          <li className="task-step">Sidebar → <strong>Classes</strong>. You see cards for every class assigned to you.</li>
          <li className="task-step">Click <strong>Open</strong>. Inside you can see the roster, schedule (days + time), photo, and the lesson / activity feed.</li>
        </ol>

        <h4>Add a lesson with a proof photo</h4>
        <ol className="task-steps">
          <li className="task-step">In the class dashboard, click <strong>+ Lesson</strong>. Fill in the name, score, and the tickbox for “Completed today”.</li>
          <li className="task-step">Attach a proof — a photo of the child’s work. You can pick multiple photos at once; each shows as a chip while it uploads.</li>
          <li className="task-step">Save. The lesson appears on every enrolled student’s profile under <em>Lessons</em>.</li>
        </ol>

        <h4>Record an activity (SPED session, therapy, etc.)</h4>
        <ol className="task-steps">
          <li className="task-step">Click <strong>+ Activity</strong>. Pick the activity type from the dropdown.</li>
          <li className="task-step">Attach photos (multiple OK). While they upload, the activity shows a <span className="tag tag-amber">PENDING</span> badge; once all photos flush it flips to saved.</li>
        </ol>

        <h4>Edit a student’s LRN or upload their Form 137 / SF10</h4>
        <p>Teachers, front desk, and admins share this permission. On the student profile, use the <strong>Update LRN</strong> button in Learner profile, or the <strong>Form 137 / SF10</strong> upload slot in Other documents.</p>

        <h4>Post an announcement to your classes</h4>
        <ol className="task-steps">
          <li className="task-step">From the class dashboard, use the announcements section.</li>
          <li className="task-step">Title, body, optional PDF attachment. Recipients are the class roster’s parents.</li>
        </ol>
      </div>

      <h2 id="student">6. Student / parent <span className="tag tag-sage">Student</span></h2>
      <p>The student account is what parents sign in to. The child is technically the “student user”; the parent normally holds the credentials and pays on the child’s behalf.</p>

      <h3>Where you land</h3>
      <p><code>/profile</code>. On mobile the sidebar becomes a hamburger.</p>

      <div className="role-card">
        <h3>Key workflows</h3>

        <h4>Check what tuition you owe</h4>
        <p>Open your profile. The badge in the top-right of the profile card is authoritative:</p>
        <ul>
          <li><span className="tag tag-sage">Paid for July 2026</span> — you’re current.</li>
          <li><span className="tag tag-rose">Due for July 2026</span> — click <strong>Pay tuition fee →</strong> to open <em>/pay</em>.</li>
          <li><span className="tag tag-amber">Owes for June 2026</span> alongside <span className="tag tag-sage">Paid for July 2026</span> — you paid this month but skipped an earlier one. Contact the front desk to settle the missing month, or open <em>/pay</em> where a callout will tell you which months are past-due.</li>
        </ul>

        <h4>Pay your tuition</h4>
        <ol className="task-steps">
          <li className="task-step">Sidebar → <strong>Pay tuition</strong>, or click the <strong>Pay tuition fee →</strong> button on your profile.</li>
          <li className="task-step">Pick a plan (Annual / Bi-annual / Monthly). The page shows the amount for that plan for your branch.</li>
          <li className="task-step">If you have a personal voucher (the front desk issued you one when you availed of the AURA30 early bird), it’s applied automatically. You’ll see “✓ Code AURA30-YOURNAME-XXXXXX applied — 30% off tuition”. You can remove it if you don’t want the discount, but on the next visit it will re-apply.</li>
          <li className="task-step">Pick a method: <strong>Pay online (PayMongo)</strong> for instant confirmation via GCash/Maya/card/bank; <strong>Front desk cash</strong> to pay at the clinic; <strong>Bank deposit</strong> to deposit at BDO and upload the slip.</li>
          <li className="task-step">Once confirmed, your profile badge flips to Paid.</li>
        </ol>

        <h4>Sign your parent’s waiver</h4>
        <ol className="task-steps">
          <li className="task-step">Sidebar → <strong>Documents</strong>. Look for the waiver card.</li>
          <li className="task-step">Read the terms. Draw your signature in the pad (mouse, finger, or stylus). Save.</li>
          <li className="task-step">The waiver PDF is generated and stored on your profile. The main admin countersigns from their end.</li>
        </ol>

        <h4>Upload a required document (birth cert, medical record, etc.)</h4>
        <ol className="task-steps">
          <li className="task-step">Sidebar → <strong>Documents</strong>. Each expected document has its own card.</li>
          <li className="task-step">Click <strong>Upload</strong>, pick the file (PDF or photo), and save. The front desk sees it appear in the student’s profile.</li>
        </ol>

        <h4>See class announcements</h4>
        <p>Sidebar → <strong>Classes</strong>. Click your class. Announcements appear in a feed with any attached PDFs opening inline.</p>
      </div>

      <h2 id="common">7. Common workflows</h2>

      <h3 id="common-vouchers">Personal early-bird vouchers</h3>
      <p>The AURA30 public code expired mid-year, but monthly / bi-annual parents who availed of the early bird still need to keep discounting their remaining installments. That’s what personal vouchers solve. Admin, branch admin, and front desk can all issue them.</p>

      <h4>Issuing one</h4>
      <ol className="task-steps">
        <li className="task-step">Open the student’s profile.</li>
        <li className="task-step">Scroll to <strong>Personal vouchers</strong> in the Other documents grid.</li>
        <li className="task-step">Click <strong>+ Issue AURA30 early-bird voucher</strong>. A unique code (format <code>AURA30-FIRSTNAME-6RAND</code>) is minted, locked to that one student, valid through May 31 of the SY.</li>
        <li className="task-step">The code auto-applies on the student’s /pay page. You can also share it verbally.</li>
      </ol>

      <h4>Reviewing all issued vouchers</h4>
      <p>Main admin: <em>Admin → Fees → scroll to Personal early-bird vouchers</em>. Every dedicated code is listed with student name, branch, discount, expiry, and who issued it.</p>

      <h3 id="common-reminders">Automated payment reminders</h3>
      <p>Nobody sends reminders manually anymore. A daily cron at ~9 AM Manila time walks every active monthly / bi-annual student and emails up to three times per period:</p>
      <ul>
        <li><strong>5-day heads-up</strong> — window opens (30th of previous month for monthly, May 5 / Nov 5 for bi-annual).</li>
        <li><strong>Due tomorrow</strong> — the day before the 5th of the due month.</li>
        <li><strong>Past due</strong> — the day after the 5th if still unpaid.</li>
      </ul>
      <p>Every send is logged. To see who’s been reminded: <em>Payments → Notifications: Automated payment reminders</em>. Pick your window (7 / 30 / 90 / 365 days) and, if you like, search by name.</p>

      <div className="callout callout-note">
        <span className="label">If you don’t want a specific student emailed</span>
        Mark their account as disabled from <em>Users → Edit</em>. Disabled students are skipped by the cron and hidden from active listings. Re-enable when you want them back in the flow.
      </div>

      <h3 id="common-plan-switch">Switching a student’s payment plan mid-year</h3>
      <ol className="task-steps">
        <li className="task-step">Open the student’s profile. Scroll to the <strong>Plan change — Switch payment plan</strong> card (admin viewers only).</li>
        <li className="task-step">Pick the target plan. The card shows a live breakdown: target-plan tuition, less N% voucher (tuition only), + misc fee (not discounted), = gross on new plan, less already paid, = <strong>Balance to collect</strong>.</li>
        <li className="task-step">Open <em>Payments → + Record payment</em>. Pick the target plan, enter the balance number the card gave you, use a clear period (e.g. <code>First half SY 2026–2027 (plan change credit)</code>).</li>
        <li className="task-step">Take the payment. Confirm the row. The student is now on the new plan; every future badge, reminder, and Pending-by-deadline entry uses the new logic.</li>
      </ol>

      <h2 id="troubleshooting">8. Troubleshooting</h2>

      <h3>I don’t see a change I know was deployed</h3>
      <p>Your browser cached the old JS bundle. Hard-refresh: <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> on Mac, <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> on Windows / Linux. On iOS Safari, close the tab and re-open it. If it still doesn’t work after a hard-refresh, the deploy actually hasn’t landed yet — give it another 5 minutes.</p>

      <h3>A payment badge says the student is Due but they clearly paid</h3>
      <p>Almost always a period-text problem. Open the payment row (<em>Payments → Confirmed Payments</em>, click Edit) and check the period text. If it says <code>2026-2027</code>, <code>AY 2026-2027</code>, or anything else that doesn’t name a specific month, the system correctly refuses to attribute it. Change the period to <code>June 2026</code> (or whichever month the payment actually covered) and save.</p>

      <h3>A student’s badge shows “Owes for June 2026” but they never enrolled in June</h3>
      <p>The system assumes every monthly student was on the plan for the whole SY. For a late July enrollee, that means June looks unpaid. If the parent has a signed agreement waiving June, the fix is to record a zero-amount payment for June with the period <code>June 2026</code> and notes explaining the waiver — that clears the badge and leaves an audit trail.</p>

      <h3>I signed in as branch admin but I can’t create a main admin account</h3>
      <p>By design. Only the current main admin can mint another main admin. Ask <code>main@sapphireclinicseast.org</code> to make the account.</p>

      <h3>Where do I find the class portal’s server logs?</h3>
      <p>You don’t — logs live on the VPS. If something looks like a bug (a button that never saves, a payment that vanished), take a screenshot with the browser’s dev-tools console open (<kbd>Cmd/Ctrl</kbd> + <kbd>Option/Shift</kbd> + <kbd>J</kbd>) and hand it to the person maintaining the code. Screenshots with the console errors visible are worth ten written descriptions.</p>

      <hr style={{ border: 'none', borderTop: '1px solid var(--paper-3)', margin: '3rem 0 1rem' }} />
      <p style={{ fontSize: 12, color: 'var(--mid-gray)', textAlign: 'center' }}>
        Aura Academy for Learning · Sapphire Clinics East, Inc.<br />
        Handbook version 1 — reflects portal features as of the current deploy.
      </p>
    </div>
  )
}
