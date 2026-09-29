'use client'

// Force dynamic — matches /admin and the sibling /admin/handbook. Without it
// Next.js serves a prerendered shell that hides deploys for up to a year.
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth } from '@/lib/session'

/**
 * Staff Portal — User Handbook.
 *
 * Main-admin-only guide for the STAFF PORTAL (staff.sapphireclinicseast.org) —
 * the clinicians' + office-staff app, a separate system from this Class Portal.
 * Lives here so the clinic manager has every handbook in one place, behind the
 * same main-admin gate as /admin/handbook.
 *
 * Design mirrors the HR Portal handbook (hr.sapphireclinicseast.org/modules/
 * handbook) — the same masthead, mono "SECTION" eyebrows, module cards, role
 * badges, connected-systems map, playbooks, FAQ accordion and word search — so
 * the two read as one family. All CSS is scoped under `.sph-hb` so it never
 * leaks into the rest of the Class Portal.
 *
 * Content reflects the access model coded in the staff portal
 * (section-access.ts + the layout's role gates): CLINICIAN / FRONT_DESK /
 * ADMIN_STAFF / INTERN presets, role=ADMIN sees everything plus Admin Panel &
 * Tickets, and Internship / Mentorship are additionally gated by HR tags.
 */

/** Concrete hex for every CSS custom property, baked into the Word export
 *  (Word can't resolve `var(--…)`). Kept in sync with the <style> tokens. */
const EXPORT_PALETTE: Record<string, string> = {
  '--ink': '#16302E', '--body': '#31403D', '--muted': '#6A7B78',
  '--teal': '#157A72', '--teal-deep': '#0E4A46', '--teal-soft': '#E4EFEC',
  '--line': '#D6E2DE', '--line-soft': '#E8F0ED', '--paper': '#F3F6F4', '--card': '#FFFFFF',
  '--mgr': '#7E4CC4', '--mgr-bg': '#F1EAFB',
  '--cln': '#2E8B57', '--cln-bg': '#E6F3EC',
  '--off': '#1F6FB2', '--off-bg': '#E7F0F9',
  '--int': '#B7791F', '--int-bg': '#FBF4E4',
  '--warn': '#B7791F', '--warn-bg': '#FBF4E4',
}

/** Word-export palette applied as an inline `--x:hex` block on the clone root,
 *  so any var() left unbaked still resolves in readers that honour inline vars. */
const ROOT_VARS = Object.entries(EXPORT_PALETTE).map(([k, v]) => `${k}:${v}`).join(';')

