'use client'

// Force dynamic — matches /admin, /documents, and the sibling
// /admin/handbook. Without it Next.js serves a prerendered shell that
// hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, ADMIN_EMAIL } from '@/lib/session'

/**
 * Concrete hex values for the portal's CSS custom properties. Word (and
 * most .doc readers) can't resolve `var(--…)`, so the Word export bakes
 * these in. Kept in sync with globals.css.
 */
const EXPORT_PALETTE: Record<string, string> = {
  '--deep-teal': '#3D6B62',
  '--bright-teal': '#8AA76A',
  '--sage': '#8AA76A',
  '--clay': '#B8896A',
  '--mid-gray': '#6B6357',
  '--paper-2': '#ECE6D9',
  '--paper-3': '#DCD3C0',
  '--narra': '#3D6B62',
  '--font-display': "Montserrat, 'Helvetica Neue', Arial, sans-serif",
}

/**
 * A screenshot slot. Drop a PNG into class-portal/public/handbook/ with
 * the filename shown in the placeholder and it appears here. Until then
 * it renders a labelled placeholder so the clinic manager knows exactly
 * which image to capture — and empty slots are hidden from the PDF/Word
 * export (via .hb-figure--empty) so a half-illustrated handbook still
 * exports cleanly.
 */
function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  const [errored, setErrored] = useState(false)
  const file = src.split('/').pop()
  return (
    <figure className={`hb-figure${errored ? ' hb-figure--empty' : ''}`}>
      {errored ? (
        <div className="hb-figure-placeholder">
          <span className="hb-figure-ph-label">Screenshot to add</span>
          <code>{file}</code>
          <span className="hb-figure-ph-hint">Save this image into <code>public/handbook/</code></span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} onError={() => setErrored(true)} />
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/**
 * Main-admin-only user handbook for the STAFF PORTAL
 * (staff.sapphireclinicseast.org) — the clinicians' + office-staff app,
 * a separate system from this Class Portal. Lives here so the clinic
 * manager has both handbooks in one place, behind the same main-admin
 * gate as /admin/handbook.
 *
 * Content mirrors the account-type access model coded in the staff
 * portal (section-access.ts): CLINICIAN / FRONT_DESK / ADMIN_STAFF
 * presets, with role=ADMIN seeing everything plus the Admin Panel.
 *
 * Kept in one file (no separate content component) so the handbook is
 * easy to edit — the whole thing is scannable in a single view. Styles
 * are scoped via .handbook-root so they don't leak into the portal.
 */
export default function StaffPortalHandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  /**
   * Download the handbook as a Word document. Clones the rendered
   * content, drops the on-screen toolbar and any empty screenshot slots,
   * inlines the real screenshots as data URIs so the file is
   * self-contained, bakes CSS variables to hex (Word can't resolve
   * them), and wraps it in a Word-flavoured HTML document. Opens cleanly
   * in Word, Pages, and Google Docs.
   */
  async function downloadWord() {
    const el = contentRef.current
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.export-hide, .hb-figure--empty').forEach((n) => n.remove())
    // Inline same-origin screenshots as data URIs; drop any that fail so
    // the exported doc never carries a broken image reference.
    await Promise.all(
      Array.from(clone.querySelectorAll('img')).map(async (img) => {
        try {
          const res = await fetch(img.src)
          if (!res.ok) { img.remove(); return }
          const blob = await res.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(r.result as string)
            r.onerror = reject
            r.readAsDataURL(blob)
          })
          img.setAttribute('src', dataUrl)
        } catch {
          img.remove()
        }
      }),
    )
    let inner = clone.innerHTML
    for (const [k, v] of Object.entries(EXPORT_PALETTE)) {
      inner = inner.split(`var(${k})`).join(v)
    }
    const doc =
      '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Staff Portal Handbook</title></head>' +
      '<body style="font-family:\'Segoe UI\',Arial,sans-serif;color:#3D3A33;">' +
      `<div class="handbook-root">${inner}</div></body></html>`
    const blob = new Blob(['﻿', doc], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Staff-Portal-Handbook.doc'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const auth = getAuth()
    // Only the main admin (single email, not just role=ADMIN) can view.
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN' || auth.email !== ADMIN_EMAIL) {
      router.replace(auth.role === 'ADMIN' || auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    // Deliberate client-only auth gate: reveal the page only after the
    // localStorage auth check runs (auth isn't known during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div ref={contentRef} className="animate-fade-up max-w-4xl mx-auto handbook-root">
      {/* Handbook-specific styles. Scoped via .handbook-root so they
          don't leak into the rest of the portal. Mirrors the sibling
          /admin/handbook stylesheet so the two read as one family. */}
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
        .tag-clay  { background: #fde4d8; color: #9a4a2f; }
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
        .handbook-root .hb-figure { margin: 1rem 0 1.4rem; }
        .handbook-root .hb-figure img {
          display: block; max-width: 100%; height: auto;
          border-radius: 10px; border: 1px solid var(--paper-3);
          box-shadow: 0 2px 14px rgba(0,0,0,0.07);
        }
        .handbook-root .hb-figure figcaption {
          font-size: 12px; color: var(--mid-gray); margin-top: 7px;
          text-align: center; font-style: italic;
        }
        .handbook-root .hb-figure-placeholder {
          border: 1.5px dashed var(--paper-3); border-radius: 10px;
          background: var(--paper-2); padding: 1.6rem 1rem; text-align: center;
          display: flex; flex-direction: column; gap: 5px; align-items: center;
        }
        .handbook-root .hb-figure-ph-label {
          font-size: 10.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--sage);
        }
        .handbook-root .hb-figure-placeholder code {
          font-size: 12.5px; background: #fff; border: 1px solid var(--paper-3);
        }
        .handbook-root .hb-figure-ph-hint { font-size: 11.5px; color: var(--mid-gray); }
        @media print {
          .handbook-root .export-hide { display: none !important; }
          .handbook-root .hb-figure--empty { display: none !important; }
          .handbook-root .hb-figure img { box-shadow: none; }
          .handbook-root .hb-figure, .handbook-root .role-card, .handbook-root .callout { break-inside: avoid; }
          .handbook-root h2 { break-before: page; }
          .handbook-root h2:first-of-type { break-before: auto; }
        }
      `}</style>

      {/* Header + export actions. .export-hide keeps the toolbar out of
          both the printed PDF and the downloaded Word file. */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--bright-teal)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Aura Health Rehab · Staff Portal
          </div>
          <h1>Staff Portal — User Handbook</h1>
        </div>
        <div className="export-hide flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs whitespace-nowrap"
            onClick={() => window.print()}
          >
            Save as PDF
          </button>
          <button
            type="button"
            className="btn-secondary text-xs whitespace-nowrap"
            onClick={downloadWord}
          >
            Download as Word
          </button>
        </div>
      </div>

      <p className="lead">
        A practical guide to <code>staff.sapphireclinicseast.org</code> — the clinicians&rsquo; and office-staff
        portal (a separate system from this Class Portal). Written for each kind of account: the clinic manager
        (main admin), clinicians, and office employees (front desk / admin staff). Find your role, learn what you
        can see, and follow the step-by-step tasks.
      </p>

      <div className="callout callout-note export-hide">
        <span className="label">Adding screenshots · manager only</span>
        Each dashed box below is a screenshot slot. Capture that screen from the staff portal, save it with the exact
        filename shown in the box into <code>class-portal/public/handbook/</code>, and it appears here automatically.
        Slots you haven&rsquo;t filled yet are hidden from the exported PDF / Word, so you can share the handbook at
        any point. This note doesn&rsquo;t appear in the export.
      </div>

      <div className="quick-nav">
        <h4>Table of contents</h4>
        <ol>
          <li><a href="#getting-started">Getting started</a> — signing in, layout, branch toggle</li>
          <li><a href="#access">Your access at a glance</a> — the 4 account types + matrix</li>
          <li><a href="#features">Feature guide</a> — every page, and who can open it</li>
          <li><a href="#playbooks">Role playbooks</a> — clinician, employee, clinic manager</li>
          <li><a href="#tasks">Common tasks</a></li>
          <li><a href="#faq">FAQ &amp; troubleshooting</a></li>
        </ol>
      </div>

      {/* ── 1. GETTING STARTED ── */}
      <h2 id="getting-started">1. Getting started</h2>
      <p>Everything in this section applies to <strong>every</strong> account. Your account type only changes what
        you see once you&rsquo;re in — not how you sign in.</p>

      <h3>Signing in</h3>
      <ol>
        <li>Open <a href="https://staff.sapphireclinicseast.org">staff.sapphireclinicseast.org</a> in Chrome,
          Safari, or Edge. The old <code>teletherapy.*</code> address redirects here automatically.</li>
        <li>Enter your <strong>email</strong> and <strong>password</strong>, then press <strong>Sign In</strong>.</li>
        <li>Sessions stay signed in for 12 hours; after that you&rsquo;ll be asked to sign in again.</li>
      </ol>

      <Figure src="/handbook/01-login.png" alt="Staff Portal sign-in screen"
        caption="The sign-in screen at staff.sapphireclinicseast.org — enter your email and password." />

      <div className="callout callout-warn">
        <span className="label">If your email is changing</span>
        Your login email is the email on your HR staff profile. When HR updates it and it syncs to the portal, your
        login email <strong>changes with it automatically</strong> — and your <strong>password stays the same</strong>.
        If the new email doesn&rsquo;t work yet, the sync may not have run; ask the clinic manager to run the staff sync.
      </div>

      <h3>What you see once signed in</h3>
      <ul>
        <li><strong>Left sidebar</strong> — lists every page you have access to. On a phone, tap the <strong>☰ menu</strong> to open it.</li>
        <li><strong>Your name, department and branch</strong> sit at the bottom of the sidebar, with <strong>Sign Out</strong>.</li>
      </ul>

      <Figure src="/handbook/02-sidebar.png" alt="Staff Portal left sidebar navigation"
        caption="The left sidebar lists every page your account can open, with your details and Sign Out at the bottom." />

      <h3>The branch toggle (East / Greenhills)</h3>
      <p>If you work at <strong>both</strong> East and Greenhills, a toggle appears at the top once you&rsquo;re
        signed in. Switch it to view that branch&rsquo;s schedule, patients, and payslips. One login covers both
        branches — no second account needed. If you only work at one branch, no toggle appears. Branches read
        <strong> East Branch</strong> and <strong>Greenhills Branch</strong>.</p>

      <Figure src="/handbook/03-branch-toggle.png" alt="East / Greenhills branch toggle at the top of the portal"
        caption="Staff who work at both branches get a top-bar toggle to switch between East Branch and Greenhills Branch." />

      <h3>Forgot your password</h3>
      <p>On the sign-in screen, choose <strong>Forgot password?</strong>, enter your email, and follow the reset
        link sent to your inbox. If you don&rsquo;t have an account yet, the clinic manager creates one for you.</p>

      {/* ── 2. ACCESS ── */}
      <h2 id="access">2. Your access at a glance</h2>
      <p>There are four kinds of account. The clinic manager sets your type when creating your account, and it
        decides which pages appear in your sidebar.</p>

      <ul>
        <li><span className="tag tag-amber">Clinic manager</span> The main admin. Sees <strong>every page</strong>,
          plus the <strong>Admin Panel</strong> to manage accounts, branch emails, and the Directory.</li>
        <li><span className="tag tag-clay">Clinician</span> Clinical staff (OT, PT, SLP, SPED, Psychology, MD,
          Orthosis). Full clinical workspace — dashboard, schedule, patients, notes — plus the shared pages.</li>
        <li><span className="tag tag-info">Front desk</span> Office staff who greet and assist patients. The shared
          pages, plus <strong>What Patients Love About You</strong>. No clinical pages.</li>
        <li><span className="tag tag-info">Admin staff</span> Other administration roles. The shared pages only —
          no clinical pages and no Patients-Love wall.</li>
      </ul>

      <div className="overflow-x-auto">
      <table className="matrix">
        <thead>
          <tr>
            <th>Page</th>
            <th>Clinic manager</th>
            <th>Clinician</th>
            <th>Front desk</th>
            <th>Admin staff</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Dashboard</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Clinic Schedule</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Patients</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>What Patients Love About You</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td></tr>
          <tr><td>What your Peers Love About You</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Seminars &amp; Trainings</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Templates &amp; Forms</td><td className="yes">Yes</td><td className="yes">Own dept</td><td className="partial">All depts</td><td className="partial">All depts</td></tr>
          <tr><td>Manuals</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Directory</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Wellness Check</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Payroll</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Settings</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Admin Panel</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
        </tbody>
      </table>
      </div>

      <div className="callout callout-note">
        <span className="label">Two things the matrix can&rsquo;t show</span>
        <strong>Templates &amp; Forms</strong> — clinicians see their own department; office staff and the manager
        see every department in tabs. <strong>Manuals</strong> also carry an audience set at upload — <em>All staff</em>,
        <em> Admin employees only</em>, or <em>Clinicians only</em> — so even within &ldquo;sees Manuals,&rdquo; the
        specific manuals shown depend on who each one is meant for.
      </div>

      {/* ── 3. FEATURE GUIDE ── */}
      <h2 id="features">3. Feature guide</h2>
      <p>Every page in the portal, with a tag showing who can open it. Read the ones that carry your role.</p>

      <div className="role-card">
        <h3>Dashboard <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>The clinician&rsquo;s home screen. Shows <strong>today&rsquo;s sessions</strong> with each patient&rsquo;s
          status and whether the session note is done. Move day-to-day with the date arrows; jump back with
          <strong> Today</strong>. On the right sits the <strong>3 R&rsquo;s of Daily Scheduling</strong>.</p>
        <Figure src="/handbook/04-dashboard-3rs.png" alt="Dashboard showing today's sessions and the 3 R's reminder"
          caption="The Dashboard: today's sessions on the left, the 3 R's of Daily Scheduling reminder on the right." />
        <div className="callout callout-warn">
          <span className="label">The 3 R&rsquo;s — Release by 1 · Reply by 5 · Report by 8</span>
          <strong>RELEASE</strong> (before 1:00 PM) — Front Desk sends your next-day schedule for confirmation.
          &nbsp;<strong>REPLY</strong> (before 5:00 PM) — you confirm you&rsquo;ll attend tomorrow through the
          official channel. &nbsp;<strong>REPORT</strong> (by 8:00 AM) — you report a same-day absence and confirm
          it&rsquo;s acknowledged.
        </div>
      </div>

      <div className="role-card">
        <h3>Clinic Schedule <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>Your week of sessions across the branch(es) you work in. Use the branch toggle to view one branch at a time.</p>
        <Figure src="/handbook/05-clinic-schedule.png" alt="Clinic Schedule weekly view"
          caption="Clinic Schedule — your week of sessions; use the branch toggle to view one branch at a time." />

        <h3>Patients <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>Your patient list — searchable, with filters for <strong>Active</strong>, <strong>Read-only</strong>
          (previously assigned), and <strong>Discharged</strong>. Open a patient to see their profile, sessions,
          and documents (Initial Evaluations and Progress Reports).</p>
        <Figure src="/handbook/06-patients.png" alt="Patients list with Active, Read-only and Discharged filters"
          caption="Patients — searchable, with Active / Read-only / Discharged filters. Open a patient for their profile and documents." />

        <h3>Session Notes &amp; Reports <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>Write your <strong>session note</strong> from the session screen (OT, SLP, PT, SPED, and Psychology forms
          are built in), then <strong>send it to the patient by email</strong> — it arrives branded with the Aura
          Health logo, and the correct branch inbox is copied automatically. <strong>Initial Evaluation reports</strong>
          you&rsquo;ve uploaded can be emailed the same way.</p>
        <Figure src="/handbook/07-session-note.png" alt="Session note editor with Send to patient"
          caption="Write the session note, then Send to patient — it emails a branded copy with the branch inbox in CC." />
      </div>

      <div className="role-card">
        <h3>What Patients Love About You <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-info">Front desk</span></h3>
        <p>The kind words patients have shared about you, gathered from feedback. Clinicians at both branches see
          feedback from both; the clinic manager sees everyone&rsquo;s.</p>

        <h3>What your Peers Love About You <span className="tag tag-sage">Everyone</span></h3>
        <p>The strengths your colleagues named about you in peer evaluations — a positive wall. You see the feedback
          meant for you; the clinic manager sees all.</p>

        <h3>Seminars &amp; Trainings <span className="tag tag-sage">Everyone</span></h3>
        <p>Upcoming and past seminars and trainings, with the details you need to attend or catch up.</p>
      </div>

      <div className="role-card">
        <h3>Templates &amp; Forms <span className="tag tag-sage">Everyone</span></h3>
        <p>Downloadable department templates and links to fillable forms. Clinicians see their own department;
          <strong> office staff and the manager see every department</strong>, organised into tabs (OT, SLP, PT,
          SPED, MD, Orthosis, Psychology). Internal-only documents are available to office staff and the manager.</p>

        <h3>Manuals <span className="tag tag-sage">Everyone</span></h3>
        <p>Read-only department manuals, published from the HR Hub. Clinicians see manuals for their department;
          office staff see all departments. Each manual also has an <strong>audience</strong> (All staff / Admin
          employees only / Clinicians only) so you only see the ones meant for you.</p>
      </div>

      <div className="role-card">
        <h3>Directory <span className="tag tag-sage">Everyone</span> <span className="tag tag-amber">Manager can edit</span></h3>
        <p>Opens with <strong>Online Forms — Scan or Click</strong>: QR codes for the HR forms (Grievance, Incident
          Report, Staff Feedback, Staff Referral, Payroll Revision). Scan with your phone or tap a card. Three tabs:
          <strong> Branch Information</strong>, <strong>Emails</strong>, and <strong>Websites</strong> — filter and
          sort the tables; on a phone, swipe a table sideways to see every column. Only the clinic manager can add,
          edit, or delete entries and control who sees each one.</p>
        <Figure src="/handbook/08-directory-qr.png" alt="Directory landing with the Online Forms QR panel"
          caption="Directory opens with the Online Forms QR panel — scan with a phone or tap a card — above the Branch Information, Emails, and Websites tabs." />

        <h3>Wellness Check <span className="tag tag-sage">Everyone</span></h3>
        <p>A space to check in on staff wellbeing.</p>

        <h3>Payroll <span className="tag tag-sage">Everyone</span></h3>
        <p>Your payslips, pulled from the Accounting Hub. If you work at both branches, the branch toggle scopes
          payslips to East or Greenhills.</p>

        <h3>Settings <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>Your personal preferences.</p>
      </div>

      <div className="role-card">
        <h3>Admin Panel <span className="tag tag-amber">Clinic manager only</span></h3>
        <ul>
          <li><strong>Create and manage staff accounts</strong>, choosing each person&rsquo;s account type.</li>
          <li>Turn accounts <strong>Active / Inactive</strong>, reset passwords, and revise a staff member&rsquo;s
            email (which also updates their login).</li>
          <li>Set the <strong>Branch CC Emails</strong> (East / Greenhills) copied on session notes and reports.</li>
          <li>Manage the whole <strong>Directory</strong> and who can see each entry.</li>
        </ul>
        <Figure src="/handbook/09-admin-panel.png" alt="Admin Panel showing account management"
          caption="The Admin Panel (clinic manager only): create accounts and account types, reset passwords, set branch CC emails, and manage the Directory." />
      </div>

      {/* ── 4. PLAYBOOKS ── */}
      <h2 id="playbooks">4. Role playbooks</h2>

      <div className="role-card">
        <h3>Clinician <span className="tag tag-clay">Clinical account</span></h3>
        <p>Your daily clinical workspace.</p>
        <ul>
          <li>Start on the <strong>Dashboard</strong>; follow the 3 R&rsquo;s.</li>
          <li>See your week in <strong>Clinic Schedule</strong>.</li>
          <li>Open a patient, run the session, write the <strong>note</strong> and email it.</li>
          <li>Email <strong>Initial Evaluation reports</strong> to patients.</li>
          <li>See <strong>Patients-Love</strong> and <strong>Peers-Love</strong> about you.</li>
          <li>Reach templates, manuals, seminars, and payslips.</li>
          <li>Work at two branches? Use the <strong>branch toggle</strong>.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Employee <span className="tag tag-info">Front desk / Admin staff</span></h3>
        <p>The shared resources — no clinical pages.</p>
        <ul>
          <li><strong>Templates &amp; Forms</strong> for every department.</li>
          <li><strong>Manuals</strong> and <strong>Seminars &amp; Trainings</strong>.</li>
          <li><strong>Directory</strong> — emails, websites, branch info, and the form QR codes.</li>
          <li><strong>Payroll</strong> and <strong>Wellness Check</strong>.</li>
          <li>Peers-Love about you.</li>
          <li>Front Desk also sees <strong>What Patients Love About You</strong>.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Clinic manager <span className="tag tag-amber">Main admin</span></h3>
        <p>Everything above, plus the controls.</p>
        <ul>
          <li>See <strong>every</strong> page and all staff&rsquo;s feedback.</li>
          <li><strong>Admin Panel</strong>: create accounts and set account types.</li>
          <li>Activate / deactivate accounts; reset passwords.</li>
          <li>Revise a staff email (updates their login too).</li>
          <li>Set the <strong>Branch CC Emails</strong>.</li>
          <li>Curate the <strong>Directory</strong> and its visibility.</li>
        </ul>
      </div>

      {/* ── 5. COMMON TASKS ── */}
      <h2 id="tasks">5. Common tasks</h2>

      <h4>Email session notes to a patient <span className="tag tag-clay">Clinician</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the session from your <strong>Dashboard</strong> or <strong>Clinic Schedule</strong>.</li>
        <li className="task-step">Fill in and save the <strong>session note</strong>.</li>
        <li className="task-step">Choose <strong>Send to patient</strong>. The email goes out branded, with the branch inbox copied.</li>
      </ol>

      <h4>Send an Initial Evaluation report <span className="tag tag-clay">Clinician</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the patient in <strong>Patients</strong> and find the Initial Evaluation document.</li>
        <li className="task-step">Choose <strong>Send to patient</strong> — it emails the PDF, copies the branch inbox, and marks it sent.</li>
      </ol>

      <h4>Use the online forms (scan or click) <span className="tag tag-sage">Everyone</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Directory</strong>. The <strong>Online Forms</strong> panel is at the top.</li>
        <li className="task-step"><strong>Scan</strong> a QR code with your phone camera, or <strong>tap</strong> a card to open the form.</li>
      </ol>

      <h4>Add a Directory email or website <span className="tag tag-amber">Clinic manager</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Directory</strong> → the <strong>Emails</strong> or <strong>Websites</strong> tab.</li>
        <li className="task-step">Choose <strong>Add</strong>, fill in the details, and pick the department / branch it belongs to.</li>
        <li className="task-step">Set <strong>who can view it</strong>, then save.</li>
      </ol>

      <h4>Create a staff account <span className="tag tag-amber">Clinic manager</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the <strong>Admin Panel</strong> and choose <strong>Add account</strong>.</li>
        <li className="task-step">Pick the staff member and set a temporary password.</li>
        <li className="task-step">Choose the <strong>account type</strong> — Clinician, Front Desk, Admin Staff, or Admin — which sets
          what they can see. Save, and share the sign-in details.</li>
      </ol>

      <h4>Choose who can read a manual <span className="tag tag-amber">Clinic manager</span></h4>
      <ol className="task-steps">
        <li className="task-step">Manuals are uploaded in the <strong>HR Hub</strong> (not the Staff Portal).</li>
        <li className="task-step">When uploading, pick <strong>Who can see this</strong> — All staff, Admin employees only, or
          Clinicians only — then flag <strong>Show in Staff Portal</strong>.</li>
      </ol>

      {/* ── 6. FAQ ── */}
      <h2 id="faq">6. FAQ &amp; troubleshooting</h2>

      <h3>My email changed — which email do I log in with?</h3>
      <p>Log in with your <strong>new</strong> email. When HR updates your email and it syncs to the portal, your
        login email switches to match automatically — and your <strong>password stays the same</strong>. If the new
        email doesn&rsquo;t work yet, the sync may not have run; ask the clinic manager to run the staff sync.</p>

      <h3>I don&rsquo;t see the branch toggle</h3>
      <p>The East / Greenhills toggle only appears if you&rsquo;re set up at <strong>both</strong> branches on one
        login. If you work at a single branch, there&rsquo;s nothing to switch — this is normal.</p>

      <h3>Some pages are missing from my sidebar</h3>
      <p>You only see the pages your <strong>account type</strong> allows — see <a href="#access">Your access at a
        glance</a>. For example, office staff don&rsquo;t see Dashboard, Clinic Schedule, or Patients. If you think
        your type is wrong, ask the clinic manager to adjust it in the Admin Panel.</p>

      <h3>On my phone, the Directory table is cut off</h3>
      <p>The Emails and Websites tables <strong>scroll sideways</strong> on small screens — swipe the table
        left / right to see every column.</p>

      <h3>The portal briefly showed an error or wouldn&rsquo;t load</h3>
      <p>Short blips can happen during a system update. Wait a few seconds and <strong>refresh</strong>
        (<kbd>Cmd/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> for a hard refresh). If it persists, tell the clinic manager.</p>

      <h3>Who do I contact for account help?</h3>
      <p>The <strong>clinic manager</strong> (main admin) manages all staff-portal accounts — creating logins,
        resetting passwords, changing account types, and turning accounts active or inactive.</p>

      <hr style={{ border: 'none', borderTop: '1px solid var(--paper-3)', margin: '3rem 0 1rem' }} />
      <p style={{ fontSize: 12, color: 'var(--mid-gray)', textAlign: 'center' }}>
        Aura Health Rehab · Sapphire Clinics East, Inc.<br />
        Staff Portal handbook — reflects portal features as of the current deploy. Access shown reflects account
        type; the clinic manager can adjust it anytime.
      </p>
    </div>
  )
}
