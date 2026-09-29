'use client'

// Force dynamic — matches /admin, /documents, and the sibling
// /admin/handbook. Without it Next.js serves a prerendered shell that
// hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'

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
 * Searchable index for the "Search this handbook" box under Help. Each
 * entry points at a section anchor so a reader can type a word (e.g.
 * "referral", "loan", "confidential") and jump straight to where it is
 * explained. Keep an entry per meaningful term/button so the search feels
 * complete. `kw` holds extra words a person might type that aren't already
 * in the label or blurb.
 */
type SearchEntry = { label: string; anchor: string; where: string; blurb: string; kw?: string }
const SEARCH_INDEX: SearchEntry[] = [
  { label: 'Signing in', anchor: '#getting-started', where: 'Getting started', blurb: 'Where and how to log in, and how long you stay signed in.', kw: 'login log in password email sign in' },
  { label: 'Forgot password', anchor: '#getting-started', where: 'Getting started', blurb: 'Reset your password from the sign-in screen.', kw: 'reset forgot lost password' },
  { label: 'Branch toggle (East / Greenhills)', anchor: '#getting-started', where: 'Getting started', blurb: 'Switch which branch you are viewing when you work at both.', kw: 'branch switch east greenhills toggle' },
  { label: 'Notification bell', anchor: '#bell', where: 'Getting started', blurb: 'The red-dot bell, top-right — new replies, uploads, trainings and more.', kw: 'notifications bell alerts red dot unread' },
  { label: 'Concerns button (raise a ticket)', anchor: '#concerns', where: 'Getting started', blurb: 'The floating Concerns? button to report a portal problem.', kw: 'ticket concern help support problem bug report' },
  { label: 'Account types & access', anchor: '#access', where: 'Your access', blurb: 'The five kinds of account and what each one can open.', kw: 'permissions role clinician front desk admin intern access matrix' },
  { label: 'Dashboard', anchor: '#f-dashboard', where: 'Feature guide', blurb: "Today's sessions and the 3 R's reminder.", kw: 'home today 3 rs release reply report' },
  { label: 'Clinic Schedule', anchor: '#f-schedule', where: 'Feature guide', blurb: 'Your week of sessions; open one to write its note.', kw: 'calendar week sessions schedule trends' },
  { label: 'Patients', anchor: '#f-patients', where: 'Feature guide', blurb: 'Your patient list, filters, and the patient profile.', kw: 'patient list active discharged read-only search' },
  { label: 'Home Progress uploads (patient videos / voice / photos)', anchor: '#f-patients', where: 'Feature guide', blurb: 'See what patients upload from home — videos, voice notes, photos.', kw: 'home progress upload video voice note photo caregiver' },
  { label: "PWD ID & Doctor's Referral", anchor: '#f-patients', where: 'Feature guide', blurb: 'View the PWD ID and doctor referral on the patient.', kw: 'pwd id doctor referral document' },
  { label: 'Session notes & reports', anchor: '#f-notes', where: 'Feature guide', blurb: 'Write, complete, edit, delete, and email a session note.', kw: 'note report initial evaluation IE send email complete edit delete' },
  { label: 'Confidential notes & "Show to Others"', anchor: '#f-notes', where: 'Feature guide', blurb: 'Psychology & MD notes are private by default; tick to share.', kw: 'confidential psychology md medical show to others private share' },
  { label: 'What Patients Love About You', anchor: '#f-love', where: 'Feature guide', blurb: 'Kind words patients shared about you.', kw: 'feedback love patients praise' },
  { label: 'What your Peers Love About You', anchor: '#f-love', where: 'Feature guide', blurb: 'Strengths colleagues named in peer evaluations.', kw: 'peers colleagues praise evaluation' },
  { label: 'Seminars & Trainings', anchor: '#f-seminars', where: 'Feature guide', blurb: 'Upcoming and past seminars and trainings.', kw: 'seminar training webinar cpd' },
  { label: 'Templates & Forms', anchor: '#f-templates', where: 'Feature guide', blurb: 'Department templates and fillable forms.', kw: 'template form download document' },
  { label: 'Manuals', anchor: '#f-manuals', where: 'Feature guide', blurb: 'Read-only department manuals with an Ask-the-manual chat.', kw: 'manual handbook pdf read chat ask' },
  { label: 'Directory', anchor: '#f-directory', where: 'Feature guide', blurb: 'Online-form QR codes, branch info, emails and websites.', kw: 'directory qr forms emails websites branch contact' },
  { label: 'Wellness Check', anchor: '#f-wellness', where: 'Feature guide', blurb: 'Check in on staff wellbeing.', kw: 'wellness wellbeing survey mental health' },
  { label: 'Payroll', anchor: '#f-payroll', where: 'Feature guide', blurb: 'Your payslips, per branch.', kw: 'payslip salary pay payroll' },
  { label: 'Loans & Perks', anchor: '#f-loans', where: 'Feature guide', blurb: 'BDO loan calculator for all; Company Loan for employees.', kw: 'loan bdo calculator company perks benefits deduction' },
  { label: 'Internship', anchor: '#f-internship', where: 'Feature guide', blurb: 'Supervise interns, or (as an intern) your own learning tabs.', kw: 'intern internship supervisor learning outcomes balik-tanaw grades documents learning profiles' },
  { label: 'Grades (4-point scale)', anchor: '#f-internship', where: 'Feature guide', blurb: 'Grade interns on the 1.00–4.00 scale with the rubric.', kw: 'grade grading rubric 4 point scale mark' },
  { label: 'Balik-Tanaw', anchor: '#f-internship', where: 'Feature guide', blurb: "Interns' weekly reflection, signed by the supervisor.", kw: 'balik tanaw reflection weekly intern' },
  { label: 'Learning Outcomes / Learning Profile', anchor: '#f-internship', where: 'Feature guide', blurb: "An intern's goals and learning preferences.", kw: 'learning outcomes profile goals preferences intern' },
  { label: 'Mentorship', anchor: '#f-mentorship', where: 'Feature guide', blurb: "Mentors read mentees' notes; both use Meetings.", kw: 'mentor mentee mentorship notes fee' },
  { label: 'Mentorship fee', anchor: '#f-mentorship', where: 'Feature guide', blurb: 'Each mentorship meeting is paid to the mentor, deducted from the mentee.', kw: 'fee paid deduction payroll compensation mentor' },
  { label: 'Meetings (Set a Meeting / Availability / Schedule)', anchor: '#meetings', where: 'Meetings', blurb: 'Book or create a video meeting and manage availability.', kw: 'meeting video link availability set a meeting schedule join record' },
  { label: 'Set a Meeting — With a person', anchor: '#meetings', where: 'Meetings', blurb: 'Book someone who published availability.', kw: 'book person availability meeting' },
  { label: 'Set a Meeting — Just create a link', anchor: '#meetings', where: 'Meetings', blurb: 'Make a meeting link and tick who to invite.', kw: 'create link invite meeting' },
  { label: 'My Availability', anchor: '#meetings', where: 'Meetings', blurb: 'Publish the times people can book you.', kw: 'availability schedule times publish calendly' },
  { label: 'Settings (PRC / PTR / signature)', anchor: '#f-settings', where: 'Feature guide', blurb: 'Your credentials and e-signature.', kw: 'settings prc ptr license signature profile' },
  { label: 'Tickets (admin)', anchor: '#f-tickets', where: 'Feature guide', blurb: 'Where the clinic manager answers raised concerns.', kw: 'ticket concern support admin answer resolve' },
  { label: 'Admin Panel', anchor: '#f-admin', where: 'Feature guide', blurb: 'Create accounts, set types, branch CC emails, Directory.', kw: 'admin accounts create password branch cc email directory manage' },
  { label: 'Email a session note to a patient', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to send a note by email.', kw: 'send email note patient task' },
  { label: 'Add a meeting', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to schedule a supervision/mentorship meeting.', kw: 'add meeting create task internship mentorship' },
  { label: 'Grade an intern', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to enter a grade on the 4-point scale.', kw: 'grade intern task rubric' },
  { label: 'Create a staff account', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step for the clinic manager.', kw: 'create account staff admin task' },
]

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
 * Content mirrors the access model coded in the staff portal
 * (section-access.ts + the layout's role gates): CLINICIAN / FRONT_DESK /
 * ADMIN_STAFF / INTERN presets, role=ADMIN sees everything plus the Admin
 * Panel, and the Internship / Mentorship sections are additionally gated
 * by HR tags (internship supervisor, clinical mentor, mentee).
 *
 * Kept in one file (no separate content component) so the handbook is
 * easy to edit — the whole thing is scannable in a single view. Styles
 * are scoped via .handbook-root so they don't leak into the portal.
 */
export default function StaffPortalHandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCH_INDEX.filter((e) =>
      (e.label + ' ' + e.where + ' ' + e.blurb + ' ' + (e.kw ?? '')).toLowerCase().includes(q),
    ).slice(0, 12)
  }, [query])

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
    // Only the main admin can view. 'ADMIN' is the single main-admin auth
    // role (branch admins are BRANCH_ADMIN; ADMIN can't be assigned to
    // created users), so a role check identifies them and stays correct
    // across the staff-email transition.
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN') {
      router.replace(auth.role === 'BRANCH_ADMIN' ? '/admin'
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
        /* A named button / control in the portal — makes "click X" scannable. */
        .handbook-root .ui {
          font-weight: 600; color: var(--deep-teal);
          background: var(--paper-2); border: 1px solid var(--paper-3);
          border-radius: 5px; padding: 0 5px; white-space: nowrap;
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
        .tag-plum  { background: #ede9fe; color: #6d28d9; }
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
        .handbook-root .callout-tip { border-left: 3px solid var(--sage); background: #f0fdf4; }
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
        /* Help — word search box + results */
        .handbook-root .hb-search input {
          width: 100%; box-sizing: border-box; font-size: 15px;
          padding: 0.7rem 0.9rem; border-radius: 10px;
          border: 1px solid var(--paper-3); background: #fff; color: var(--deep-teal);
        }
        .handbook-root .hb-search input:focus { outline: 2px solid var(--sage); outline-offset: 1px; }
        .handbook-root .hb-search-results { list-style: none; padding-left: 0; margin: 0.75rem 0 0; }
        .handbook-root .hb-search-results li { margin: 0; border-bottom: 1px solid var(--paper-2); }
        .handbook-root .hb-search-results a { display: block; padding: 0.6rem 0.2rem; border-bottom: none; }
        .handbook-root .hb-result-label { font-weight: 600; color: var(--deep-teal); }
        .handbook-root .hb-result-where {
          font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--sage); margin-left: 8px;
        }
        .handbook-root .hb-result-blurb { display: block; font-size: 12.5px; color: var(--mid-gray); margin-top: 2px; }
        .handbook-root .hb-search-empty { font-size: 13px; color: var(--mid-gray); margin-top: 0.6rem; }
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
          <button type="button" className="btn-secondary text-xs whitespace-nowrap" onClick={() => window.print()}>
            Save as PDF
          </button>
          <button type="button" className="btn-secondary text-xs whitespace-nowrap" onClick={downloadWord}>
            Download as Word
          </button>
        </div>
      </div>

      <p className="lead">
        A step-by-step guide to <code>staff.sapphireclinicseast.org</code> — the clinicians&rsquo; and office-staff
        portal (a separate system from this Class Portal). Written so someone opening the portal for the
        <strong> first time</strong> can find their way: what every page is for, what each button does, and how to
        move through the tabs and sub-tabs. Find your role, learn what you can see, and follow the tasks. Stuck on a
        word? Jump to <a href="#help">Help</a> and search this handbook.
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
          <li><a href="#getting-started">Getting started</a> — signing in, the layout, branch toggle, notification bell, Concerns button</li>
          <li><a href="#access">Your access at a glance</a> — the five account types + a full page-by-page matrix</li>
          <li><a href="#features">Feature guide</a> — every page and sub-tab, button by button</li>
          <li><a href="#meetings">Meetings</a> — booking, links, and availability (Internship &amp; Mentorship)</li>
          <li><a href="#playbooks">Role playbooks</a> — clinician, employee, manager, intern, mentor &amp; mentee</li>
          <li><a href="#tasks">Common tasks</a> — click-by-click walkthroughs</li>
          <li><a href="#help">Help</a> — search this handbook + FAQ &amp; troubleshooting</li>
        </ol>
      </div>

      {/* ── 1. GETTING STARTED ── */}
      <h2 id="getting-started">1. Getting started</h2>
      <p>Everything in this section applies to <strong>every</strong> account. Your account type only changes what
        you see once you&rsquo;re in — not how you sign in.</p>

      <h3>Signing in</h3>
      <ol className="task-steps">
        <li className="task-step">Open <a href="https://staff.sapphireclinicseast.org">staff.sapphireclinicseast.org</a> in
          Chrome, Safari, or Edge. The old <code>teletherapy.*</code> address redirects here automatically.</li>
        <li className="task-step">Type your <strong>email</strong> and <strong>password</strong>, then click <span className="ui">Sign In</span>.</li>
        <li className="task-step">You stay signed in for about 12 hours. After that, sign in again. Use <span className="ui">Sign Out</span> at
          the bottom of the sidebar when you&rsquo;re on a shared computer.</li>
      </ol>

      <Figure src="/handbook/01-login.png" alt="Staff Portal sign-in screen"
        caption="The sign-in screen at staff.sapphireclinicseast.org — enter your email and password, then Sign In." />

      <div className="callout callout-warn">
        <span className="label">If your email is changing</span>
        Your login email is the email on your HR staff profile. When HR updates it and it syncs to the portal, your
        login email <strong>changes with it automatically</strong> — and your <strong>password stays the same</strong>.
        Your <em>old</em> email keeps working as a backup too, so you&rsquo;re never locked out. If the new email
        doesn&rsquo;t work yet, the sync may not have run; ask the clinic manager to run the staff sync.
      </div>

      <h3>What you see once signed in</h3>
      <ul>
        <li><strong>Left sidebar</strong> — the list of every page you can open. The page you&rsquo;re on is highlighted.
          On a phone, the sidebar is hidden — tap the <span className="ui">☰</span> menu (top-left) to open it, and tap a
          page to jump there.</li>
        <li><strong>Top bar</strong> — on the right sit the <strong>notification bell</strong> and, if you work at both
          branches, the <strong>branch toggle</strong>.</li>
        <li><strong>Your name, department and branch</strong> sit at the very bottom of the sidebar, with the
          <span className="ui">Sign Out</span> button.</li>
        <li><strong>Concerns?</strong> — a floating button in the bottom-right corner for reporting a portal problem
          (see below). The clinic manager sees a <strong>Tickets</strong> page instead.</li>
      </ul>

      <Figure src="/handbook/02-sidebar.png" alt="Staff Portal left sidebar navigation"
        caption="The left sidebar lists every page your account can open, with your details and Sign Out at the bottom, and the bell + branch toggle across the top." />

      <h3 id="bell">The notification bell</h3>
      <p>The <span className="ui">🔔 bell</span> at the top-right tells you when something needs your attention. A
        <strong> red number</strong> means unread items; open the bell and the number turns grey — it stays grey after
        that, even after you sign out and back in, so you&rsquo;re not nagged twice. Click any item to jump straight to
        the page it&rsquo;s about. What appears depends on your role, for example:</p>
      <ul>
        <li><strong>Everyone</strong> — a reply to a Concern (ticket) you raised.</li>
        <li><strong>Clinicians</strong> — a patient assigned to you uploaded their PWD ID, doctor&rsquo;s referral, or
          Home Progress; new kind words on <em>What Patients Love</em> / <em>What your Peers Love</em>; a new training
          for your department.</li>
        <li><strong>Clinical supervisors</strong> — an intern submitted a Learning Profile, Document, or Balik-Tanaw.</li>
        <li><strong>The clinic manager</strong> — new ticket submissions.</li>
      </ul>
      <Figure src="/handbook/10-notification-bell.png" alt="Notification bell with a red unread count, open to a list"
        caption="The bell (top-right): a red count for unread items that turns grey once you open it. Click an item to jump to it." />

      <h3 id="concerns">The Concerns button (raise a ticket)</h3>
      <p>Something not working, or a question for the office? Click the floating <span className="ui">Concerns?</span> button
        in the bottom-right, type your message, and send. The clinic manager receives it under <strong>Tickets</strong>,
        and when they reply you&rsquo;ll get a notification on your bell. (The clinic manager doesn&rsquo;t see the
        floating button — they work from the Tickets page.)</p>

      <h3>The branch toggle (East / Greenhills)</h3>
      <p>If you work at <strong>both</strong> East and Greenhills, a toggle appears at the top once you&rsquo;re
        signed in. Click <span className="ui">East Branch</span> or <span className="ui">Greenhills Branch</span> to view
        that branch&rsquo;s schedule, patients, meeting people, and payslips. One login covers both branches — no second
        account needed. If you only work at one branch, no toggle appears (this is normal).</p>

      <Figure src="/handbook/03-branch-toggle.png" alt="East / Greenhills branch toggle at the top of the portal"
        caption="Staff who work at both branches get a top-bar toggle to switch between East Branch and Greenhills Branch." />

      <h3>Forgot your password</h3>
      <p>On the sign-in screen, click <span className="ui">Forgot password?</span>, enter your email, and follow the
        reset link sent to your inbox. If you don&rsquo;t have an account yet, the clinic manager creates one for you.</p>

      {/* ── 2. ACCESS ── */}
      <h2 id="access">2. Your access at a glance</h2>
      <p>The clinic manager sets your <strong>account type</strong> when creating your account, and it decides which
        pages appear in your sidebar. There are five types:</p>

      <ul>
        <li><span className="tag tag-amber">Clinic manager</span> The main admin. Sees <strong>every page</strong>,
          plus the <strong>Admin Panel</strong> and <strong>Tickets</strong>.</li>
        <li><span className="tag tag-clay">Clinician</span> Clinical staff (OT, PT, SLP, SPED, Psychology, MD,
          Orthosis). The full clinical workspace — dashboard, schedule, patients, notes — plus the shared pages.</li>
        <li><span className="tag tag-info">Front desk</span> Office staff who greet and assist patients. The shared
          pages, plus <strong>What Patients Love About You</strong>. No clinical pages.</li>
        <li><span className="tag tag-info">Admin staff</span> Other administration roles. The shared pages only — no
          clinical pages and no Patients-Love wall.</li>
        <li><span className="tag tag-plum">Intern</span> A trainee on clinical rotation. A trimmed portal: Dashboard,
          Clinic Schedule, Seminars, Templates, Manuals, Directory, Wellness Check, <strong>Internship</strong>, and
          Settings. Interns write session notes, but only their supervisor can email a note to a patient.</li>
      </ul>

      <div className="callout callout-note">
        <span className="label">Two sections are unlocked by an HR tag, not the account type</span>
        <strong>Internship</strong> appears for anyone tagged as an <em>internship supervisor</em> in HR, for
        <strong> Intern</strong> accounts, and for the manager. <strong>Mentorship</strong> appears for anyone tagged
        as a <em>Clinical Mentor</em>, for their <em>mentees</em>, and for the manager. Everyone else never sees them.
      </div>

      <div className="overflow-x-auto">
      <table className="matrix">
        <thead>
          <tr>
            <th>Page</th>
            <th>Clinic manager</th>
            <th>Clinician</th>
            <th>Front desk</th>
            <th>Admin staff</th>
            <th>Intern</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Dashboard</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
          <tr><td>Clinic Schedule</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
          <tr><td>Patients</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>What Patients Love About You</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>What your Peers Love About You</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td></tr>
          <tr><td>Seminars &amp; Trainings</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Templates &amp; Forms</td><td className="yes">Yes</td><td className="yes">Own dept</td><td className="partial">All depts</td><td className="partial">All depts</td><td className="yes">Yes</td></tr>
          <tr><td>Manuals</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Directory</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Wellness Check</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
          <tr><td>Payroll</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td></tr>
          <tr><td>Loans &amp; Perks</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td></tr>
          <tr><td>Internship</td><td className="yes">Yes</td><td className="partial">If supervisor</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
          <tr><td>Mentorship</td><td className="yes">Yes</td><td className="partial">If mentor / mentee</td><td className="no">—</td><td className="no">—</td><td className="partial">If mentee</td></tr>
          <tr><td>Settings</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="yes">Yes</td></tr>
          <tr><td>Tickets</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
          <tr><td>Admin Panel</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
        </tbody>
      </table>
      </div>

      <div className="callout callout-note">
        <span className="label">Two things the matrix can&rsquo;t show</span>
        <strong>Templates &amp; Forms</strong> — clinicians see their own department; office staff and the manager see
        every department in tabs. <strong>Manuals</strong> also carry an audience set at upload — <em>All staff</em>,
        <em> Admin employees only</em>, or <em>Clinicians only</em> — so even within &ldquo;sees Manuals,&rdquo; the
        specific manuals shown depend on who each one is meant for. Everyone except the manager also has the floating
        <strong> Concerns?</strong> button; the manager has the <strong>Tickets</strong> page instead.
      </div>

      {/* ── 3. FEATURE GUIDE ── */}
      <h2 id="features">3. Feature guide</h2>
      <p>Every page in the portal, with a tag showing who can open it, and a walk-through of the buttons and tabs
        inside. Read the ones that carry your role — but feel free to skim the rest.</p>

      <div className="role-card">
        <h3 id="f-dashboard">Dashboard <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-plum">Intern</span></h3>
        <p>The clinical home screen — the first page after signing in. It shows <strong>today&rsquo;s sessions</strong>,
          each with the patient&rsquo;s name, time, status, and whether the session note is done.</p>
        <ul>
          <li><strong>Move between days</strong> — click the <span className="ui">‹</span> / <span className="ui">›</span> arrows
            beside the date to step back or forward a day; click <span className="ui">Today</span> to jump back to today.</li>
          <li><strong>Open a session</strong> — click a session row to go to its screen, where you write or read the note.</li>
          <li><strong>3 R&rsquo;s of Daily Scheduling</strong> — a reminder panel on the right (see the callout).</li>
        </ul>
        <Figure src="/handbook/04-dashboard-3rs.png" alt="Dashboard showing today's sessions and the 3 R's reminder"
          caption="The Dashboard: today's sessions on the left (click one to open it), the 3 R's reminder on the right." />
        <div className="callout callout-warn">
          <span className="label">The 3 R&rsquo;s — Release by 1 · Reply by 5 · Report by 8</span>
          <strong>RELEASE</strong> (before 1:00 PM) — Front Desk sends your next-day schedule for confirmation.
          &nbsp;<strong>REPLY</strong> (before 5:00 PM) — you confirm you&rsquo;ll attend tomorrow through the
          official channel. &nbsp;<strong>REPORT</strong> (by 8:00 AM) — you report a same-day absence and confirm
          it&rsquo;s acknowledged.
        </div>
      </div>

      <div className="role-card">
        <h3 id="f-schedule">Clinic Schedule <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-plum">Intern</span></h3>
        <p>Your week of sessions across the branch(es) you work in. Click a session to open it and write its note. Use
          the <strong>branch toggle</strong> (top bar) to view one branch at a time. The clinic manager also gets a
          <strong> Session Trends</strong> chart here — filter it by department, clinician, and year to see session
          volumes over time.</p>
        <Figure src="/handbook/05-clinic-schedule.png" alt="Clinic Schedule weekly view"
          caption="Clinic Schedule — your week of sessions; click one to open it. Managers also see a Session Trends chart." />
      </div>

      <div className="role-card">
        <h3 id="f-patients">Patients <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span></h3>
        <p>Your patient list. Use the <strong>search box</strong> to find someone by name, and the filter buttons to
          narrow the list:</p>
        <ul>
          <li><span className="ui">Active</span> — patients currently assigned to you.</li>
          <li><span className="ui">Read-only</span> — patients you saw before but are no longer assigned; you can read
            their history but not edit.</li>
          <li><span className="ui">Discharged</span> — patients who have completed care.</li>
        </ul>
        <p><strong>Open a patient</strong> (click their row) for their profile, contact details, session history, and
          documents. Inside a patient you&rsquo;ll find:</p>
        <ul>
          <li><strong>Documents</strong> — the <strong>Initial Evaluation</strong> and <strong>Progress Reports</strong>,
            plus the patient&rsquo;s <strong>PWD ID</strong> and <strong>Doctor&rsquo;s Referral</strong> when uploaded.</li>
          <li><strong>Home Progress</strong> — the videos, voice notes, and photos the patient (or their caregiver)
            uploads from home in the Client Portal. Open a date to view them; use the <strong>From / To date filter</strong>
            to focus on a period. The Doctor&rsquo;s Referral has its own card, so it isn&rsquo;t repeated here.</li>
          <li><strong>Session notes</strong> — each past session with its note. Each note you authored shows
            <span className="ui">Edit notes</span> and <span className="ui">Delete note</span> (see below) unless it&rsquo;s
            locked.</li>
        </ul>
        <Figure src="/handbook/06-patients.png" alt="Patients list with Active, Read-only and Discharged filters"
          caption="Patients — search, then filter by Active / Read-only / Discharged. Open a patient for their profile, documents, and Home Progress uploads." />
      </div>

      <div className="role-card">
        <h3 id="f-notes">Session Notes &amp; Reports <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-plum">Intern</span></h3>
        <p>Open a session (from the Dashboard, Clinic Schedule, or a patient) to write its note. The portal has
          <strong> built-in note forms</strong> for OT, SLP, PT, SPED, and Psychology — fill the fields and the note is
          formatted for you; other departments get a free-text note.</p>
        <ul>
          <li><span className="ui">Complete</span> — saves the note and marks the session done.</li>
          <li><span className="ui">Edit</span> — reopen a completed note to make changes (an edit history is kept).</li>
          <li><span className="ui">Delete note</span> — remove the note entirely (with a confirm). Use this only to undo
            a mistake; it can&rsquo;t be undone. Locked notes can&rsquo;t be deleted.</li>
          <li><span className="ui">Send Notes to Patient&rsquo;s Email</span> — emails the patient a branded copy, with
            the correct branch inbox copied automatically. <strong>Interns can&rsquo;t send</strong> — only the
            supervisor can.</li>
        </ul>
        <p><strong>Initial Evaluation reports</strong> you upload to a patient can be emailed the same way, with the PDF
          attached.</p>
        <div className="callout callout-warn">
          <span className="label">Psychology &amp; Medical (MD) notes are confidential by default</span>
          For Psychology and MD, a completed note is <strong>private</strong> — hidden from other departments and from
          the patient in their portal. On the completed note there&rsquo;s a <span className="ui">Show to Others</span>
          tick-box: tick it only if you want other departments involved in the patient&rsquo;s care — and the patient —
          to see that note. When you press <span className="ui">Send Notes to Patient&rsquo;s Email</span> on an MD note,
          the portal asks you to confirm first, since these notes are sensitive. All other professions work as before —
          patients keep access to their notes.
        </div>
        <Figure src="/handbook/07-session-note.png" alt="Completed session note with Show to Others, Edit, Delete and Send"
          caption="A completed note: Edit / Delete at the top, the confidential 'Show to Others' tick-box for Psychology & MD, and Send Notes to Patient's Email at the bottom." />
      </div>

      <div className="role-card">
        <h3 id="f-love">What Patients Love About You <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-info">Front desk</span></h3>
        <p>The kind words patients have shared about you, gathered from feedback. Clinicians at both branches see
          feedback from both; the clinic manager sees everyone&rsquo;s.</p>

        <h3>What your Peers Love About You <span className="tag tag-sage">Everyone (except interns)</span></h3>
        <p>The strengths your colleagues named about you in peer evaluations — a positive wall. You see the feedback
          meant for you; the clinic manager sees all.</p>

        <h3 id="f-seminars">Seminars &amp; Trainings <span className="tag tag-sage">Everyone</span></h3>
        <p>Upcoming and past seminars and trainings, with the details you need to attend or catch up.</p>
      </div>

      <div className="role-card">
        <h3 id="f-templates">Templates &amp; Forms <span className="tag tag-sage">Everyone</span></h3>
        <p>Downloadable department templates and links to fillable forms. Clinicians see their own department; office
          staff and the manager see <strong>every department</strong>, organised into tabs (OT, SLP, PT, SPED, MD,
          Orthosis, Psychology). Click a tab, then click a template to download or open it. Internal-only documents are
          available to office staff and the manager.</p>

        <h3 id="f-manuals">Manuals <span className="tag tag-sage">Everyone</span></h3>
        <p>Read-only department manuals, published from the HR Hub. Click a manual to open the <strong>viewer</strong>,
          turn pages, and read on-screen — manuals are <strong>view-only and can&rsquo;t be downloaded</strong>. Some
          manuals include an <strong>Ask the manual</strong> chat: type a question and it answers from that manual&rsquo;s
          contents. You only see manuals meant for your department and audience.</p>
      </div>

      <div className="role-card">
        <h3 id="f-directory">Directory <span className="tag tag-sage">Everyone</span> <span className="tag tag-amber">Manager can edit</span></h3>
        <p>Opens with <strong>Online Forms — Scan or Click</strong>: QR codes for the HR forms (Grievance, Incident
          Report, Staff Feedback, Staff Referral, Payroll Revision). Scan a code with your phone camera, or tap a card
          to open the form. Below that are three tabs:</p>
        <ul>
          <li><span className="ui">Branch Information</span> — addresses and details for each branch.</li>
          <li><span className="ui">Emails</span> — official email addresses; filter and sort the table.</li>
          <li><span className="ui">Websites</span> — useful links.</li>
        </ul>
        <p>On a phone, <strong>swipe a table sideways</strong> to see every column. Only the clinic manager can
          <span className="ui">Add</span>, edit, or delete entries and control who sees each one.</p>
        <Figure src="/handbook/08-directory-qr.png" alt="Directory landing with the Online Forms QR panel"
          caption="Directory opens with the Online Forms QR panel — scan or tap — above the Branch Information, Emails, and Websites tabs." />

        <h3 id="f-wellness">Wellness Check <span className="tag tag-sage">Everyone</span></h3>
        <p>A space to check in on staff wellbeing.</p>

        <h3 id="f-payroll">Payroll <span className="tag tag-sage">Everyone (except interns)</span></h3>
        <p>Your payslips, pulled from the Accounting Hub. If you work at both branches, the branch toggle scopes
          payslips to East or Greenhills. Click a payslip to open it.</p>

        <h3 id="f-loans">Loans &amp; Perks <span className="tag tag-sage">Everyone (except interns)</span></h3>
        <p>Two things live here. Everyone gets the <strong>BDO Loan calculator</strong> — enter an amount and term to
          estimate the monthly repayment. Employees also get <strong>Company Loan</strong>, where a company loan and its
          per-cutoff payroll deductions are shown. (The Company Loan part only appears for employee-type staff.)</p>
      </div>

      <div className="role-card">
        <h3 id="f-internship">Internship <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Supervisors</span> <span className="tag tag-plum">Interns</span></h3>
        <p>This section looks different depending on who you are.</p>

        <h4>If you are a supervisor (or the manager)</h4>
        <p>Tabs across the top let you oversee interns <strong>in your own department</strong>:</p>
        <ul>
          <li><span className="ui">List of Interns</span> — the interns decked (assigned) to you.</li>
          <li><span className="ui">All Interns</span> — every intern in your department (the manager sees all departments).
            Open one to read every note they&rsquo;ve written.</li>
          <li><span className="ui">Balik-Tanaw</span> — read an intern&rsquo;s weekly reflections and sign them.</li>
          <li><span className="ui">Grades</span> — grade interns on the official <strong>1.00–4.00 scale</strong> (in
            0.25 steps) using the rubric shown on the page.</li>
          <li><span className="ui">Documents</span> — internship documents shared within your department.</li>
          <li><span className="ui">Learning Profiles</span> — each intern&rsquo;s learning goals and preferences.</li>
          <li><span className="ui">Meetings</span> — schedule and join supervision meetings (see <a href="#meetings">Meetings</a>).</li>
        </ul>

        <h4>If you are an intern</h4>
        <p>You get a simpler set of tabs:</p>
        <ul>
          <li><span className="ui">Learning Outcomes</span> — fill in your goals and learning preferences for your
            Clinical Instructors.</li>
          <li><span className="ui">Balik-Tanaw</span> — submit your weekly reflection and sign it; your supervisor signs
            after reading it.</li>
          <li><span className="ui">Meetings</span> — join supervision meetings you&rsquo;re invited to (see
            <a href="#meetings"> Meetings</a>).</li>
        </ul>
        <Figure src="/handbook/11-internship.png" alt="Internship section tabs for a supervisor"
          caption="Internship — supervisors see List of Interns, All Interns, Balik-Tanaw, Grades, Documents, Learning Profiles, and Meetings; interns see Learning Outcomes, Balik-Tanaw, and Meetings." />
      </div>

      <div className="role-card">
        <h3 id="f-mentorship">Mentorship <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Mentors</span> <span className="tag tag-plum">Mentees</span></h3>
        <p>For Clinical Mentors and the people they mentor.</p>
        <ul>
          <li><strong>Mentors</strong> get a <span className="ui">Mentees</span> tab — open a mentee to read every session
            note they&rsquo;ve written — and a <span className="ui">Meetings</span> tab.</li>
          <li><strong>Mentees</strong> get the <span className="ui">Meetings</span> tab to book and join mentorship
            meetings.</li>
        </ul>
        <div className="callout callout-warn">
          <span className="label">Mentorship meetings are paid</span>
          Each mentorship meeting is compensated to the mentor at the prevailing mentorship fee, deducted from the
          mentee&rsquo;s payroll. A note at the top of the Mentorship &rarr; Meetings area states this.
        </div>
      </div>

      <div className="role-card">
        <h3 id="f-settings">Settings <span className="tag tag-amber">Manager</span> <span className="tag tag-clay">Clinician</span> <span className="tag tag-plum">Intern</span></h3>
        <p>Your personal preferences and, for licensed clinicians, your <strong>credentials</strong>: your
          <strong> PRC License No.</strong> and <strong>PTR No.</strong> (these auto-fill on session forms that need
          them) and your <strong>e-signature</strong>. Interns don&rsquo;t have PRC / PTR fields (they&rsquo;re not yet
          licensed).</p>
      </div>

      <div className="role-card">
        <h3 id="f-tickets">Tickets <span className="tag tag-amber">Clinic manager only</span></h3>
        <p>Where the concerns staff raise (via the <strong>Concerns?</strong> button) arrive. Open a ticket, type a
          reply, and the person who raised it gets a notification on their bell. This is the manager&rsquo;s side of the
          Concerns button.</p>

        <h3 id="f-admin">Admin Panel <span className="tag tag-amber">Clinic manager only</span></h3>
        <ul>
          <li><strong>Create and manage staff accounts</strong>, choosing each person&rsquo;s account type.</li>
          <li>Turn accounts <strong>Active / Inactive</strong>, reset passwords, and revise a staff member&rsquo;s email
            (which also updates their login).</li>
          <li>Set the <strong>Branch CC Emails</strong> (East / Greenhills) copied on session notes and reports.</li>
          <li>Manage the whole <strong>Directory</strong> and who can see each entry.</li>
        </ul>
        <Figure src="/handbook/09-admin-panel.png" alt="Admin Panel showing account management"
          caption="The Admin Panel (clinic manager only): create accounts and account types, reset passwords, set branch CC emails, and manage the Directory." />
      </div>

      {/* ── 4. MEETINGS ── */}
      <h2 id="meetings">4. Meetings (Internship &amp; Mentorship)</h2>
      <p>Both the Internship and Mentorship sections share the same <strong>Meetings</strong> area, opened from their
        <span className="ui"> Meetings</span> tab. It mints a video-call link (on <code>meet.sapphireclinicseast.org</code>)
        that <strong>everyone invited can join and record</strong>. There are up to three inner tabs:</p>

      <h3>Meeting Schedule</h3>
      <p>The list of meetings. Switch between <span className="ui">Upcoming</span> and <span className="ui">Past</span>.
        Each meeting shows its title, date, time, who&rsquo;s invited, and a <span className="ui">Join</span> button that
        opens the video call. The person who created a meeting can cancel it with the <span className="ui">🗑</span> button.</p>

      <h3>Set a Meeting</h3>
      <p>The one place to create a meeting. It has two modes:</p>
      <ul>
        <li><span className="ui">With a person</span> — pick someone who has published their availability, see their
          open times, choose a date and time, and book. This is how an intern books a supervisor, or a mentee books a
          mentor. Everyone in the list is in <strong>your department</strong>.</li>
        <li><span className="ui">Just create a link</span> — set a title, date, and time, then tick who to invite from
          your department (supervisors + interns for Internship; mentors + mentees for Mentorship) and press
          <span className="ui"> Create meeting</span>. Inviting people is optional — you can create a link with no one
          ticked and share it yourself. This mode is for supervisors and mentors.</li>
      </ul>

      <h3>My Availability</h3>
      <p>Supervisors and mentors get this tab to publish the times people can book them (like a simple Calendly). Add a
        day range and start/end time; those slots then show up when a mentee or intern uses <span className="ui">With a
        person</span>.</p>
      <Figure src="/handbook/12-meetings.png" alt="Set a Meeting with 'With a person' and 'Just create a link' modes"
        caption="Meetings: Meeting Schedule (Upcoming / Past), Set a Meeting (With a person / Just create a link), and — for supervisors and mentors — My Availability." />

      {/* ── 5. PLAYBOOKS ── */}
      <h2 id="playbooks">5. Role playbooks</h2>

      <div className="role-card">
        <h3>Clinician <span className="tag tag-clay">Clinical account</span></h3>
        <ul>
          <li>Start on the <strong>Dashboard</strong>; follow the 3 R&rsquo;s.</li>
          <li>See your week in <strong>Clinic Schedule</strong>.</li>
          <li>Open a patient, run the session, write the <strong>note</strong>, and email it.</li>
          <li>Check a patient&rsquo;s <strong>Home Progress</strong> uploads, PWD ID, and referral.</li>
          <li>Email <strong>Initial Evaluation reports</strong> to patients.</li>
          <li>See <strong>Patients-Love</strong> and <strong>Peers-Love</strong> about you; check the <strong>bell</strong> for what&rsquo;s new.</li>
          <li>Reach templates, manuals, seminars, payslips, and Loans &amp; Perks.</li>
          <li>Work at two branches? Use the <strong>branch toggle</strong>.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Employee <span className="tag tag-info">Front desk / Admin staff</span></h3>
        <ul>
          <li><strong>Templates &amp; Forms</strong> for every department, <strong>Manuals</strong>, and <strong>Seminars</strong>.</li>
          <li><strong>Directory</strong> — emails, websites, branch info, and the form QR codes.</li>
          <li><strong>Payroll</strong>, <strong>Loans &amp; Perks</strong>, and <strong>Wellness Check</strong>.</li>
          <li>Peers-Love about you; Front Desk also sees <strong>What Patients Love About You</strong>.</li>
          <li>Report a problem with the <strong>Concerns?</strong> button.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Intern <span className="tag tag-plum">Trainee</span></h3>
        <ul>
          <li>See your sessions in <strong>Clinic Schedule</strong> / <strong>Dashboard</strong> and write your notes
            (your supervisor emails them to patients).</li>
          <li>In <strong>Internship</strong>: fill your <strong>Learning Outcomes</strong>, submit your weekly
            <strong> Balik-Tanaw</strong>, and join <strong>Meetings</strong> with your supervisor.</li>
          <li>Use Seminars, Templates, Manuals, Directory, Wellness Check, and Settings.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Mentor &amp; supervisor <span className="tag tag-clay">Tagged in HR</span></h3>
        <ul>
          <li><strong>Supervisors</strong>: in <strong>Internship</strong>, track interns, read and sign
            <strong> Balik-Tanaw</strong>, enter <strong>Grades</strong> (1.00–4.00), and hold <strong>Meetings</strong>.</li>
          <li><strong>Mentors</strong>: in <strong>Mentorship</strong>, read your mentees&rsquo; notes and hold
            <strong> Meetings</strong> (paid per meeting).</li>
          <li>Publish your bookable times under <strong>My Availability</strong> so mentees / interns can book you.</li>
        </ul>
      </div>

      <div className="role-card">
        <h3>Clinic manager <span className="tag tag-amber">Main admin</span></h3>
        <ul>
          <li>See <strong>every</strong> page and all staff&rsquo;s feedback.</li>
          <li><strong>Admin Panel</strong>: create accounts, set account types, activate / deactivate, reset passwords,
            revise emails, set <strong>Branch CC Emails</strong>, curate the <strong>Directory</strong>.</li>
          <li>Answer staff concerns in <strong>Tickets</strong>.</li>
          <li>See every intern (all departments) and every mentee in <strong>Internship</strong> / <strong>Mentorship</strong>.</li>
        </ul>
      </div>

      {/* ── 6. COMMON TASKS ── */}
      <h2 id="tasks">6. Common tasks</h2>

      <h4>Email a session note to a patient <span className="tag tag-clay">Clinician</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the session from your <strong>Dashboard</strong> or <strong>Clinic Schedule</strong>.</li>
        <li className="task-step">Fill in the note form and press <span className="ui">Complete</span>.</li>
        <li className="task-step">Press <span className="ui">Send Notes to Patient&rsquo;s Email</span>. For an MD note,
          confirm when asked. The email goes out branded, with the branch inbox copied.</li>
      </ol>

      <h4>Delete a session note you made by mistake <span className="tag tag-clay">Clinician</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the session (or open the patient and find the note).</li>
        <li className="task-step">Press <span className="ui">Delete note</span> and confirm. This can&rsquo;t be undone,
          and locked notes can&rsquo;t be deleted.</li>
      </ol>

      <h4>Add a supervision / mentorship meeting <span className="tag tag-clay">Supervisor / Mentor</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Internship</strong> or <strong>Mentorship</strong> → the <span className="ui">Meetings</span> tab → <span className="ui">Set a Meeting</span>.</li>
        <li className="task-step">Choose <span className="ui">With a person</span> to book someone&rsquo;s availability, or
          <span className="ui"> Just create a link</span> to pick a date/time and tick invitees.</li>
        <li className="task-step">Press <span className="ui">Create meeting</span>. It appears under <span className="ui">Meeting Schedule</span> and invitees are notified.</li>
      </ol>

      <h4>Grade an intern <span className="tag tag-clay">Supervisor</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Internship</strong> → the <span className="ui">Grades</span> tab.</li>
        <li className="task-step">Pick the intern and choose a grade on the <strong>1.00–4.00</strong> scale (0.25 steps),
          guided by the rubric shown.</li>
        <li className="task-step">Save. Add a note if you want to explain the mark.</li>
      </ol>

      <h4>Use the online forms (scan or click) <span className="tag tag-sage">Everyone</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open <strong>Directory</strong>. The <strong>Online Forms</strong> panel is at the top.</li>
        <li className="task-step"><strong>Scan</strong> a QR code with your phone camera, or <strong>tap</strong> a card to open the form.</li>
      </ol>

      <h4>Report a problem with the portal <span className="tag tag-sage">Everyone</span></h4>
      <ol className="task-steps">
        <li className="task-step">Click the floating <span className="ui">Concerns?</span> button (bottom-right).</li>
        <li className="task-step">Type what&rsquo;s wrong and send. Watch your <strong>bell</strong> for the manager&rsquo;s reply.</li>
      </ol>

      <h4>Create a staff account <span className="tag tag-amber">Clinic manager</span></h4>
      <ol className="task-steps">
        <li className="task-step">Open the <strong>Admin Panel</strong> and choose <span className="ui">Add account</span>.</li>
        <li className="task-step">Pick the staff member and set a temporary password.</li>
        <li className="task-step">Choose the <strong>account type</strong> — Clinician, Front Desk, Admin Staff, Admin, or
          Intern — which sets what they can see. Save, and share the sign-in details.</li>
      </ol>

      <h4>Choose who can read a manual <span className="tag tag-amber">Clinic manager</span></h4>
      <ol className="task-steps">
        <li className="task-step">Manuals are uploaded in the <strong>HR Hub</strong> (not the Staff Portal).</li>
        <li className="task-step">When uploading, pick <strong>Who can see this</strong> — All staff, Admin employees
          only, or Clinicians only — then flag <strong>Show in Staff Portal</strong>.</li>
      </ol>

      {/* ── 7. HELP ── */}
      <h2 id="help">7. Help</h2>

      <h3>Search this handbook</h3>
      <p className="export-hide">Type a word — a page, a button, or a term like <em>referral</em>, <em>loan</em>,
        <em> confidential</em>, or <em>meeting</em> — to jump to where it&rsquo;s explained.</p>
      <div className="hb-search export-hide">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the handbook…"
          aria-label="Search the handbook"
        />
        {query.trim() && (
          results.length > 0 ? (
            <ul className="hb-search-results">
              {results.map((r) => (
                <li key={r.label + r.anchor}>
                  <a href={r.anchor}>
                    <span className="hb-result-label">{r.label}</span>
                    <span className="hb-result-where">{r.where}</span>
                    <span className="hb-result-blurb">{r.blurb}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hb-search-empty">No match. Try a simpler word (e.g. &ldquo;note&rdquo;, &ldquo;branch&rdquo;,
              &ldquo;grade&rdquo;), or browse the <a href="#features">Feature guide</a>.</p>
          )
        )}
      </div>
      <div className="callout callout-note export-hide">
        <span className="label">In the printed / Word copy</span>
        The search box is interactive, so it&rsquo;s left out of the PDF and Word downloads. In those, use your
        reader&rsquo;s own Find (<kbd>Cmd/Ctrl</kbd> + <kbd>F</kbd>) instead.
      </div>

      <h3 id="faq">FAQ &amp; troubleshooting</h3>

      <h4>Which email do I log in with after my email changed?</h4>
      <p>Log in with your <strong>new</strong> email. When HR updates your email and it syncs to the portal, your login
        email switches to match automatically — and your <strong>password stays the same</strong>. Your <em>old</em>
        email keeps working as a backup, so you won&rsquo;t be locked out. If the new email doesn&rsquo;t work yet, the
        sync may not have run; ask the clinic manager to run the staff sync.</p>

      <h4>I don&rsquo;t see the branch toggle</h4>
      <p>The East / Greenhills toggle only appears if you&rsquo;re set up at <strong>both</strong> branches on one login.
        If you work at a single branch, there&rsquo;s nothing to switch — this is normal.</p>

      <h4>Some pages are missing from my sidebar</h4>
      <p>You only see the pages your <strong>account type</strong> allows — see <a href="#access">Your access at a
        glance</a>. For example, office staff don&rsquo;t see Dashboard, Clinic Schedule, or Patients, and interns see a
        trimmed set. If you think your type is wrong, ask the clinic manager to adjust it in the Admin Panel.</p>

      <h4>I&rsquo;m a supervisor / mentor but don&rsquo;t see Internship or Mentorship</h4>
      <p>Those sections are unlocked by an <strong>HR tag</strong>, not just your account type. Ask the clinic manager
        to confirm you&rsquo;re tagged as an <em>internship supervisor</em> or <em>Clinical Mentor</em> (with mentees)
        in HR Staff Profiles. Interns and mentees see them automatically.</p>

      <h4>My notification bell went red again after I signed out</h4>
      <p>Once you open the bell, the count turns grey and <strong>stays</strong> grey — even after signing out and back
        in. It only turns red again when something <em>new</em> arrives.</p>

      <h4>A patient can&rsquo;t see my Psychology / MD note</h4>
      <p>That&rsquo;s intended — Psychology and MD notes are <strong>confidential by default</strong>. Tick
        <span className="ui"> Show to Others</span> on the completed note if the patient (and other departments in their
        care) should see it.</p>

      <h4>I&rsquo;m an intern and can&rsquo;t email a note to a patient</h4>
      <p>Interns write notes, but only the <strong>supervisor</strong> can email a note to the patient. Ask your
        supervisor to send it.</p>

      <h4>On my phone, a table is cut off</h4>
      <p>Wide tables (Directory Emails / Websites, the access matrix) <strong>scroll sideways</strong> on small screens —
        swipe the table left / right to see every column.</p>

      <h4>The portal briefly showed an error or wouldn&rsquo;t load</h4>
      <p>Short blips can happen during a system update. Wait a few seconds and <strong>refresh</strong>
        (<kbd>Cmd/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> for a hard refresh). If it persists, use the
        <span className="ui"> Concerns?</span> button or tell the clinic manager.</p>

      <h4>Who do I contact for account help?</h4>
      <p>The <strong>clinic manager</strong> (main admin) manages all staff-portal accounts — creating logins, resetting
        passwords, changing account types, and turning accounts active or inactive.</p>

      <hr style={{ border: 'none', borderTop: '1px solid var(--paper-3)', margin: '3rem 0 1rem' }} />
      <p style={{ fontSize: 12, color: 'var(--mid-gray)', textAlign: 'center' }}>
        Aura Health Rehab · Sapphire Clinics East, Inc.<br />
        Staff Portal handbook — reflects portal features as of the current deploy. Access shown reflects account type
        and HR tags; the clinic manager can adjust these anytime.
      </p>
    </div>
  )
}