type SearchEntry = { label: string; anchor: string; where: string; blurb: string; kw?: string }
const SEARCH_INDEX: SearchEntry[] = [
  { label: 'Signing in', anchor: '#getting-started', where: 'Getting started', blurb: 'Where and how to log in, and how long you stay signed in.', kw: 'login log in password email sign in' },
  { label: 'Forgot password', anchor: '#getting-started', where: 'Getting started', blurb: 'Reset your password from the sign-in screen.', kw: 'reset forgot lost password' },
  { label: 'Branch toggle (East / Greenhills)', anchor: '#getting-started', where: 'Getting started', blurb: 'Switch which branch you are viewing when you work at both.', kw: 'branch switch east greenhills toggle' },
  { label: 'Notification bell', anchor: '#getting-started', where: 'Getting started', blurb: 'The red-dot bell, top-right — new replies, uploads, trainings.', kw: 'notifications bell alerts red dot unread' },
  { label: 'Concerns button (raise a ticket)', anchor: '#getting-started', where: 'Getting started', blurb: 'The floating Concerns? button to report a portal problem.', kw: 'ticket concern help support problem bug report' },
  { label: 'Connected systems (data flow)', anchor: '#systems', where: 'Connected systems', blurb: 'How the Staff Portal links to HR, Operations, Accounting & the Client Portal.', kw: 'connected systems data flow sync integration map source of truth hub' },
  { label: 'Account types & access', anchor: '#access', where: 'Your access', blurb: 'The five kinds of account and what each one can open.', kw: 'permissions role clinician front desk admin intern access matrix' },
  { label: 'Dashboard', anchor: '#m-dashboard', where: 'Feature guide', blurb: "Today's sessions and the 3 R's reminder.", kw: 'home today 3 rs release reply report' },
  { label: 'Clinic Schedule', anchor: '#m-schedule', where: 'Feature guide', blurb: 'Your week of sessions; open one to write its note.', kw: 'calendar week sessions schedule trends' },
  { label: 'Patients', anchor: '#m-patients', where: 'Feature guide', blurb: 'Your patient list, filters, and the patient profile.', kw: 'patient list active discharged read-only search' },
  { label: 'Home Progress uploads', anchor: '#m-patients', where: 'Feature guide', blurb: 'Patient videos, voice notes and photos uploaded from home.', kw: 'home progress upload video voice note photo caregiver' },
  { label: "PWD ID & Doctor's Referral", anchor: '#m-patients', where: 'Feature guide', blurb: 'View the PWD ID and doctor referral on the patient.', kw: 'pwd id doctor referral document' },
  { label: 'Session notes & reports', anchor: '#m-notes', where: 'Feature guide', blurb: 'Write, complete, edit, delete, and email a session note.', kw: 'note report initial evaluation IE send email complete edit delete' },
  { label: 'Confidential notes & "Show to Others"', anchor: '#m-notes', where: 'Feature guide', blurb: 'Psychology & MD notes are private by default; tick to share.', kw: 'confidential psychology md medical show to others private share' },
  { label: 'What Patients / Peers Love About You', anchor: '#m-love', where: 'Feature guide', blurb: 'Kind words from patients and colleagues.', kw: 'feedback love patients peers praise evaluation' },
  { label: 'Seminars & Trainings', anchor: '#m-seminars', where: 'Feature guide', blurb: 'Upcoming and past seminars and trainings.', kw: 'seminar training webinar cpd' },
  { label: 'Templates & Forms', anchor: '#m-templates', where: 'Feature guide', blurb: 'Department templates and fillable forms.', kw: 'template form download document' },
  { label: 'Manuals', anchor: '#m-manuals', where: 'Feature guide', blurb: 'Read-only department manuals with an Ask-the-manual chat.', kw: 'manual handbook pdf read chat ask' },
  { label: 'Directory', anchor: '#m-directory', where: 'Feature guide', blurb: 'Online-form QR codes, branch info, emails and websites.', kw: 'directory qr forms emails websites branch contact' },
  { label: 'Wellness Check', anchor: '#m-wellness', where: 'Feature guide', blurb: 'Check in on staff wellbeing.', kw: 'wellness wellbeing survey mental health' },
  { label: 'Payroll', anchor: '#m-payroll', where: 'Feature guide', blurb: 'Your payslips, per branch.', kw: 'payslip salary pay payroll' },
  { label: 'Loans & Perks', anchor: '#m-loans', where: 'Feature guide', blurb: 'BDO loan calculator for all; Company Loan for employees.', kw: 'loan bdo calculator company perks benefits deduction' },
  { label: 'Internship', anchor: '#m-internship', where: 'Feature guide', blurb: 'Supervise interns, or (as an intern) your own learning tabs.', kw: 'intern internship supervisor learning outcomes balik-tanaw grades documents learning profiles' },
  { label: 'Grades (4-point scale)', anchor: '#m-internship', where: 'Feature guide', blurb: 'Grade interns on the 1.00–4.00 scale with the rubric.', kw: 'grade grading rubric 4 point scale mark' },
  { label: 'Balik-Tanaw', anchor: '#m-internship', where: 'Feature guide', blurb: "Interns' weekly reflection, signed by the supervisor.", kw: 'balik tanaw reflection weekly intern' },
  { label: 'Mentorship', anchor: '#m-mentorship', where: 'Feature guide', blurb: "Mentors read mentees' notes; both use Meetings.", kw: 'mentor mentee mentorship notes fee paid' },
  { label: 'Meetings (Set a Meeting / Availability)', anchor: '#m-meetings', where: 'Meetings', blurb: 'Book or create a video meeting and manage availability.', kw: 'meeting video link availability set a meeting schedule join record' },
  { label: 'Settings (PRC / PTR / signature)', anchor: '#m-settings', where: 'Feature guide', blurb: 'Your credentials and e-signature.', kw: 'settings prc ptr license signature profile' },
  { label: 'Tickets (admin)', anchor: '#m-tickets', where: 'Feature guide', blurb: 'Where the clinic manager answers raised concerns.', kw: 'ticket concern support admin answer resolve' },
  { label: 'Admin Panel', anchor: '#m-admin', where: 'Feature guide', blurb: 'Create accounts, set types, branch CC emails, Directory.', kw: 'admin accounts create password branch cc email directory manage' },
  { label: 'Email a session note to a patient', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to send a note by email.', kw: 'send email note patient task' },
  { label: 'Add a meeting', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to schedule a supervision/mentorship meeting.', kw: 'add meeting create task internship mentorship' },
  { label: 'Grade an intern', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step to enter a grade on the 4-point scale.', kw: 'grade intern task rubric' },
  { label: 'Create a staff account', anchor: '#tasks', where: 'Common tasks', blurb: 'Step-by-step for the clinic manager.', kw: 'create account staff admin task' },
]

// Small badge helpers so the role tags read the same everywhere.
function Badge({ cls, letter, children }: { cls: string; letter: string; children: ReactNode }) {
  return <span className={`badge ${cls}`}><span className="dot">{letter}</span>{children}</span>
}
const BMgr = () => <Badge cls="b-mgr" letter="M">Manager</Badge>
const BCln = () => <Badge cls="b-cln" letter="C">Clinician</Badge>
const BOff = () => <Badge cls="b-off" letter="O">Office staff</Badge>
const BInt = () => <Badge cls="b-int" letter="I">Intern</Badge>
const BAll = () => <Badge cls="b-all" letter="★">Everyone</Badge>

export default function StaffPortalHandbookPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCH_INDEX.filter((e) =>
      (e.label + ' ' + e.where + ' ' + e.blurb + ' ' + (e.kw ?? '')).toLowerCase().includes(q),
    ).slice(0, 12)
  }, [query])

  /** Download the handbook as a Word document — clones the rendered page,
   *  drops the toolbar / search (data-noexport), opens every FAQ item, bakes
   *  CSS variables to hex (Word can't resolve them), and wraps it in a
   *  Word-flavoured HTML document. Opens cleanly in Word, Pages, and Docs. */
  function downloadWord() {
    const el = rootRef.current
    if (!el) return
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove())
    clone.querySelectorAll('.faq details').forEach((d) => d.setAttribute('open', ''))
    let inner = clone.innerHTML
    for (const [k, v] of Object.entries(EXPORT_PALETTE)) inner = inner.split(`var(${k})`).join(v)
    const doc =
      '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Staff Portal Handbook</title></head>' +
      `<body style="font-family:'Segoe UI',Arial,sans-serif;color:#31403D;background:#fff;">` +
      `<div style="${ROOT_VARS}">${inner}</div></body></html>`
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
    if (!auth) { router.replace('/sign-in'); return }
    if (auth.role !== 'ADMIN') {
      router.replace(auth.role === 'BRANCH_ADMIN' ? '/admin'
        : auth.role === 'FRONTDESK' ? '/frontdesk'
        : '/profile')
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true)
  }, [router])

  if (!ready) return null

  return (
    <div ref={rootRef} className="sph-hb">
      <style>{`
        .sph-hb{
          --ink:#16302E; --body:#31403D; --muted:#6A7B78;
          --teal:#157A72; --teal-deep:#0E4A46; --teal-soft:#E4EFEC;
          --line:#D6E2DE; --line-soft:#E8F0ED; --paper:#F3F6F4; --card:#FFFFFF;
          --mgr:#7E4CC4; --mgr-bg:#F1EAFB; --cln:#2E8B57; --cln-bg:#E6F3EC;
          --off:#1F6FB2; --off-bg:#E7F0F9; --int:#B7791F; --int-bg:#FBF4E4;
          --warn:#B7791F; --warn-bg:#FBF4E4;
          --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace; --measure:68ch;
          background:var(--paper); color:var(--body); font-family:var(--sans);
          font-size:15.5px; line-height:1.62; border-radius:16px; overflow:hidden;
          -webkit-font-smoothing:antialiased;
        }
        .sph-hb *{box-sizing:border-box;}
        .sph-hb a{color:var(--teal); text-underline-offset:2px;}
        .sph-hb h1,.sph-hb h2,.sph-hb h3,.sph-hb h4{color:var(--ink); text-wrap:balance; line-height:1.2; margin:0;}
        .sph-hb code{font-family:var(--mono); font-size:.86em; background:var(--teal-soft);
          color:var(--teal-deep); padding:.08em .4em; border-radius:4px; white-space:nowrap;}
        .sph-hb kbd{font-family:var(--sans); font-size:.88em; font-weight:600; color:var(--ink);
          background:#fff; border:1px solid var(--line); border-bottom-width:2px; border-radius:6px;
          padding:.05em .45em; white-space:nowrap;}
        .sph-hb mark{background:#FFF1A8; color:inherit; padding:0 .1em; border-radius:3px;}
        .sph-hb .wrap{max-width:920px; margin:0 auto; padding:0 22px;}

        /* Masthead */
        .sph-hb header.mast{background:
          radial-gradient(120% 140% at 100% 0%, rgba(21,122,114,.16), transparent 60%),
          linear-gradient(180deg,#0E4A46,#12645C); color:#DCEBE8; padding:40px 0 38px;}
        .sph-hb .mast .wrap{display:flex; flex-direction:column; gap:15px;}
        .sph-hb .kicker{font-family:var(--mono); font-size:12px; letter-spacing:.22em;
          text-transform:uppercase; color:#7FC3B9;}
        .sph-hb .mast h1{color:#fff; font-size:clamp(26px,4vw,40px); font-weight:800; letter-spacing:-.02em; max-width:22ch;}
        .sph-hb .mast p.lede{margin:0; max-width:62ch; color:#CDE3DE; font-size:16px;}
        .sph-hb .mast .meta{display:flex; flex-wrap:wrap; gap:8px 20px; margin-top:4px; font-size:13px; color:#A9D0C9;}
        .sph-hb .mast .meta b{color:#EAF5F2; font-weight:600;}
        .sph-hb .mast .meta code{background:rgba(255,255,255,.12); color:#EAF5F2;}
        .sph-hb .mast-actions{display:flex; flex-wrap:wrap; gap:10px; margin-top:4px;}
        .sph-hb .hb-btn{font-family:var(--sans); font-size:13px; font-weight:600; cursor:pointer;
          display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:9px;
          border:1px solid transparent; background:#EAF5F2; color:#0E4A46; transition:transform .12s,background .15s; text-decoration:none;}
        .sph-hb .hb-btn:hover{background:#fff; transform:translateY(-1px);}
        .sph-hb .hb-btn.ghost{background:rgba(255,255,255,.10); color:#EAF5F2; border-color:rgba(255,255,255,.35);}
        .sph-hb .hb-btn.ghost:hover{background:rgba(255,255,255,.18);}

        .sph-hb main{padding:34px 0 60px;}
        .sph-hb section{margin-bottom:46px; scroll-margin-top:16px;}
        .sph-hb .eyebrow{font-family:var(--mono); font-size:11.5px; letter-spacing:.16em;
          text-transform:uppercase; color:var(--teal); margin-bottom:8px;}
        .sph-hb section>h2{font-size:24px; font-weight:800; letter-spacing:-.015em;
          padding-bottom:11px; border-bottom:2px solid var(--line); margin-bottom:18px;}
        .sph-hb section p{max-width:var(--measure);}
        .sph-hb h3.blockh{font-size:17px; font-weight:700; margin:24px 0 8px;}

        /* TOC card */
        .sph-hb .toc{border:1px solid var(--line); border-radius:12px; background:var(--card); padding:14px 18px; margin:0 0 30px;}
        .sph-hb .toc .toc-h{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); margin:0 0 8px;}
        .sph-hb .toc ol{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:2px 18px;}
        @media(max-width:620px){.sph-hb .toc ol{grid-template-columns:1fr;}}
        .sph-hb .toc a{display:block; padding:5px 9px; border-radius:7px; color:var(--body); text-decoration:none;}
        .sph-hb .toc a:hover{background:var(--teal-soft); color:var(--teal-deep);}
        .sph-hb .toc a b{color:var(--muted); font-family:var(--mono); font-size:11px; margin-right:7px;}

        /* Badges */
        .sph-hb .badge{display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600;
          padding:3px 9px 3px 7px; border-radius:999px; line-height:1; white-space:nowrap;}
        .sph-hb .badge .dot{width:14px; height:14px; border-radius:50%; color:#fff; font-size:9px; font-weight:800; display:grid; place-items:center;}
        .sph-hb .b-mgr{background:var(--mgr-bg); color:#5B2E96;} .sph-hb .b-mgr .dot{background:var(--mgr);}
        .sph-hb .b-cln{background:var(--cln-bg); color:#1F6340;} .sph-hb .b-cln .dot{background:var(--cln);}
        .sph-hb .b-off{background:var(--off-bg); color:#154C7E;} .sph-hb .b-off .dot{background:var(--off);}
        .sph-hb .b-int{background:var(--int-bg); color:#8A5A11;} .sph-hb .b-int .dot{background:var(--int);}
        .sph-hb .b-all{background:var(--teal-soft); color:var(--teal-deep);} .sph-hb .b-all .dot{background:var(--teal);}

        /* Role legend */
        .sph-hb .legend{display:grid; grid-template-columns:repeat(2,1fr); gap:13px; margin:20px 0 8px;}
        @media(max-width:620px){.sph-hb .legend{grid-template-columns:1fr;}}
        .sph-hb .legend .rc{background:var(--card); border:1px solid var(--line); border-radius:12px; padding:15px 16px; border-top:3px solid var(--rc);}
        .sph-hb .legend .rc.mgr{--rc:var(--mgr);} .sph-hb .legend .rc.cln{--rc:var(--cln);} .sph-hb .legend .rc.off{--rc:var(--off);} .sph-hb .legend .rc.int{--rc:var(--int);}
        .sph-hb .legend .rc h4{font-size:15px; margin-bottom:6px; display:flex; align-items:center; gap:8px;}
        .sph-hb .legend .rc p{font-size:13px; margin:0; color:var(--body);}

        /* Group divider */
        .sph-hb .grouphead{font-size:12.5px; font-family:var(--mono); letter-spacing:.12em; text-transform:uppercase;
          color:var(--muted); margin:28px 0 12px; display:flex; align-items:center; gap:12px; scroll-margin-top:16px;}
        .sph-hb .grouphead::after{content:""; flex:1; height:1px; background:var(--line);}

        /* Module cards */
        .sph-hb .cards{display:flex; flex-direction:column; gap:15px;}
        .sph-hb .mod{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:19px 21px; scroll-margin-top:16px;}
        .sph-hb .mod-top{display:flex; flex-wrap:wrap; align-items:baseline; gap:7px 12px; margin-bottom:3px;}
        .sph-hb .mod-top h3{font-size:17px; font-weight:750;}
        .sph-hb .mod-top .loc{font-family:var(--mono); font-size:11.5px; color:var(--muted);}
        .sph-hb .mod-roles{display:flex; flex-wrap:wrap; gap:6px; margin:9px 0 11px;}
        .sph-hb .mod .desc{max-width:var(--measure); margin:0 0 4px;}
        .sph-hb .mod ul{margin:8px 0 0; padding-left:0; list-style:none; max-width:var(--measure); display:flex; flex-direction:column; gap:7px;}
        .sph-hb .mod ul li{position:relative; padding-left:21px; font-size:14px;}
        .sph-hb .mod ul li::before{content:""; position:absolute; left:4px; top:8px; width:6px; height:6px; border-radius:50%; background:var(--teal);}
        .sph-hb .mod .note{margin-top:12px; font-size:13px; background:var(--teal-soft); border-radius:9px; padding:10px 13px; color:var(--teal-deep); max-width:var(--measure);}
        .sph-hb .mod .note b{color:var(--teal-deep);}
        .sph-hb .mod h4{font-size:13.5px; font-weight:700; margin:15px 0 6px; color:var(--ink); display:flex; align-items:center; gap:8px;}
        .sph-hb .mod ol.steps{margin:6px 0 0; padding-left:0; counter-reset:s; list-style:none; display:flex; flex-direction:column; gap:8px; max-width:var(--measure);}
        .sph-hb .mod ol.steps li{position:relative; padding-left:31px; counter-increment:s; font-size:14px;}
        .sph-hb .mod ol.steps li::before{content:counter(s); position:absolute; left:0; top:0; width:21px; height:21px; border-radius:50%;
          background:var(--teal); color:#fff; font-size:11px; font-weight:700; display:grid; place-items:center; font-variant-numeric:tabular-nums;}

        /* Connected systems */
        .sph-hb .hubwrap{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; margin:6px 0 20px; overflow-x:auto;}
        .sph-hb .hubwrap svg{display:block; margin:0 auto; max-width:100%; height:auto;}
        .sph-hb .hub-legend{text-align:center; font-size:12px; color:var(--muted); margin-top:8px;}
        .sph-hb .hub-legend b{color:var(--body); font-weight:700;}
        .sph-hb .conn{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px 20px;}
        .sph-hb .conn-head{display:flex; flex-wrap:wrap; align-items:baseline; gap:7px 12px; margin-bottom:3px;}
        .sph-hb .conn-head h3{font-size:16.5px; font-weight:750;}
        .sph-hb .conn-head .loc{font-family:var(--mono); font-size:11.5px; color:var(--muted);}
        .sph-hb .flowgrid{display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-top:13px;}
        @media(max-width:620px){.sph-hb .flowgrid{grid-template-columns:1fr;}}
        .sph-hb .flowcol{border-radius:10px; padding:12px 14px; border:1px solid var(--line-soft);}
        .sph-hb .flowcol.supplies{background:#EAF4EF; border-color:#CBE5D8;}
        .sph-hb .flowcol.receives{background:#EAF0F8; border-color:#CFDDF0;}
        .sph-hb .flow-lbl{font-family:var(--mono); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; font-weight:700; margin-bottom:8px;}
        .sph-hb .flowcol.supplies .flow-lbl{color:#1F6340;}
        .sph-hb .flowcol.receives .flow-lbl{color:#154C7E;}
        .sph-hb .flowcol ul{margin:0; padding-left:0; list-style:none; display:flex; flex-direction:column; gap:8px;}
        .sph-hb .flowcol li{font-size:12.5px; line-height:1.5; position:relative; padding-left:15px;}
        .sph-hb .flowcol li::before{content:""; position:absolute; left:1px; top:8px; width:5px; height:5px; border-radius:50%;}
        .sph-hb .flowcol.supplies li::before{background:#2E8B57;}
        .sph-hb .flowcol.receives li::before{background:#1F6FB2;}
        .sph-hb .flownone{font-size:12.5px; color:var(--muted); font-style:italic;}

        /* Callouts */
        .sph-hb .call{border-radius:12px; padding:14px 17px; margin:16px 0; max-width:var(--measure); font-size:14px; border:1px solid var(--line-soft);}
        .sph-hb .call b{color:var(--ink);}
        .sph-hb .call.rule{background:var(--warn-bg); border-color:#EAD9AE;}
        .sph-hb .call.rule .lbl{color:var(--warn);}
        .sph-hb .call.tip{background:var(--teal-soft); border-color:#BFDBD5;}
        .sph-hb .call.tip .lbl{color:var(--teal-deep);}
        .sph-hb .call .lbl{font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; display:block; margin-bottom:5px; font-weight:700;}

        /* Playbooks */
        .sph-hb .play{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:19px 21px; margin-bottom:15px; border-left:4px solid var(--pc);}
        .sph-hb .play.mgr{--pc:var(--mgr);} .sph-hb .play.cln{--pc:var(--cln);} .sph-hb .play.off{--pc:var(--off);} .sph-hb .play.int{--pc:var(--int);} .sph-hb .play.tag{--pc:var(--teal);}
        .sph-hb .play h3{font-size:16px; display:flex; align-items:center; gap:9px; margin-bottom:11px; flex-wrap:wrap;}
        .sph-hb .play ul{margin:0; padding-left:0; list-style:none; display:flex; flex-direction:column; gap:7px; max-width:var(--measure);}
        .sph-hb .play ul li{position:relative; padding-left:21px; font-size:14px;}
        .sph-hb .play ul li::before{content:""; position:absolute; left:4px; top:8px; width:6px; height:6px; border-radius:50%; background:var(--pc);}
        .sph-hb .play ol{margin:0; padding-left:0; counter-reset:s; list-style:none; display:flex; flex-direction:column; gap:9px; max-width:var(--measure);}
        .sph-hb .play ol li{position:relative; padding-left:33px; counter-increment:s; font-size:14px;}
        .sph-hb .play ol li::before{content:counter(s); position:absolute; left:0; top:-1px; width:22px; height:22px; border-radius:50%;
          background:var(--pc); color:#fff; font-size:12px; font-weight:700; display:grid; place-items:center; font-variant-numeric:tabular-nums;}

        /* Access table */
        .sph-hb .tablewrap{overflow-x:auto; border:1px solid var(--line); border-radius:12px; margin-top:8px;}
        .sph-hb table{border-collapse:collapse; width:100%; font-size:13px; min-width:560px;}
        .sph-hb th,.sph-hb td{text-align:left; padding:9px 13px; border-bottom:1px solid var(--line-soft);}
        .sph-hb thead th{background:var(--teal-soft); color:var(--teal-deep); font-size:11px; letter-spacing:.05em; text-transform:uppercase;}
        .sph-hb tbody tr:last-child td{border-bottom:none;}
        .sph-hb td.mod-name{font-weight:600; color:var(--ink);}
        .sph-hb .yes{color:var(--cln); font-weight:700;} .sph-hb .part{color:var(--warn); font-weight:600; font-size:12px;} .sph-hb .no{color:#C0CBC8;}

        /* Help: FAQ + search */
        .sph-hb .faq{display:flex; flex-direction:column; gap:9px; max-width:var(--measure);}
        .sph-hb .faq details{background:var(--card); border:1px solid var(--line); border-radius:12px; padding:0 18px; scroll-margin-top:16px;}
        .sph-hb .faq summary{cursor:pointer; font-weight:650; color:var(--ink); padding:13px 0; font-size:14.5px; list-style:none; display:flex; align-items:center; gap:10px;}
        .sph-hb .faq summary::-webkit-details-marker{display:none;}
        .sph-hb .faq summary::before{content:"+"; font-family:var(--mono); color:var(--teal); font-weight:700; width:16px; flex:0 0 auto;}
        .sph-hb .faq details[open] summary::before{content:"–";}
        .sph-hb .faq details .a{padding:0 0 15px 26px; font-size:14px;}
        .sph-hb .faq details .a p{margin:0 0 8px;}
        .sph-hb .hb-search{background:var(--card); border:1px solid var(--line); border-radius:14px; padding:17px 19px; max-width:var(--measure);}
        .sph-hb .hb-search label{display:block; font-weight:650; color:var(--ink); margin-bottom:8px; font-size:14.5px;}
        .sph-hb .hb-search input{width:100%; font:inherit; font-size:15px; padding:11px 14px; border-radius:10px; border:1.5px solid var(--line); background:#fff; color:var(--ink);}
        .sph-hb .hb-search input:focus{outline:none; border-color:var(--teal); box-shadow:0 0 0 3px rgba(21,122,114,.15);}
        .sph-hb .hb-search .hint{font-size:12px; color:var(--muted); margin:8px 0 0;}
        .sph-hb .sr-list{list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:6px;}
        .sph-hb .sr-list li a{display:block; padding:10px 12px; border-radius:9px; border:1px solid var(--line-soft); text-decoration:none; color:var(--body); background:var(--paper);}
        .sph-hb .sr-list li a:hover{border-color:var(--teal); background:var(--teal-soft);}
        .sph-hb .sr-list .where{font-family:var(--mono); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--teal-deep); display:block; margin-bottom:3px;}
        .sph-hb .sr-list .snip{font-size:13px; line-height:1.5;}
        .sph-hb .sr-empty{font-size:13px; color:var(--muted); margin-top:12px;}

        .sph-hb footer{border-top:1px solid var(--line); padding:22px 0 30px; color:var(--muted); font-size:12.5px;}

        @media(prefers-reduced-motion:reduce){.sph-hb *{transition:none!important;}}
        @media print{
          .sph-hb{background:#fff;}
          .sph-hb header.mast{background:#0E4A46!important; -webkit-print-color-adjust:exact; print-color-adjust:exact;}
          .sph-hb .mast-actions,.sph-hb .hb-search,.sph-hb [data-noexport]{display:none!important;}
          .sph-hb .mod,.sph-hb .play,.sph-hb .legend .rc,.sph-hb .conn,.sph-hb .hubwrap,.sph-hb .call,.sph-hb .tablewrap,.sph-hb .faq details{break-inside:avoid;}
          .sph-hb .faq details:not([open]) .a{display:block;}
          .sph-hb section{margin-bottom:24px;}
        }
      `}</style>

      {/* ── Masthead ── */}
      <header className="mast">
        <div className="wrap">
          <span className="kicker">Aura Health Rehab · Staff Portal</span>
          <h1>Staff Portal — User Handbook</h1>
          <p className="lede">One login for clinicians and office staff: your schedule, patients, session notes,
            payslips, trainings, meetings and more. This handbook is a step-by-step guide — it assumes you have never
            opened the portal before, and it walks through every page, every tab, and every button.</p>
          <div className="meta">
            <span>Address: <code>staff.sapphireclinicseast.org</code></span>
            <span>Sign in with your <b>work email &amp; password</b></span>
            <span>Audience: <b>Clinicians · Office staff · Interns · Manager</b></span>
          </div>
          <div className="mast-actions" data-noexport="">
            <button type="button" className="hb-btn" onClick={() => window.print()}>🖨&nbsp; Save as PDF</button>
            <button type="button" className="hb-btn ghost" onClick={downloadWord}>⬇&nbsp; Download as Word</button>
            <a className="hb-btn ghost" href="#help">🔎&nbsp; Search this handbook</a>
          </div>
        </div>
      </header>

      <main className="wrap">
        {/* TOC */}
        <nav className="toc" aria-label="Contents">
          <p className="toc-h">Contents</p>
          <ol>
            <li><a href="#getting-started"><b>01</b>Getting started</a></li>
            <li><a href="#systems"><b>02</b>Connected systems</a></li>
            <li><a href="#access"><b>03</b>Your access at a glance</a></li>
            <li><a href="#features"><b>04</b>Feature guide</a></li>
            <li><a href="#meetings"><b>05</b>Meetings</a></li>
            <li><a href="#playbooks"><b>06</b>Role playbooks</a></li>
            <li><a href="#tasks"><b>07</b>Common tasks</a></li>
            <li><a href="#help"><b>08</b>Help &amp; FAQ</a></li>
          </ol>
        </nav>

        {/* ── 01 GETTING STARTED ── */}
        <section id="getting-started">
          <p className="eyebrow">Section 01</p>
          <h2>Getting started</h2>
          <p>Everything here applies to <strong>every</strong> account. Your account type only changes what you see
            once you&rsquo;re in — not how you sign in.</p>

          <div className="cards">
            <div className="mod">
              <div className="mod-top"><h3>Signing in</h3><span className="loc">staff.sapphireclinicseast.org</span></div>
              <ol className="steps">
                <li>Open <a href="https://staff.sapphireclinicseast.org">staff.sapphireclinicseast.org</a> in Chrome,
                  Safari, or Edge. The old <code>teletherapy.*</code> address redirects here automatically.</li>
                <li>Type your <strong>email</strong> and <strong>password</strong>, then click <kbd>Sign In</kbd>.</li>
                <li>You stay signed in for about 12 hours. Use <kbd>Sign Out</kbd> at the bottom of the sidebar on a shared computer.</li>
              </ol>
              <div className="call rule" style={{ marginBottom: 0 }}>
                <span className="lbl">If your email is changing</span>
                Your login email is the email on your HR staff profile. When HR updates it and it syncs, your login email
                <b> changes with it automatically</b> and your <b>password stays the same</b>. Your old email keeps working
                as a backup, so you&rsquo;re never locked out. If the new email doesn&rsquo;t work yet, ask the clinic
                manager to run the staff sync.
              </div>
            </div>

            <div className="mod">
              <div className="mod-top"><h3>What you see once signed in</h3><span className="loc">the layout</span></div>
              <ul>
                <li><b>Left sidebar</b> — every page you can open; the current one is highlighted. On a phone, tap
                  <kbd>☰</kbd> (top-left) to open it.</li>
                <li><b>Top bar</b> — the <b>notification bell</b> and, if you work at both branches, the <b>branch toggle</b>.</li>
                <li><b>Your name, department and branch</b> sit at the bottom of the sidebar, with <kbd>Sign Out</kbd>.</li>
                <li><b>Concerns?</b> — a floating button (bottom-right) to report a portal problem. The clinic manager
                  sees a <b>Tickets</b> page instead.</li>
              </ul>
              <h4>The notification bell</h4>
              <p style={{ margin: '0 0 6px' }}>The <kbd>🔔</kbd> bell (top-right) shows a <b>red number</b> for unread
                items; open it and the number turns grey — and <b>stays</b> grey, even after signing out and back in.
                Click an item to jump to what it&rsquo;s about. What appears depends on your role — a reply to a Concern
                you raised (everyone), a patient upload or new department training (clinicians), an intern submission
                (supervisors), or a new ticket (manager).</p>
              <h4>The Concerns button</h4>
              <p style={{ margin: 0 }}>Click <kbd>Concerns?</kbd>, type your message, send. It reaches the clinic manager
                under <b>Tickets</b>; their reply comes back on your bell.</p>
            </div>

            <div className="mod">
              <div className="mod-top"><h3>Branch toggle &amp; password reset</h3><span className="loc">top bar · sign-in screen</span></div>
              <ul>
                <li><b>Branch toggle (East / Greenhills)</b> — if you work at <b>both</b> branches, click
                  <kbd>East Branch</kbd> or <kbd>Greenhills Branch</kbd> at the top to view that branch&rsquo;s schedule,
                  patients, and payslips. One login covers both. Work at one branch? No toggle appears — that&rsquo;s normal.</li>
                <li><b>Forgot your password</b> — on the sign-in screen click <kbd>Forgot password?</kbd>, enter your
                  email, and follow the reset link. No account yet? The clinic manager creates one for you.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 02 CONNECTED SYSTEMS ── */}
        <section id="systems">
          <p className="eyebrow">Section 02</p>
          <h2>Connected systems — where the data flows</h2>
          <p>The Staff Portal doesn&rsquo;t stand alone. It sits at the receiving end of four connected systems that
            share data automatically through secure system-to-system links, so information entered once doesn&rsquo;t
            have to be re-typed. This map shows what feeds <b>into</b> the Staff Portal and what flows <b>back out</b>.</p>

          <div className="hubwrap">
            <svg viewBox="0 0 760 470" role="img" aria-label="How the Staff Portal connects to the HR, Operations and Accounting hubs and the Client Portal" xmlns="http://www.w3.org/2000/svg" fontFamily="system-ui,-apple-system,'Segoe UI',sans-serif">
              <defs>
                <marker id="sphAh" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#6E8C86" />
                </marker>
              </defs>
              {/* arrows behind boxes */}
              <line x1="380" y1="108" x2="380" y2="196" stroke="#9BB4AE" strokeWidth="2" markerEnd="url(#sphAh)" />
              <line x1="150" y1="108" x2="300" y2="200" stroke="#9BB4AE" strokeWidth="2" markerEnd="url(#sphAh)" />
              <line x1="610" y1="108" x2="460" y2="200" stroke="#9BB4AE" strokeWidth="2" markerEnd="url(#sphAh)" />
              <line x1="380" y1="288" x2="380" y2="360" stroke="#9BB4AE" strokeWidth="2" markerStart="url(#sphAh)" markerEnd="url(#sphAh)" />
              {/* top row */}
              <rect x="40" y="44" width="220" height="64" rx="10" fill="#fff" stroke="#CBD8D4" strokeWidth="1.5" />
              <text x="150" y="72" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#16302E">Operations Hub</text>
              <text x="150" y="91" textAnchor="middle" fontSize="10" fill="#6A7B78">patients · schedules · decking</text>
              <rect x="270" y="44" width="220" height="64" rx="10" fill="#fff" stroke="#CBD8D4" strokeWidth="1.5" />
              <text x="380" y="72" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#16302E">HR Hub</text>
              <text x="380" y="91" textAnchor="middle" fontSize="10" fill="#6A7B78">accounts · manuals · seminars</text>
              <rect x="500" y="44" width="220" height="64" rx="10" fill="#fff" stroke="#CBD8D4" strokeWidth="1.5" />
              <text x="610" y="72" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#16302E">Accounting Hub</text>
              <text x="610" y="91" textAnchor="middle" fontSize="10" fill="#6A7B78">payroll · payslips</text>
              {/* centre: Staff Portal */}
              <rect x="290" y="198" width="180" height="90" rx="14" fill="#0E4A46" />
              <text x="380" y="234" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">STAFF PORTAL</text>
              <text x="380" y="254" textAnchor="middle" fontSize="9" fill="#A9D0C9">staff.sapphireclinicseast.org</text>
              <text x="380" y="270" textAnchor="middle" fontSize="9" fill="#A9D0C9">clinicians &amp; office staff</text>
              {/* bottom: Client Portal */}
              <rect x="270" y="362" width="220" height="64" rx="10" fill="#fff" stroke="#CBD8D4" strokeWidth="1.5" />
              <text x="380" y="390" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#16302E">Client Portal</text>
              <text x="380" y="409" textAnchor="middle" fontSize="10" fill="#6A7B78">patients · uploads &amp; their notes</text>
            </svg>
            <div className="hub-legend"><b>→</b> one-way (published to the Staff Portal) &nbsp;·&nbsp; <b>⇄</b> two-way</div>
          </div>

          <div className="cards">
            <div className="conn" id="c-hr">
              <div className="conn-head"><h3>HR Hub</h3><span className="loc">accounts · manuals · seminars · directory</span></div>
              <p className="desc">The staff-records system — the source of truth for your account and reference content.</p>
              <div className="flowgrid">
                <div className="flowcol supplies">
                  <div className="flow-lbl">→ Sends to the Staff Portal</div>
                  <ul>
                    <li><b>Your account &amp; login</b> — active staff and approved interns can sign in; your login email follows your HR profile.</li>
                    <li><b>Manuals, Seminars, Templates &amp; the Directory</b> — published from HR for the audience it chooses.</li>
                    <li><b>Supervision tags</b> — internship-supervisor, clinical-mentor and mentee flags decide who sees Internship / Mentorship.</li>
                  </ul>
                </div>
                <div className="flowcol receives">
                  <div className="flow-lbl">⇄ Back to HR</div>
                  <p className="flownone">One-way: HR is the source. Change your email, a manual, or a tag <em>in the HR Hub</em>, not here.</p>
                </div>
              </div>
            </div>

            <div className="conn" id="c-ops">
              <div className="conn-head"><h3>Operations Hub</h3><span className="loc">bookings · schedules · patient CRM</span></div>
              <p className="desc">The clinic-operations system — appointment bookings, clinician schedules, decking, and the patient record.</p>
              <div className="flowgrid">
                <div className="flowcol supplies">
                  <div className="flow-lbl">→ Sends to the Staff Portal</div>
                  <ul>
                    <li><b>Your Clinic Schedule</b> — the week of sessions you see comes from Operations bookings.</li>
                    <li><b>Your patients</b> — who is <b>decked</b> (assigned) to you, and the patient profile you open.</li>
                  </ul>
                </div>
                <div className="flowcol receives">
                  <div className="flow-lbl">⇄ Back to Operations</div>
                  <ul>
                    <li><b>Session outcomes</b> — the notes you complete record what happened in each booked session.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="conn" id="c-acct">
              <div className="conn-head"><h3>Accounting Hub</h3><span className="loc">payroll · payslips</span></div>
              <p className="desc">The company&rsquo;s books — payroll and consultant pay.</p>
              <div className="flowgrid">
                <div className="flowcol supplies">
                  <div className="flow-lbl">→ Sends to the Staff Portal</div>
                  <ul>
                    <li><b>Your payslips</b> — the Payroll page pulls each cutoff&rsquo;s payslip from Accounting, per branch.</li>
                  </ul>
                </div>
                <div className="flowcol receives">
                  <div className="flow-lbl">⇄ Back to Accounting</div>
                  <p className="flownone">One-way: payslips are read-only here.</p>
                </div>
              </div>
            </div>

            <div className="conn" id="c-client">
              <div className="conn-head"><h3>Client Portal</h3><span className="loc">patients · uploads &amp; their notes</span></div>
              <p className="desc">Where patients and caregivers log in — the two-way partner to the Staff Portal.</p>
              <div className="flowgrid">
                <div className="flowcol supplies">
                  <div className="flow-lbl">→ Patients send you</div>
                  <ul>
                    <li><b>PWD ID &amp; Doctor&rsquo;s Referral</b> — uploaded by the patient, shown on the patient&rsquo;s Documents.</li>
                    <li><b>Home Progress</b> — videos, voice notes and photos from home you can review by date.</li>
                  </ul>
                </div>
                <div className="flowcol receives">
                  <div className="flow-lbl">⇄ You send back</div>
                  <ul>
                    <li><b>Session notes &amp; reports</b> — the notes and Initial Evaluations you send reach the patient&rsquo;s Client Portal and email.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 03 ACCESS ── */}
        <section id="access">
          <p className="eyebrow">Section 03</p>
          <h2>Your access at a glance</h2>
          <p>The clinic manager sets your <strong>account type</strong> when creating your account, and it decides which
            pages appear in your sidebar. There are five kinds of account.</p>

          <div className="legend">
            <div className="rc mgr"><h4><BMgr /> Clinic manager</h4><p>The main admin. Sees <b>every page</b>, plus the <b>Admin Panel</b> and <b>Tickets</b>.</p></div>
            <div className="rc cln"><h4><BCln /> Clinician</h4><p>Clinical staff (OT, PT, SLP, SPED, Psychology, MD, Orthosis). The full clinical workspace + the shared pages.</p></div>
            <div className="rc off"><h4><BOff /> Office staff</h4><p>Front desk &amp; admin staff. The shared pages (front desk also gets <b>What Patients Love</b>); no clinical pages.</p></div>
            <div className="rc int"><h4><BInt /> Intern</h4><p>A trainee on rotation. A trimmed portal + the <b>Internship</b> section. Writes notes, but only a supervisor emails them.</p></div>
          </div>

          <div className="call tip">
            <span className="lbl">Two sections are unlocked by an HR tag, not the account type</span>
            <b>Internship</b> appears for tagged internship supervisors, <b>Intern</b> accounts, and the manager.
            <b> Mentorship</b> appears for tagged Clinical Mentors, their <b>mentees</b>, and the manager. Everyone else
            never sees them.
          </div>

          <div className="tablewrap">
            <table>
              <thead><tr><th>Page</th><th>Manager</th><th>Clinician</th><th>Office</th><th>Intern</th></tr></thead>
              <tbody>
                <tr><td className="mod-name">Dashboard</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Yes</td></tr>
                <tr><td className="mod-name">Clinic Schedule</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Yes</td></tr>
                <tr><td className="mod-name">Patients</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td></tr>
                <tr><td className="mod-name">Patients / Peers Love</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="part">Front desk</td><td className="no">—</td></tr>
                <tr><td className="mod-name">Seminars · Templates · Manuals · Directory · Wellness</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td></tr>
                <tr><td className="mod-name">Payroll · Loans &amp; Perks</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td></tr>
                <tr><td className="mod-name">Internship</td><td className="yes">Yes</td><td className="part">If supervisor</td><td className="no">—</td><td className="yes">Yes</td></tr>
                <tr><td className="mod-name">Mentorship</td><td className="yes">Yes</td><td className="part">If mentor / mentee</td><td className="no">—</td><td className="part">If mentee</td></tr>
                <tr><td className="mod-name">Settings</td><td className="yes">Yes</td><td className="yes">Yes</td><td className="no">—</td><td className="yes">Yes</td></tr>
                <tr><td className="mod-name">Tickets · Admin Panel</td><td className="yes">Yes</td><td className="no">—</td><td className="no">—</td><td className="no">—</td></tr>
              </tbody>
            </table>
          </div>
          <div className="call">
            <span className="lbl" style={{ color: 'var(--muted)' }}>Two things the table can&rsquo;t show</span>
            <b>Templates &amp; Forms</b> — clinicians see their own department; office staff and the manager see every
            department in tabs. <b>Manuals</b> also carry an audience set at upload (All staff / Admin employees only /
            Clinicians only), so the manuals shown depend on who each one is for.
          </div>
        </section>

        {/* ── 04 FEATURE GUIDE ── */}
        <section id="features">
          <p className="eyebrow">Section 04</p>
          <h2>Feature guide</h2>
          <p>Every page in the portal, with the roles that can open it and a walk-through of its buttons and tabs. The
            grey line above each group names the part of your day it belongs to.</p>

          <div className="grouphead" id="g-clinical">Clinical work</div>
          <div className="cards">
            <div className="mod" id="m-dashboard">
              <div className="mod-top"><h3>Dashboard</h3><span className="loc">Sidebar › Dashboard</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BInt /></div>
              <p className="desc">The clinical home screen — the first page after signing in. It lists <b>today&rsquo;s
                sessions</b> with each patient, time, status, and whether the note is done.</p>
              <ul>
                <li><b>Move between days</b> — the <kbd>‹</kbd> / <kbd>›</kbd> arrows step a day; <kbd>Today</kbd> jumps back.</li>
                <li><b>Open a session</b> — click a row to go to its screen and write or read the note.</li>
              </ul>
              <div className="note"><b>The 3 R&rsquo;s — Release by 1 · Reply by 5 · Report by 8.</b> The reminder on the
                right: Front Desk <b>releases</b> your next-day schedule before 1 PM; you <b>reply</b> to confirm before
                5 PM; you <b>report</b> a same-day absence by 8 AM.</div>
            </div>

            <div className="mod" id="m-schedule">
              <div className="mod-top"><h3>Clinic Schedule</h3><span className="loc">Sidebar › Clinic Schedule</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BInt /></div>
              <p className="desc">Your week of sessions across the branch(es) you work in. Click a session to open it and
                write its note; use the <b>branch toggle</b> to view one branch at a time.</p>
              <div className="note">The clinic manager also gets a <b>Session Trends</b> chart here — filter by
                department, clinician, and year to see session volumes over time.</div>
            </div>

            <div className="mod" id="m-patients">
              <div className="mod-top"><h3>Patients</h3><span className="loc">Sidebar › Patients</span></div>
              <div className="mod-roles"><BMgr /><BCln /></div>
              <p className="desc">Your patient list. <b>Search</b> by name, then filter with the buttons.</p>
              <h4>The filter buttons</h4>
              <ul>
                <li><kbd>Active</kbd> — patients currently assigned to you.</li>
                <li><kbd>Read-only</kbd> — patients you saw before but no longer own; you can read but not edit.</li>
                <li><kbd>Discharged</kbd> — patients who have completed care.</li>
              </ul>
              <h4>Inside a patient</h4>
              <ul>
                <li><b>Documents</b> — the Initial Evaluation &amp; Progress Reports, plus the patient&rsquo;s
                  <b> PWD ID</b> and <b>Doctor&rsquo;s Referral</b> when uploaded.</li>
                <li><b>Home Progress</b> — the videos, voice notes and photos the patient uploads from home. Open a date;
                  use the <b>From / To date filter</b> to focus on a period.</li>
                <li><b>Session notes</b> — each past session with its note; your own notes show <kbd>Edit notes</kbd> and
                  <kbd>Delete note</kbd> unless locked.</li>
              </ul>
            </div>

            <div className="mod" id="m-notes">
              <div className="mod-top"><h3>Session Notes &amp; Reports</h3><span className="loc">open any session</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BInt /></div>
              <p className="desc">Open a session (from the Dashboard, Clinic Schedule, or a patient) to write its note.
                Built-in forms cover OT, SLP, PT, SPED and Psychology; other departments get a free-text note.</p>
              <h4>The buttons</h4>
              <ul>
                <li><kbd>Complete</kbd> — saves the note and marks the session done.</li>
                <li><kbd>Edit</kbd> — reopen a completed note (an edit history is kept).</li>
                <li><kbd>Delete note</kbd> — remove the note entirely, with a confirm. Use it only to undo a mistake; it
                  can&rsquo;t be undone, and locked notes can&rsquo;t be deleted.</li>
                <li><kbd>Send Notes to Patient&rsquo;s Email</kbd> — emails a branded copy, branch inbox copied.
                  <b> Interns can&rsquo;t send</b> — only the supervisor can.</li>
              </ul>
              <div className="note"><b>Psychology &amp; MD notes are confidential by default</b> — hidden from other
                departments and from the patient. Tick <kbd>Show to Others</kbd> on the completed note to share it with
                the care team and the patient. Sending an MD note by email asks you to confirm first. All other
                professions work as before — patients keep access.</div>
            </div>
          </div>

          <div className="grouphead" id="g-everyday">Everyday &amp; reference</div>
          <div className="cards">
            <div className="mod" id="m-love">
              <div className="mod-top"><h3>What Patients / Peers Love About You</h3><span className="loc">Sidebar › the two &ldquo;Love&rdquo; pages</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BOff /></div>
              <p className="desc"><b>What Patients Love</b> gathers kind words from patient feedback (managers &amp;
                clinicians; front desk too). <b>What your Peers Love</b> shows the strengths colleagues named in peer
                evaluations. You see the feedback meant for you; the manager sees all.</p>
            </div>
            <div className="mod" id="m-seminars">
              <div className="mod-top"><h3>Seminars &amp; Trainings</h3><span className="loc">Sidebar › Seminars &amp; Trainings</span></div>
              <div className="mod-roles"><BAll /></div>
              <p className="desc">Upcoming and past seminars and trainings, with the details you need to attend or catch up.</p>
            </div>
            <div className="mod" id="m-templates">
              <div className="mod-top"><h3>Templates &amp; Forms</h3><span className="loc">Sidebar › Templates &amp; Forms</span></div>
              <div className="mod-roles"><BAll /></div>
              <p className="desc">Downloadable templates and fillable forms. Clinicians see their own department; office
                staff and the manager see every department in tabs (OT, SLP, PT, SPED, MD, Orthosis, Psychology). Click a
                tab, then a template to open or download it.</p>
            </div>
            <div className="mod" id="m-manuals">
              <div className="mod-top"><h3>Manuals</h3><span className="loc">Sidebar › Manuals</span></div>
              <div className="mod-roles"><BAll /></div>
              <p className="desc">Read-only department manuals, published from the HR Hub. Click one to open the viewer
                and turn pages — manuals <b>can&rsquo;t be downloaded</b>. Some include an <b>Ask the manual</b> chat:
                type a question and it answers from that manual. You only see manuals meant for your department and audience.</p>
            </div>
            <div className="mod" id="m-directory">
              <div className="mod-top"><h3>Directory</h3><span className="loc">Sidebar › Directory</span></div>
              <div className="mod-roles"><BAll /> <span className="loc">manager can edit</span></div>
              <p className="desc">Opens with <b>Online Forms — Scan or Click</b>: QR codes for the HR forms (Grievance,
                Incident Report, Staff Feedback, Staff Referral, Payroll Revision). Scan with your phone camera or tap a card.</p>
              <ul>
                <li><kbd>Branch Information</kbd> — addresses and details for each branch.</li>
                <li><kbd>Emails</kbd> — official addresses; filter and sort the table.</li>
                <li><kbd>Websites</kbd> — useful links.</li>
              </ul>
              <div className="note">On a phone, <b>swipe a table sideways</b> to see every column. Only the manager can
                add, edit, or delete entries and set who sees each one.</div>
            </div>
            <div className="mod" id="m-wellness">
              <div className="mod-top"><h3>Wellness Check</h3><span className="loc">Sidebar › Wellness Check</span></div>
              <div className="mod-roles"><BAll /></div>
              <p className="desc">A space to check in on staff wellbeing.</p>
            </div>
            <div className="mod" id="m-payroll">
              <div className="mod-top"><h3>Payroll</h3><span className="loc">Sidebar › Payroll</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BOff /></div>
              <p className="desc">Your payslips, pulled from the Accounting Hub. Click a payslip to open it. If you work
                at both branches, the branch toggle scopes payslips to East or Greenhills.</p>
            </div>
            <div className="mod" id="m-loans">
              <div className="mod-top"><h3>Loans &amp; Perks</h3><span className="loc">Sidebar › Loans &amp; Perks</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BOff /></div>
              <p className="desc">Everyone gets the <b>BDO Loan calculator</b> — enter an amount and term to estimate the
                monthly repayment. Employees also get <b>Company Loan</b>, showing a company loan and its per-cutoff
                payroll deductions.</p>
            </div>
          </div>

          <div className="grouphead" id="g-growth">Growth &amp; supervision</div>
          <div className="cards">
            <div className="mod" id="m-internship">
              <div className="mod-top"><h3>Internship</h3><span className="loc">Sidebar › Internship</span></div>
              <div className="mod-roles"><BMgr /> <span className="loc">supervisors</span> <BInt /></div>
              <p className="desc">Looks different depending on who you are.</p>
              <h4>If you supervise (or you&rsquo;re the manager)</h4>
              <ul>
                <li><kbd>List of Interns</kbd> — the interns decked to you. <kbd>All Interns</kbd> — every intern in your
                  department (manager sees all). Open one to read every note they&rsquo;ve written.</li>
                <li><kbd>Balik-Tanaw</kbd> — read and sign an intern&rsquo;s weekly reflections.</li>
                <li><kbd>Grades</kbd> — grade on the official <b>1.00–4.00 scale</b> (0.25 steps) with the rubric shown.</li>
                <li><kbd>Documents</kbd> &amp; <kbd>Learning Profiles</kbd> — department documents and each intern&rsquo;s goals.</li>
                <li><kbd>Meetings</kbd> — schedule and join supervision meetings (see Section 05).</li>
              </ul>
              <h4>If you&rsquo;re an intern</h4>
              <ul>
                <li><kbd>Learning Outcomes</kbd> — your goals &amp; learning preferences for your Clinical Instructors.</li>
                <li><kbd>Balik-Tanaw</kbd> — submit and sign your weekly reflection; your supervisor signs after reading it.</li>
                <li><kbd>Meetings</kbd> — join supervision meetings you&rsquo;re invited to.</li>
              </ul>
            </div>
            <div className="mod" id="m-mentorship">
              <div className="mod-top"><h3>Mentorship</h3><span className="loc">Sidebar › Mentorship</span></div>
              <div className="mod-roles"><BMgr /> <span className="loc">mentors &amp; mentees</span></div>
              <p className="desc">For Clinical Mentors and the people they mentor.</p>
              <ul>
                <li><b>Mentors</b> get a <kbd>Mentees</kbd> tab — open a mentee to read every note they&rsquo;ve written — and a <kbd>Meetings</kbd> tab.</li>
                <li><b>Mentees</b> get the <kbd>Meetings</kbd> tab to book and join mentorship meetings.</li>
              </ul>
              <div className="note"><b>Mentorship meetings are paid.</b> Each meeting is compensated to the mentor at the
                prevailing mentorship fee, deducted from the mentee&rsquo;s payroll — a note at the top of Mentorship ›
                Meetings says so.</div>
            </div>
            <div className="mod" id="m-settings">
              <div className="mod-top"><h3>Settings</h3><span className="loc">Sidebar › Settings</span></div>
              <div className="mod-roles"><BMgr /><BCln /><BInt /></div>
              <p className="desc">Your preferences and, for licensed clinicians, your <b>credentials</b>: your PRC
                License No. and PTR No. (they auto-fill on session forms) and your <b>e-signature</b>. Interns
                don&rsquo;t have PRC / PTR fields — they&rsquo;re not yet licensed.</p>
            </div>
          </div>

          <div className="grouphead" id="g-admin">Manager tools</div>
          <div className="cards">
            <div className="mod" id="m-tickets">
              <div className="mod-top"><h3>Tickets</h3><span className="loc">Sidebar › Tickets</span></div>
              <div className="mod-roles"><BMgr /></div>
              <p className="desc">Where the concerns staff raise (via the <b>Concerns?</b> button) arrive. Open a ticket,
                type a reply, and the person gets a notification on their bell.</p>
            </div>
            <div className="mod" id="m-admin">
              <div className="mod-top"><h3>Admin Panel</h3><span className="loc">Sidebar › Admin Panel</span></div>
              <div className="mod-roles"><BMgr /></div>
              <ul>
                <li><b>Create and manage staff accounts</b>, choosing each person&rsquo;s account type.</li>
                <li>Turn accounts <b>Active / Inactive</b>, reset passwords, and revise a staff email (which updates their login).</li>
                <li>Set the <b>Branch CC Emails</b> (East / Greenhills) copied on session notes and reports.</li>
                <li>Manage the whole <b>Directory</b> and who can see each entry.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 05 MEETINGS ── */}
        <section id="meetings">
          <p className="eyebrow">Section 05</p>
          <h2>Meetings</h2>
          <p>Both Internship and Mentorship share the same <b>Meetings</b> area, opened from their <kbd>Meetings</kbd>
            tab. It mints a video-call link (on <code>meet.sapphireclinicseast.org</code>) that everyone invited can
            join and record.</p>
          <div className="cards">
            <div className="mod" id="m-meetings">
              <div className="mod-top"><h3>The three inner tabs</h3><span className="loc">Internship / Mentorship › Meetings</span></div>
              <div className="mod-roles"><BMgr /> <span className="loc">supervisors · mentors · interns · mentees</span></div>
              <h4>Meeting Schedule</h4>
              <p style={{ margin: '0 0 4px' }}>The list. Switch <kbd>Upcoming</kbd> / <kbd>Past</kbd>. Each meeting shows
                its title, date, time, invitees, and a <kbd>Join</kbd> button. The creator can cancel with the trash button.</p>
              <h4>Set a Meeting — two modes</h4>
              <ul>
                <li><kbd>With a person</kbd> — pick someone who published availability, see their open times, choose a
                  date/time, and book. This is how an intern books a supervisor, or a mentee a mentor. The list is your department.</li>
                <li><kbd>Just create a link</kbd> — set a title, date and time, then tick who to invite (supervisors +
                  interns, or mentors + mentees) and press <kbd>Create meeting</kbd>. Inviting is optional. This mode is
                  for supervisors and mentors.</li>
              </ul>
              <h4>My Availability</h4>
              <p style={{ margin: 0 }}>Supervisors and mentors publish the times people can book them — add a day range
                and start/end time. Those slots then appear under <kbd>With a person</kbd>.</p>
            </div>
          </div>
        </section>

        {/* ── 06 PLAYBOOKS ── */}
        <section id="playbooks">
          <p className="eyebrow">Section 06</p>
          <h2>Role playbooks</h2>
          <p>A one-card summary of a typical day for each kind of account.</p>

          <div className="play cln">
            <h3><BCln /> Clinician</h3>
            <ul>
              <li>Start on the <b>Dashboard</b>; follow the 3 R&rsquo;s.</li>
              <li>See your week in <b>Clinic Schedule</b>; open a patient, run the session, write the note and email it.</li>
              <li>Check a patient&rsquo;s <b>Home Progress</b>, PWD ID and referral; email <b>Initial Evaluation reports</b>.</li>
              <li>See Patients-Love / Peers-Love; watch the <b>bell</b>; reach templates, manuals, seminars, payslips, Loans &amp; Perks.</li>
              <li>Work at two branches? Use the <b>branch toggle</b>.</li>
            </ul>
          </div>
          <div className="play off">
            <h3><BOff /> Office staff (front desk / admin)</h3>
            <ul>
              <li><b>Templates &amp; Forms</b> for every department, <b>Manuals</b>, <b>Seminars</b>.</li>
              <li><b>Directory</b> — emails, websites, branch info and the form QR codes.</li>
              <li><b>Payroll</b>, <b>Loans &amp; Perks</b>, <b>Wellness Check</b>; Peers-Love (front desk also sees Patients-Love).</li>
              <li>Report a problem with the <b>Concerns?</b> button.</li>
            </ul>
          </div>
          <div className="play int">
            <h3><BInt /> Intern</h3>
            <ul>
              <li>See your sessions in <b>Clinic Schedule</b> / <b>Dashboard</b> and write your notes (your supervisor emails them).</li>
              <li>In <b>Internship</b>: fill <b>Learning Outcomes</b>, submit weekly <b>Balik-Tanaw</b>, join <b>Meetings</b>.</li>
              <li>Use Seminars, Templates, Manuals, Directory, Wellness Check and Settings.</li>
            </ul>
          </div>
          <div className="play tag">
            <h3>Supervisor · mentor · mentee <span className="loc">unlocked by an HR tag</span></h3>
            <ul>
              <li><b>Supervisors</b> — track interns, read &amp; sign Balik-Tanaw, enter Grades (1.00–4.00), hold Meetings.</li>
              <li><b>Mentors</b> — read your mentees&rsquo; notes and hold Meetings (paid per meeting).</li>
              <li>Publish your bookable times under <b>My Availability</b> so mentees / interns can book you.</li>
              <li><b>Mentees</b> — book and join mentorship meetings from <b>Mentorship › Meetings</b>.</li>
            </ul>
          </div>
          <div className="play mgr">
            <h3><BMgr /> Clinic manager</h3>
            <ul>
              <li>See <b>every</b> page and all staff&rsquo;s feedback; answer concerns in <b>Tickets</b>.</li>
              <li><b>Admin Panel</b> — create accounts &amp; set types, activate / deactivate, reset passwords, revise emails, set Branch CC Emails, curate the Directory.</li>
              <li>See every intern (all departments) and every mentee in Internship / Mentorship.</li>
            </ul>
          </div>
        </section>

        {/* ── 07 COMMON TASKS ── */}
        <section id="tasks">
          <p className="eyebrow">Section 07</p>
          <h2>Common tasks</h2>
          <p>Click-by-click walkthroughs for the things you&rsquo;ll do most.</p>

          <div className="play cln">
            <h3>Email a session note to a patient <BCln /></h3>
            <ol>
              <li>Open the session from your <b>Dashboard</b> or <b>Clinic Schedule</b>.</li>
              <li>Fill in the note form and press <kbd>Complete</kbd>.</li>
              <li>Press <kbd>Send Notes to Patient&rsquo;s Email</kbd>. For an MD note, confirm when asked — it goes out branded, branch inbox copied.</li>
            </ol>
          </div>
          <div className="play cln">
            <h3>Add a supervision / mentorship meeting <span className="loc">supervisor · mentor</span></h3>
            <ol>
              <li>Open <b>Internship</b> or <b>Mentorship</b> › <kbd>Meetings</kbd> › <kbd>Set a Meeting</kbd>.</li>
              <li>Choose <kbd>With a person</kbd> to book availability, or <kbd>Just create a link</kbd> to pick a date/time and tick invitees.</li>
              <li>Press <kbd>Create meeting</kbd>. It appears under <kbd>Meeting Schedule</kbd> and invitees are notified.</li>
            </ol>
          </div>
          <div className="play cln">
            <h3>Grade an intern <span className="loc">supervisor</span></h3>
            <ol>
              <li>Open <b>Internship</b> › <kbd>Grades</kbd>.</li>
              <li>Pick the intern and choose a grade on the <b>1.00–4.00</b> scale (0.25 steps), guided by the rubric.</li>
              <li>Save; add a note to explain the mark if you like.</li>
            </ol>
          </div>
          <div className="play mgr">
            <h3>Create a staff account <BMgr /></h3>
            <ol>
              <li>Open the <b>Admin Panel</b> and choose <kbd>Add account</kbd>.</li>
              <li>Pick the staff member and set a temporary password.</li>
              <li>Choose the <b>account type</b> — Clinician, Front Desk, Admin Staff, Admin, or Intern — then save and share the sign-in details.</li>
            </ol>
          </div>
        </section>

        {/* ── 08 HELP ── */}
        <section id="help">
          <p className="eyebrow">Section 08</p>
          <h2>Help &amp; FAQ</h2>

          <div className="hb-search" data-noexport="">
            <label htmlFor="sph-search">Search this handbook</label>
            <input
              id="sph-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Try &ldquo;referral&rdquo;, &ldquo;loan&rdquo;, &ldquo;confidential&rdquo;, &ldquo;meeting&rdquo;…"
            />
            {!query.trim() && <p className="hint">Type a page, a button, or a term to jump to where it&rsquo;s explained.</p>}
            {query.trim() && (results.length > 0 ? (
              <ul className="sr-list">
                {results.map((r) => (
                  <li key={r.label + r.anchor}>
                    <a href={r.anchor}>
                      <span className="where">{r.where} · {r.label}</span>
                      <span className="snip">{r.blurb}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sr-empty">No match. Try a simpler word (&ldquo;note&rdquo;, &ldquo;branch&rdquo;, &ldquo;grade&rdquo;), or browse the Feature guide above.</p>
            ))}
          </div>

          <h3 className="blockh">Frequently asked</h3>
          <div className="faq">
            <details><summary>Which email do I log in with after my email changed?</summary><div className="a">
              <p>Log in with your <b>new</b> email. When HR updates your email and it syncs, your login switches to match
                automatically and your <b>password stays the same</b>. Your old email keeps working as a backup. If the
                new one doesn&rsquo;t work yet, ask the clinic manager to run the staff sync.</p></div></details>
            <details><summary>I don&rsquo;t see the branch toggle</summary><div className="a">
              <p>It only appears if you&rsquo;re set up at <b>both</b> branches on one login. At a single branch there&rsquo;s nothing to switch — this is normal.</p></div></details>
            <details><summary>Some pages are missing from my sidebar</summary><div className="a">
              <p>You only see the pages your <b>account type</b> allows — see <a href="#access">Your access at a glance</a>.
                Office staff don&rsquo;t see Dashboard, Clinic Schedule or Patients; interns see a trimmed set. If your type
                looks wrong, ask the manager to adjust it in the Admin Panel.</p></div></details>
            <details><summary>I&rsquo;m a supervisor / mentor but don&rsquo;t see Internship or Mentorship</summary><div className="a">
              <p>Those sections are unlocked by an <b>HR tag</b>, not the account type. Ask the manager to confirm
                you&rsquo;re tagged as an internship supervisor or Clinical Mentor (with mentees) in HR Staff Profiles.</p></div></details>
            <details><summary>My notification bell went red again after I signed out</summary><div className="a">
              <p>Once you open the bell the count turns grey and <b>stays</b> grey — even after signing out and back in.
                It only turns red again when something new arrives.</p></div></details>
            <details><summary>A patient can&rsquo;t see my Psychology / MD note</summary><div className="a">
              <p>That&rsquo;s intended — Psychology and MD notes are confidential by default. Tick <kbd>Show to Others</kbd>
                on the completed note if the patient and care team should see it.</p></div></details>
            <details><summary>I&rsquo;m an intern and can&rsquo;t email a note to a patient</summary><div className="a">
              <p>Interns write notes, but only the <b>supervisor</b> emails them to the patient. Ask your supervisor to send it.</p></div></details>
            <details><summary>The portal briefly showed an error or wouldn&rsquo;t load</summary><div className="a">
              <p>Short blips can happen during a system update. Wait a few seconds and refresh (<kbd>Cmd/Ctrl</kbd> +
                <kbd>Shift</kbd> + <kbd>R</kbd> for a hard refresh). If it persists, use <b>Concerns?</b> or tell the manager.</p></div></details>
            <details><summary>Who do I contact for account help?</summary><div className="a">
              <p>The <b>clinic manager</b> (main admin) manages all staff-portal accounts — logins, password resets,
                account types, and activating or deactivating accounts.</p></div></details>
          </div>
        </section>

        <footer>
          Aura Health Rehab · Sapphire Clinics East, Inc. — Staff Portal handbook. Reflects portal features as of the
          current deploy. Access shown reflects account type and HR tags; the clinic manager can adjust these anytime.
        </footer>
      </main>
    </div>
  )
}
