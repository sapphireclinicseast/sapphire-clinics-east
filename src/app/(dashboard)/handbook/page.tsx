'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Full handbook HTML — rendered in an isolated iframe so its CSS
// doesn't interact with the portal's own design tokens.
const HANDBOOK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Operations Hub — User Handbook</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#F2F5F9;--surface:#FFFFFF;--border:#DDE4EF;--text:#1C2535;--text2:#5A6880;--text3:#8A96A8;
  --sb-bg:#141B2D;--sb-border:rgba(26,123,138,0.18);--sb-text:rgba(255,255,255,0.55);
  --sb-active-bg:rgba(26,123,138,0.18);--sb-active-text:#4CC9D9;
  --teal:#1A7B8A;--orange:#ED6823;--orange-l:#FEF0E8;
  --admin:#1A7B8A;--hr:#6D28D9;--desk:#047857;--mktg:#ED6823;
  --sidebar-w:240px;--radius:10px;
}
html{scroll-behavior:smooth;font-size:15px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;overflow:hidden}
.layout{display:flex;height:100vh;overflow:hidden}
.sidebar{width:var(--sidebar-w);flex-shrink:0;height:100vh;overflow-y:auto;background:var(--sb-bg);border-right:1px solid var(--sb-border);display:flex;flex-direction:column}
.sb-logo{display:flex;align-items:center;gap:10px;padding:18px 18px 16px;border-bottom:1px solid var(--sb-border);flex-shrink:0}
.sb-mark{width:32px;height:32px;border-radius:8px;background:var(--teal);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sb-mark svg{fill:#fff}
.sb-wordmark .top{font-size:0.72rem;font-weight:800;letter-spacing:0.1em;color:#fff;text-transform:uppercase}
.sb-wordmark .bot{font-size:0.58rem;font-weight:600;letter-spacing:0.18em;color:var(--teal);text-transform:uppercase}
.sb-nav{flex:1;padding:0 10px 20px;overflow-y:auto}
.sb-group{margin-bottom:8px}
.sb-group-label{font-size:0.6rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.22);padding:10px 10px 4px}
.sb-link{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;font-size:0.78rem;font-weight:500;color:var(--sb-text);text-decoration:none;transition:background 0.15s,color 0.15s;cursor:pointer}
.sb-link:hover{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.85)}
.sb-link.active{background:var(--sb-active-bg);color:var(--sb-active-text);font-weight:600}
.sb-link .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.content{flex:1;overflow-y:auto;min-width:0}
.content-inner{max-width:840px;padding:36px 40px 80px}
.cover{background:var(--sb-bg);border-radius:var(--radius);padding:36px 36px 32px;margin-bottom:32px;border:1px solid rgba(26,123,138,0.25);position:relative;overflow:hidden}
.cover::before{content:'';position:absolute;right:-60px;top:-60px;width:240px;height:240px;background:radial-gradient(circle,rgba(26,123,138,0.25) 0%,transparent 70%);pointer-events:none}
.cover-eye{font-size:0.65rem;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--teal);margin-bottom:10px}
.cover h1{font-size:1.75rem;font-weight:800;color:#fff;line-height:1.25;margin-bottom:10px}
.cover p{font-size:0.88rem;color:rgba(255,255,255,0.55);max-width:480px;line-height:1.65}
.cover-meta{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
.cover-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;background:rgba(255,255,255,0.07);font-size:0.72rem;font-weight:600;color:rgba(255,255,255,0.45);letter-spacing:0.03em}
.cover-badge .pip{width:7px;height:7px;border-radius:50%}
.section{margin-bottom:36px}
.section-header{display:flex;align-items:flex-start;gap:14px;padding:20px 24px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;border-bottom:none}
.section-header.admin{border-left:4px solid var(--admin)}.section-header.hr{border-left:4px solid var(--hr)}
.section-header.desk{border-left:4px solid var(--desk)}.section-header.mktg{border-left:4px solid var(--mktg)}
.section-header.neutral{border-left:4px solid var(--border)}
.role-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem}
.role-icon.admin{background:#E5F4F6;color:var(--admin)}.role-icon.hr{background:#EDE9FE;color:var(--hr)}
.role-icon.desk{background:#D1FAE5;color:var(--desk)}.role-icon.mktg{background:var(--orange-l);color:var(--mktg)}
.role-icon.neutral{background:#F3F4F6;color:#6B7280}
.section-header h2{font-size:1.05rem;font-weight:700;color:var(--text);margin-bottom:2px}
.section-header p{font-size:0.8rem;color:var(--text2)}
.section-header .role-tag{display:inline-block;margin-top:6px;font-size:0.65rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:2px 7px;border-radius:4px}
.section-header .role-tag.mktg{background:var(--orange-l);color:var(--mktg)}
.section-header .role-tag.only{background:#FEF3C7;color:#92400E}
.section-body{background:var(--surface);border:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius)}
.module{padding:18px 24px;border-bottom:1px solid var(--border)}.module:last-child{border-bottom:none}
.module-name{font-size:0.82rem;font-weight:700;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:8px}
.module-path{font-size:0.68rem;font-weight:500;color:var(--text3);font-family:'SF Mono','Consolas',monospace;background:var(--bg);border:1px solid var(--border);padding:1px 6px;border-radius:4px}
.module p{font-size:0.8rem;color:var(--text2);line-height:1.65;margin-bottom:8px}
.access-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.role-pill{display:inline-flex;align-items:center;gap:4px;font-size:0.65rem;font-weight:700;letter-spacing:0.06em;padding:2px 8px;border-radius:20px}
.role-pill.admin{background:#E5F4F6;color:var(--admin)}.role-pill.hr{background:#EDE9FE;color:var(--hr)}
.role-pill.desk{background:#D1FAE5;color:var(--desk)}.role-pill.desk-lim{background:#D1FAE5;color:var(--desk);opacity:0.75}
.role-pill.mktg{background:var(--orange-l);color:var(--mktg)}.role-pill.only{background:#FEF3C7;color:#92400E}
.notes{margin-top:10px;display:flex;flex-direction:column;gap:5px}
.note{display:flex;gap:8px;font-size:0.76rem;color:var(--text2);padding:6px 10px;border-radius:7px;background:var(--bg);border-left:3px solid var(--border)}
.note.admin{border-left-color:var(--admin)}.note.hr{border-left-color:var(--hr)}
.note.desk{border-left-color:var(--desk)}.note.mktg{border-left-color:var(--mktg)}
.note-label{font-size:0.62rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;flex-shrink:0;padding-top:1px}
.note.admin .note-label{color:var(--admin)}.note.hr .note-label{color:var(--hr)}
.note.desk .note-label{color:var(--desk)}.note.mktg .note-label{color:var(--mktg)}
.plain-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:32px}
.plain-section h2{font-size:1rem;font-weight:700;color:var(--text);margin-bottom:16px}
.plain-section p{font-size:0.82rem;color:var(--text2);line-height:1.65;margin-bottom:10px}
.matrix-wrap{overflow-x:auto}
.matrix{width:100%;border-collapse:collapse;font-size:0.76rem}
.matrix th{background:var(--sb-bg);color:rgba(255,255,255,0.7);padding:8px 12px;text-align:left;font-weight:600;font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;border-bottom:2px solid rgba(26,123,138,0.3)}
.matrix th:first-child{border-radius:8px 0 0 0}.matrix th:last-child{border-radius:0 8px 0 0}
.matrix td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text)}
.matrix tr:last-child td{border-bottom:none}.matrix tr:hover td{background:#F8FAFD}
.matrix td:first-child{font-weight:600;font-size:0.78rem}
.matrix .yes{color:var(--desk);font-weight:700;font-size:0.85rem}.matrix .no{color:#CBD5E1;font-weight:500}
.matrix .lim{color:#D97706;font-weight:600;font-size:0.72rem}.matrix .only-a{color:var(--admin);font-weight:700;font-size:0.72rem}
.steps{display:flex;flex-direction:column;gap:0}
.step{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid var(--border)}.step:last-child{border-bottom:none}
.step-num{width:28px;height:28px;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;flex-shrink:0;margin-top:2px}
.step-body h4{font-size:0.85rem;font-weight:700;color:var(--text);margin-bottom:4px}
.step-body p{font-size:0.8rem;color:var(--text2);line-height:1.6}
.step-body code{font-family:'SF Mono','Consolas',monospace;font-size:0.8rem;background:var(--bg);border:1px solid var(--border);padding:1px 5px;border-radius:4px;color:var(--teal)}
.role-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:4px}
.role-card{border-radius:9px;padding:14px 16px;border:1px solid var(--border)}
.role-card.admin{border-top:3px solid var(--admin);background:linear-gradient(135deg,#E5F4F6 0%,#fff 60%)}
.role-card.hr{border-top:3px solid var(--hr);background:linear-gradient(135deg,#EDE9FE 0%,#fff 60%)}
.role-card.desk{border-top:3px solid var(--desk);background:linear-gradient(135deg,#D1FAE5 0%,#fff 60%)}
.role-card.mktg{border-top:3px solid var(--mktg);background:linear-gradient(135deg,var(--orange-l) 0%,#fff 60%)}
.role-card h4{font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:2px}
.role-card .role-id{font-size:0.65rem;font-family:'SF Mono','Consolas',monospace;color:var(--text3);margin-bottom:8px}
.role-card p{font-size:0.75rem;color:var(--text2);line-height:1.55}
.eyebrow{font-size:0.62rem;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:var(--teal);margin-bottom:6px}
.divider{height:1px;background:var(--border);margin:28px 0}
.callout{padding:12px 16px;border-radius:8px;background:#FFFBEB;border-left:3px solid #F59E0B;font-size:0.78rem;color:#78350F;line-height:1.6;margin:10px 0}
.callout strong{color:#92400E}
.hub-grid{display:flex;flex-direction:column;gap:16px;margin-top:16px}
.hub-card{border:1px solid var(--border);border-top:3px solid var(--teal);border-radius:var(--radius);overflow:hidden}
.hub-card-head{display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--bg);border-bottom:1px solid var(--border)}
.hub-icon{font-size:1.25rem;flex-shrink:0}
.hub-title{font-size:0.85rem;font-weight:700;color:var(--text)}
.hub-url{font-size:0.65rem;font-family:'SF Mono','Consolas',monospace;color:var(--text3);margin-top:2px}
.hub-flows{padding:0}
.flow-row{display:flex;align-items:flex-start;gap:10px;padding:11px 18px;border-bottom:1px solid var(--border)}
.flow-row:last-child{border-bottom:none}
.flow-arrow{display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;letter-spacing:0.06em;padding:2px 7px;border-radius:4px;flex-shrink:0;margin-top:2px;min-width:32px}
.flow-arrow.out{background:#DCFCE7;color:#166534}
.flow-arrow.in{background:#EDE9FE;color:#4C1D95}
.flow-row div{font-size:0.78rem;color:var(--text2);line-height:1.65}
.flow-row div strong{color:var(--text);font-weight:700}
/* ── UI mockup screenshots ──────────────────────────────────────────── */
.mockup{margin:18px 0 4px;border-radius:10px;overflow:hidden;border:1px solid var(--border);box-shadow:0 3px 14px rgba(0,0,0,0.08)}
.mockup-bar{background:#E3E6EB;padding:8px 12px;display:flex;align-items:center;gap:10px}
.mockup-dots{display:flex;gap:5px}
.mockup-dot{width:11px;height:11px;border-radius:50%}
.mockup-url{background:#fff;border-radius:5px;font-size:0.63rem;font-family:'SF Mono','Consolas',monospace;color:var(--text3);padding:3px 10px;flex:1;max-width:300px;margin:0 auto;border:1px solid #d1d5db;text-align:center}
.mockup-body{background:#F2F5F9;position:relative}
.mockup-label{font-size:0.7rem;color:var(--text3);text-align:center;font-style:italic;margin:6px 0 10px}
.cn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#ED6823;color:#fff;font-size:0.62rem;font-weight:800;flex-shrink:0;line-height:1}
.clist{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px}
.ci{display:flex;align-items:flex-start;gap:8px;font-size:0.76rem;color:var(--text2);line-height:1.55}
/* ── Print styles ───────────────────────────────────────────────────── */
@media print{
  body{overflow:visible!important;font-size:11pt}
  .layout{display:block!important;height:auto!important;overflow:visible!important}
  .sidebar{display:none!important}
  .content{display:block!important;overflow:visible!important;height:auto!important}
  .content-inner{max-width:100%!important;padding:16px 20px 40px!important}
  .section,.plain-section{break-inside:avoid;page-break-inside:avoid;margin-bottom:24px}
  .hub-card{break-inside:avoid}
  .cover{background:#1C2535!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:page}
  .mockup,.mockup-wrap{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .matrix-wrap{overflow:visible}
}
</style>
</head>
<body>
<div class="layout">
<aside class="sidebar">
  <div class="sb-logo">
    <div class="sb-mark"><svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,1 17,14 1,14"/></svg></div>
    <div class="sb-wordmark"><div class="top">Sapphire</div><div class="bot">Operations Hub</div></div>
  </div>
  <div class="sb-nav">
    <div class="sb-group">
      <div class="sb-group-label">Overview</div>
      <a class="sb-link" href="#about"><span class="dot" style="background:#4CC9D9"></span>About This Handbook</a>
      <a class="sb-link" href="#roles"><span class="dot" style="background:#4CC9D9"></span>Roles at a Glance</a>
      <a class="sb-link" href="#getting-started"><span class="dot" style="background:#4CC9D9"></span>Getting Started</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Home &amp; Overview</div>
      <a class="sb-link" href="#dashboard"><span class="dot" style="background:#6D28D9"></span>Home Dashboard</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Social &amp; Marketing</div>
      <a class="sb-link" href="#social"><span class="dot" style="background:#ED6823"></span>Social Media Suite</a>
      <a class="sb-link" href="#templates"><span class="dot" style="background:#ED6823"></span>Post Templates</a>
      <a class="sb-link" href="#email-sms"><span class="dot" style="background:#ED6823"></span>Email &amp; SMS</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Patients</div>
      <a class="sb-link" href="#patient-crm"><span class="dot" style="background:#1A7B8A"></span>Patient CRM</a>
      <a class="sb-link" href="#patient-profile"><span class="dot" style="background:#1A7B8A"></span>Patient Profile</a>
      <a class="sb-link" href="#patient-dashboard"><span class="dot" style="background:#1A7B8A"></span>Patient Dashboard</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Clinic Tools</div>
      <a class="sb-link" href="#staff"><span class="dot" style="background:#059669"></span>Staff Module</a>
      <a class="sb-link" href="#queueing"><span class="dot" style="background:#059669"></span>Queueing</a>
      <a class="sb-link" href="#clinic-schedule"><span class="dot" style="background:#059669"></span>Clinic Schedule</a>
      <a class="sb-link" href="#utilization"><span class="dot" style="background:#059669"></span>Clinic Utilization</a>
      <a class="sb-link" href="#survey"><span class="dot" style="background:#059669"></span>Customer Survey</a>
      <a class="sb-link" href="#reg-forms"><span class="dot" style="background:#059669"></span>Registration Forms</a>
      <a class="sb-link" href="#decking"><span class="dot" style="background:#059669"></span>Decking Module</a>
      <a class="sb-link" href="#patient-rel"><span class="dot" style="background:#059669"></span>Patient Relationship</a>
      <a class="sb-link" href="#peer-eval"><span class="dot" style="background:#059669"></span>Peer Evaluation</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Settings</div>
      <a class="sb-link" href="#connected-accounts"><span class="dot" style="background:#6B7280"></span>Connected Accounts</a>
      <a class="sb-link" href="#team"><span class="dot" style="background:#6B7280"></span>Team Management</a>
      <a class="sb-link" href="#brand-guide"><span class="dot" style="background:#6B7280"></span>Brand Guide</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Integrations</div>
      <a class="sb-link" href="#hub-integrations"><span class="dot" style="background:#10B981"></span>Hub Interconnections</a>
      <a class="sb-link" href="#hub-accounting"><span class="dot" style="background:#10B981"></span>Accounting Hub</a>
      <a class="sb-link" href="#hub-hr"><span class="dot" style="background:#6D28D9"></span>HR Platform</a>
      <a class="sb-link" href="#hub-client"><span class="dot" style="background:#1A7B8A"></span>Client Portal</a>
    </div>
    <div class="sb-group">
      <div class="sb-group-label">Reference</div>
      <a class="sb-link" href="#access-matrix"><span class="dot" style="background:#4CC9D9"></span>Access Matrix</a>
    </div>
  </div>
</aside>
<div class="content">
<div class="content-inner">

<div class="cover" id="about">
  <div class="cover-eye">Internal Documentation &middot; 2026</div>
  <h1>Operations Hub<br>User Handbook</h1>
  <p>A complete guide to using the Sapphire Clinics East Operations Hub &mdash; covering every module, tailored to what each account type can see and do.</p>
  <div class="cover-meta">
    <span class="cover-badge"><span class="pip" style="background:#1A7B8A"></span>Clinic Manager</span>
    <span class="cover-badge"><span class="pip" style="background:#6D28D9"></span>HR Officer</span>
    <span class="cover-badge"><span class="pip" style="background:#047857"></span>Front Desk</span>
    <span class="cover-badge"><span class="pip" style="background:#ED6823"></span>Marketing Admin</span>
  </div>
</div>

<div id="roles" class="plain-section">
  <div class="eyebrow">User Accounts</div>
  <h2>Roles at a Glance</h2>
  <p>Every Operations Hub account is assigned one of four roles. Your role determines which modules appear in the left sidebar and what actions you can perform. Front desk accounts are branch-locked &mdash; an East Branch front desk account cannot see Greenhills data, and vice versa.</p>
  <div class="role-cards">
    <div class="role-card admin"><h4>Clinic Manager</h4><div class="role-id">Role: ADMIN</div><p>Full access to every module including Team Management. Sees both East and Greenhills branches across all tools.</p></div>
    <div class="role-card hr"><h4>HR Officer</h4><div class="role-id">AHEA_ADMIN &middot; AHGH_ADMIN</div><p>Same access as Clinic Manager except cannot manage user accounts. Scoped to their assigned branch in scheduling tools.</p></div>
    <div class="role-card desk"><h4>Front Desk</h4><div class="role-id">AHEA_FRONT_DESK &middot; AHGH_FRONT_DESK</div><p>Clinic Tools only &mdash; no social media, email, or analytics. Branch-locked. Receives automatic reminders to check the waitlist.</p></div>
    <div class="role-card mktg"><h4>Marketing Admin</h4><div class="role-id">MARKETING_ADMIN</div><p>Full marketing suite plus patient analytics and staff tools. Cannot access Clinic Schedule, Decking, or Patient Relationship.</p></div>
  </div>
</div>

<div id="getting-started" class="plain-section">
  <div class="eyebrow">Onboarding</div>
  <h2>Getting Started</h2>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><h4>Log in</h4><p>Go to <code>operations.sapphireclinicseast.org</code> and sign in with your clinic email and password. If you have not received credentials, ask the Clinic Manager to add you under <strong>Settings &rarr; Team</strong>.</p></div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><h4>Read the sidebar</h4><p>The left sidebar lists every module your account can access, grouped by function. The highlighted item shows where you are. On mobile, tap the menu icon in the top bar to open it.</p></div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><h4>Set your active brand (non-front-desk only)</h4><p>Just below the logo in the sidebar, a brand selector shows your currently active brand. Click it to switch between <strong>Aura Health East</strong>, <strong>Aura Health Greenhills</strong>, or <strong>Verdana</strong>. Social media posts, email campaigns, and templates will be scoped to the selected brand.</p></div></div>
    <div class="step"><div class="step-num">4</div><div class="step-body"><h4>Front Desk: check the automatic reminders</h4><p>At <strong>11:00 AM and 4:00 PM</strong> each day, the portal will display a reminder to review the Waitlist and Patient Relationship log. A survey prompt also appears after confirmed sessions to collect patient feedback.</p></div></div>
  </div>
  <div class="mockup" style="margin-top:20px">
    <div class="mockup-bar">
      <div class="mockup-dots"><div class="mockup-dot" style="background:#FF5F57"></div><div class="mockup-dot" style="background:#FFBD2E"></div><div class="mockup-dot" style="background:#28C840"></div></div>
      <div class="mockup-url">operations.sapphireclinicseast.org/dashboard</div>
    </div>
    <div class="mockup-body" style="display:flex;height:210px">
      <div style="width:168px;background:#141B2D;flex-shrink:0;padding:10px 9px;display:flex;flex-direction:column;gap:3px;position:relative">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(26,123,138,0.2)">
          <div style="width:22px;height:22px;border-radius:5px;background:#1A7B8A;display:flex;align-items:center;justify-content:center"><svg width="11" height="11" viewBox="0 0 18 18" fill="white"><polygon points="9,1 17,14 1,14"/></svg></div>
          <div><div style="font-size:0.58rem;font-weight:800;color:#fff;letter-spacing:0.1em">SAPPHIRE</div><div style="font-size:0.43rem;color:#4CC9D9;letter-spacing:0.18em">OPERATIONS HUB</div></div>
        </div>
        <div style="font-size:0.5rem;color:rgba(255,255,255,0.22);letter-spacing:0.18em;text-transform:uppercase;padding:2px 2px 4px">Active Brand</div>
        <div style="background:rgba(255,255,255,0.07);border-radius:5px;padding:4px 8px;font-size:0.62rem;color:#fff;margin-bottom:8px;display:flex;align-items:center;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:#1A7B8A;flex-shrink:0"></span>Aura Health East ▾</div>
        <div style="font-size:0.5rem;color:rgba(255,255,255,0.22);letter-spacing:0.18em;text-transform:uppercase;padding:2px 2px 3px">Clinic Tools</div>
        <div style="padding:5px 8px;border-radius:5px;background:rgba(26,123,138,0.2);font-size:0.63rem;color:#4CC9D9;font-weight:600">📅 Clinic Schedule</div>
        <div style="padding:5px 8px;font-size:0.63rem;color:rgba(255,255,255,0.45)">🧑‍⚕️ Staff Module</div>
        <div style="padding:5px 8px;font-size:0.63rem;color:rgba(255,255,255,0.45)">🃏 Decking Module</div>
        <div style="padding:5px 8px;font-size:0.63rem;color:rgba(255,255,255,0.45)">👥 Patient CRM</div>
        <div style="position:absolute;top:50%;right:-10px;transform:translateY(-50%)" class="cn">1</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <div style="background:#fff;border-bottom:1px solid #DDE4EF;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div style="font-size:0.72rem;font-weight:700;color:#1C2535">Dashboard</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="font-size:0.65rem;color:#8A96A8;background:#F2F5F9;border-radius:5px;padding:3px 8px;position:relative">🔔 <span style="position:absolute;top:-3px;right:-3px;width:12px;height:12px;background:#ef4444;border-radius:50%;font-size:0.5rem;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">3</span></div>
            <div style="width:22px;height:22px;border-radius:50%;background:#1A7B8A;display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;font-weight:700">C</div>
            <div class="cn">2</div>
          </div>
        </div>
        <div style="flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:8px;overflow:hidden">
          <div style="font-size:0.68rem;font-weight:700;color:#1C2535;margin-bottom:2px">Upcoming Birthdays this week</div>
          <div style="background:#fff;border:1px solid #DDE4EF;border-radius:7px;padding:8px 12px;font-size:0.63rem;color:#5A6880">🎂 SANTOS, Maria — OT — July 22</div>
          <div style="background:#fff;border:1px solid #DDE4EF;border-radius:7px;padding:8px 12px;font-size:0.63rem;color:#5A6880">🎂 REYES, Juancho — SLP — July 24</div>
          <div style="background:#E5F4F6;border:1px solid #B8E3E8;border-radius:7px;padding:7px 12px;font-size:0.62rem;color:#1A7B8A;font-weight:600">🔔 Reminder: Check Waitlist (4 PM prompt)</div>
          <div class="cn" style="align-self:flex-end;margin-top:2px">3</div>
        </div>
      </div>
    </div>
  </div>
  <div class="clist">
    <div class="ci"><span class="cn">1</span><span>The <strong>left sidebar</strong> shows every module your role can access. The teal-highlighted item is your current page. Use the brand switcher above the nav to switch between Aura East, Aura Greenhills, and Verdana.</span></div>
    <div class="ci"><span class="cn">2</span><span>The <strong>top bar</strong> has the notification bell (orange dot = unread alerts) and your user avatar. Click Sign Out to log out securely.</span></div>
    <div class="ci"><span class="cn">3</span><span>The <strong>Dashboard</strong> shows this week's patient birthdays and any pending reminders. Front Desk accounts see the 4 PM waitlist prompt here automatically.</span></div>
  </div>
</div>

<div class="section" id="dashboard">
  <div class="section-header neutral"><div class="role-icon neutral">&#8862;</div><div><h2>Home Dashboard</h2><p>The first screen you land on after logging in.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Dashboard <span class="module-path">/dashboard</span></div>
    <p>The home screen shows a week-view list of patients with upcoming birthdays, giving front desk and clinical staff a heads-up for personal outreach. Admin and marketing accounts see additional panels for social media post counts and scheduled content. The dashboard defaults to East Branch for most accounts; Greenhills accounts (AHGH roles) see Greenhills data by default.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
  </div></div>
</div>

<div class="section" id="social">
  <div class="section-header mktg"><div class="role-icon mktg">&#9670;</div><div><h2>Social Media Suite</h2><p>Create, schedule, and publish content for clinic social media accounts.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body">
    <div class="module"><div class="module-name">New Post <span class="module-path">/social/compose</span></div><p>Write and publish social media posts for your active brand. Add a caption, attach an image or video, and choose to publish immediately or schedule for a later date and time. Posts are scoped to the brand selected in the sidebar switcher.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
    <div class="module"><div class="module-name">Scheduled Posts <span class="module-path">/social/scheduled</span></div><p>View all posts queued for future publication. Edit or cancel a scheduled post before it goes live.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
    <div class="module"><div class="module-name">Published Posts <span class="module-path">/social/published</span></div><p>Archive of all posts successfully published. Review past content, track posting history, and audit what has gone out under each brand.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
  </div>
</div>

<div class="section" id="templates">
  <div class="section-header mktg"><div class="role-icon mktg">&#10064;</div><div><h2>Post Templates</h2><p>Ready-made content frameworks for recurring post types.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body">
    <div class="module"><div class="module-name">Birthday Posts <span class="module-path">/templates/birthday</span></div><p>Auto-populated birthday post templates that pull patient or staff names for celebratory social media content. Select a name, choose a template design, and post directly or schedule it.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
    <div class="module"><div class="module-name">Holiday Posts <span class="module-path">/templates/holiday</span></div><p>Seasonal and holiday-themed post templates for national and local holidays. Templates are pre-captioned and ready to publish with minor edits for tone or brand voice.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
  </div>
</div>

<div class="section" id="email-sms">
  <div class="section-header mktg"><div class="role-icon mktg">&#9993;</div><div><h2>Email &amp; SMS Campaigns</h2><p>Bulk outreach to patient segments via email or text message.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body">
    <div class="module"><div class="module-name">Email Campaigns <span class="module-path">/email</span></div><p>Compose and send branded email blasts to filtered patient groups. Select recipients by branch, diagnosis category, or other criteria, then write the message body. Emails are sent from the clinic's official address with the active brand's header and footer.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
    <div class="module"><div class="module-name">SMS Campaigns <span class="module-path">/sms</span></div><p>Send text message broadcasts to patient lists. Useful for appointment reminders, event announcements, and clinic closure notices. SMS messages are routed through the branch's registered sender number.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div></div>
  </div>
</div>

<div class="section" id="patient-crm">
  <div class="section-header neutral"><div class="role-icon neutral">&#128100;</div><div><h2>Patient CRM</h2><p>The master list of all patients across branches.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Patient List <span class="module-path">/patients</span></div>
    <p>Searchable, filterable list of every patient in the system. Filter by branch, department, therapist, status, or name. Front desk accounts see their assigned branch only; admin accounts see all branches.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes"><div class="note desk"><span class="note-label">Front Desk</span>Sees only their own branch. Branch filter is locked.</div></div>
  </div></div>
</div>

<div class="section" id="patient-profile">
  <div class="section-header neutral"><div class="role-icon neutral">&#128194;</div><div><h2>Patient Profile</h2><p>Individual patient record with full history and demographics.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Patient Detail <span class="module-path">/patients/profile</span></div>
    <p>Full patient record: personal demographics, contact information, branch and department assignment, session history, and diagnosis notes. Reach this page by clicking any patient name in the Patient CRM list.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
  </div></div>
</div>

<div class="section" id="patient-dashboard">
  <div class="section-header admin"><div class="role-icon admin">&#128202;</div><div><h2>Patient Dashboard</h2><p>Analytics and population statistics across the patient base.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Analytics Dashboard <span class="module-path">/patients/dashboard</span></div>
    <p>Visual breakdown of the clinic's patient population. Includes an age-sex pyramid, pediatric vs. adult split, mean/median/mode age, top diagnoses by department and gender, and a geographic map showing where patients come from by city and barangay. A separate panel shows interdepartmental cross-referral patterns as a statistical affinity matrix with lift scores.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes">
      <div class="note admin"><span class="note-label">Admin / HR</span>Can filter by branch (East, Greenhills, Verdana) or view all combined.</div>
      <div class="note mktg"><span class="note-label">Marketing</span>Uses this data to target email/SMS campaigns and social content by patient demographics.</div>
    </div>
  </div></div>
</div>

<div class="section" id="staff">
  <div class="section-header neutral"><div class="role-icon neutral">&#127991;</div><div><h2>Staff Module</h2><p>Synced directory of all clinical and administrative staff.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Staff Directory <span class="module-path">/staff</span></div>
    <p>List of all active staff members pulled automatically from the HR Platform. Shows name, department, branch, employment type, and sex.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes">
      <div class="note admin"><span class="note-label">Admin / HR Officer</span>Can click any staff member to open their full HR profile: TIN, SSS/PhilHealth/Pag-IBIG numbers, bank details, and 201-file items. Not available to Front Desk or Marketing Admin.</div>
      <div class="note admin"><span class="note-label">Admin</span>Can merge duplicate staff records. Merge is irreversible &mdash; confirm the correct primary record before proceeding.</div>
      <div class="note desk"><span class="note-label">Front Desk</span>Read-only view of the staff list for their branch only. Cannot view HR details or merge records.</div>
    </div>
    <div class="mockup" style="margin-top:16px">
      <div class="mockup-bar">
        <div class="mockup-dots"><div class="mockup-dot" style="background:#FF5F57"></div><div class="mockup-dot" style="background:#FFBD2E"></div><div class="mockup-dot" style="background:#28C840"></div></div>
        <div class="mockup-url">operations.sapphireclinicseast.org/staff</div>
      </div>
      <div class="mockup-body" style="padding:12px 14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:0.75rem;font-weight:700;color:#1C2535">Staff Module</div>
            <div style="font-size:0.62rem;color:#8A96A8">105 staff &middot; synced from HR Platform</div>
          </div>
          <div style="background:#1A7B8A;color:#fff;border-radius:7px;padding:5px 12px;font-size:0.65rem;font-weight:600;cursor:pointer">&#10227; Sync from HR</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.63rem">
          <thead>
            <tr>
              <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:left;font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase">Name</th>
              <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:left;font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase">Department</th>
              <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:left;font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase">Branch</th>
              <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:left;font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase">Type</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background:#fff;cursor:pointer">
              <td style="padding:7px 10px;font-weight:700;color:#1A7B8A;text-decoration:underline;border-bottom:1px solid #DDE4EF;position:relative">
                ASISTIO, Frednick
                <span class="cn" style="position:absolute;top:5px;right:6px">1</span>
              </td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF"><span style="background:#EDE9FE;color:#5B21B6;font-size:0.6rem;padding:2px 7px;border-radius:4px;font-weight:700">PSYCHOLOGY</span></td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF;position:relative">
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <span style="background:#E5F4F6;color:#1A7B8A;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">East Branch</span>
                  <span style="background:#FFF3CD;color:#92400E;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">Greenhills Branch</span>
                </div>
                <span class="cn" style="position:absolute;top:5px;right:6px">2</span>
              </td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF"><span style="background:#FEF3C7;color:#92400E;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">Consultant</span></td>
            </tr>
            <tr style="background:#F8FAFD;cursor:pointer">
              <td style="padding:7px 10px;font-weight:700;color:#1A7B8A;text-decoration:underline;border-bottom:1px solid #DDE4EF">DE QUINTO, Julianne</td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF"><span style="background:#E5F4F6;color:#1A7B8A;font-size:0.6rem;padding:2px 7px;border-radius:4px;font-weight:700">OT</span></td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF"><span style="background:#E5F4F6;color:#1A7B8A;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">East Branch</span></td>
              <td style="padding:7px 10px;border-bottom:1px solid #DDE4EF"><span style="background:#DBEAFE;color:#1E40AF;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">Employee</span></td>
            </tr>
            <tr style="background:#fff;cursor:pointer">
              <td style="padding:7px 10px;font-weight:700;color:#1A7B8A;text-decoration:underline">SANTOS, Maria</td>
              <td style="padding:7px 10px"><span style="background:#FEE2E2;color:#991B1B;font-size:0.6rem;padding:2px 7px;border-radius:4px;font-weight:700">SLP</span></td>
              <td style="padding:7px 10px"><span style="background:#FFF0F9;color:#86198F;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">Greenhills Branch</span></td>
              <td style="padding:7px 10px"><span style="background:#DBEAFE;color:#1E40AF;font-size:0.6rem;padding:2px 7px;border-radius:20px;font-weight:700">Employee</span></td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:8px;font-size:0.6rem;color:#8A96A8;text-align:right">Showing 3 of 105 staff &middot; All fields except Sex and Extra Branches flow one-way from HR Hub</div>
      </div>
    </div>
    <div class="clist">
      <div class="ci"><span class="cn">1</span><span>Click any staff name to open the <strong>Staff Profile modal</strong>. HR Officers and Admins see sensitive details like government IDs, bank account, and 201-file documents. Front Desk users see only name, branch, and department.</span></div>
      <div class="ci"><span class="cn">2</span><span>Interbranch consultants show <strong>two branch chips</strong> side by side. This means they serve patients in both branches &mdash; their schedules and service invoices will appear in either branch view accordingly.</span></div>
    </div>
  </div></div>
</div>

<div class="section" id="queueing">
  <div class="section-header neutral"><div class="role-icon neutral">&#127915;</div><div><h2>Queueing</h2><p>Manage the clinic's digital waiting queue and display ads.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Queue Management <span class="module-path">/queueing</span></div>
    <p>Issue and advance queue tokens for patients arriving at the clinic. Admins can manage the queue display screen and upload promotional or announcement slides that appear on the waiting room screen. Slides can be assigned per branch (East only, Greenhills only, or both).</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes">
      <div class="note admin"><span class="note-label">Admin / HR Officer</span>Can upload, reorder, and delete display ads for the waiting room screen.</div>
      <div class="note desk"><span class="note-label">Front Desk</span>Can issue queue numbers and advance the queue. Cannot manage display ads.</div>
    </div>
  </div></div>
</div>

<div class="section" id="clinic-schedule">
  <div class="section-header desk"><div class="role-icon desk">&#128197;</div><div><h2>Clinic Schedule</h2><p>Real-time view of clinician schedules, by department and branch.</p><span class="role-tag mktg">Not available to Marketing Admin</span></div></div>
  <div class="section-body">
    <div class="module">
      <div class="module-name">Department View <span class="module-path">/clinic-schedule</span></div>
      <p>Staff are grouped into department tabs: <strong>OT</strong>, <strong>SLP</strong>, and <strong>Developmental</strong>. Within each tab, individual clinician cards show their confirmed patient appointments for the selected date. Branch tabs at the top switch between East and Greenhills.</p>
      <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div>
      <div class="notes">
        <div class="note admin"><span class="note-label">Admin</span>Sees both East and Greenhills branch tabs. Can switch freely.</div>
        <div class="note hr"><span class="note-label">HR Officer</span>Sees their assigned branch only.</div>
        <div class="note desk"><span class="note-label">Front Desk</span>Sees their branch only. Uses the schedule to verify which clinician a patient is assigned to on a given day.</div>
      </div>
    </div>
    <div class="module">
      <div class="module-name">Clinician Cards</div>
      <p>Each card displays the clinician's name, department badge, and branch indicator. Clinicians serving both branches carry a purple <strong>"Both Branches"</strong> badge. Use the card to send the clinician their day schedule by <strong>email</strong> or <strong>SMS</strong> &mdash; the message is automatically branded to the branch tab currently shown.</p>
      <div class="notes">
        <div class="note admin"><span class="note-label">Tip</span>The "Tomorrow" panel at the bottom gives a heads-up on next-day schedules so you can contact clinicians the evening before.</div>
        <div class="note desk"><span class="note-label">Makeup Sessions</span>A separate "Makeup" panel lists patients whose sessions were missed and need rescheduling.</div>
      </div>
      <div class="mockup" style="margin-top:16px">
        <div class="mockup-bar">
          <div class="mockup-dots"><div class="mockup-dot" style="background:#FF5F57"></div><div class="mockup-dot" style="background:#FFBD2E"></div><div class="mockup-dot" style="background:#28C840"></div></div>
          <div class="mockup-url">operations.sapphireclinicseast.org/clinic-schedule</div>
        </div>
        <div class="mockup-body" style="padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.62rem;font-weight:700;color:#5A6880;text-transform:uppercase;letter-spacing:0.1em">Branch</span>
              <div style="display:flex;border:1px solid #DDE4EF;border-radius:6px;overflow:hidden;font-size:0.68rem;font-weight:600">
                <div style="padding:4px 12px;background:#1A7B8A;color:#fff">All</div>
                <div style="padding:4px 12px;color:#8A96A8">East Branch</div>
                <div style="padding:4px 12px;color:#8A96A8">Greenhills Branch</div>
              </div>
              <span class="cn">1</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.62rem;font-weight:700;color:#5A6880;text-transform:uppercase;letter-spacing:0.1em">View</span>
              <div style="display:flex;border:1px solid #DDE4EF;border-radius:6px;overflow:hidden;font-size:0.68rem">
                <div style="padding:4px 11px;background:#1A7B8A;color:#fff;font-weight:600">Department</div>
                <div style="padding:4px 11px;color:#8A96A8">Calendar</div>
                <div style="padding:4px 11px;color:#8A96A8">Daily</div>
                <div style="padding:4px 11px;color:#8A96A8">Status</div>
              </div>
              <span class="cn">2</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            <div style="background:#fff;border:1px solid #DDE4EF;border-radius:8px;padding:10px 12px">
              <div style="font-size:0.68rem;font-weight:700;color:#1C2535;margin-bottom:6px">DE QUINTO, Julianne <span style="background:#E5F4F6;color:#1A7B8A;font-size:0.58rem;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px">OT</span></div>
              <div style="font-size:0.62rem;color:#5A6880;margin-bottom:4px">Mon · 4 sessions confirmed</div>
              <div style="display:flex;gap:4px"><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#DDE4EF;border-radius:2px"></div></div>
              <div style="margin-top:8px;display:flex;gap:4px"><div style="font-size:0.58rem;background:#E5F4F6;color:#1A7B8A;border-radius:4px;padding:2px 6px;font-weight:600">📧 Email</div><div style="font-size:0.58rem;background:#E5F4F6;color:#1A7B8A;border-radius:4px;padding:2px 6px;font-weight:600">💬 SMS</div></div>
            </div>
            <div style="background:#fff;border:1px solid #DDE4EF;border-radius:8px;padding:10px 12px;position:relative">
              <div style="font-size:0.68rem;font-weight:700;color:#1C2535;margin-bottom:4px">ASISTIO, Frednick <span style="background:#EDE9FE;color:#5B21B6;font-size:0.56rem;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px">Both Branches</span></div>
              <div style="font-size:0.62rem;color:#5A6880;margin-bottom:4px">Mon · 3 sessions</div>
              <div style="display:flex;gap:4px"><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#DDE4EF;border-radius:2px"></div></div>
              <span class="cn" style="position:absolute;top:6px;right:6px">3</span>
            </div>
            <div style="background:#fff;border:1px solid #DDE4EF;border-radius:8px;padding:10px 12px">
              <div style="font-size:0.68rem;font-weight:700;color:#1C2535;margin-bottom:4px">GO, Jenina <span style="background:#D1FAE5;color:#047857;font-size:0.58rem;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px">SLP</span></div>
              <div style="font-size:0.62rem;color:#5A6880;margin-bottom:4px">Mon · 5 sessions confirmed</div>
              <div style="display:flex;gap:4px"><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div><div style="height:4px;flex:1;background:#1A7B8A;border-radius:2px"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="clist">
        <div class="ci"><span class="cn">1</span><span>The <strong>Branch toggle</strong> lets Admin accounts switch between All, East Branch, and Greenhills Branch. Branch-scoped accounts only see their own branch.</span></div>
        <div class="ci"><span class="cn">2</span><span>Four <strong>view modes</strong>: Department (clinician cards), Calendar (week grid), Daily (session list by time), and Status (confirm/cancel inline).</span></div>
        <div class="ci"><span class="cn">3</span><span>Clinicians serving both branches carry a <strong>purple "Both Branches" badge</strong>. Their card appears in both East and Greenhills views.</span></div>
      </div>
    </div>
  </div>
</div>

<div class="section" id="utilization">
  <div class="section-header admin"><div class="role-icon admin">&#128200;</div><div><h2>Clinic Utilization</h2><p>Analytics on how fully scheduled clinicians are across the clinic.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Scheduling Dashboard <span class="module-path">/scheduling-dashboard</span></div>
    <p>Shows clinician utilization rates &mdash; the proportion of available slots that are booked &mdash; broken down by department, branch, and time period. Use this to identify over-booked clinicians who need capacity relief, or under-utilized slots that could be opened to new patients.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div>
  </div></div>
</div>

<div class="section" id="survey">
  <div class="section-header neutral"><div class="role-icon neutral">&#11088;</div><div><h2>Customer Survey</h2><p>Collect, track, and analyze patient and caregiver satisfaction ratings.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Survey Dashboard <span class="module-path">/customer-survey</span></div>
    <p><strong>Overview</strong> &mdash; Aggregate satisfaction scores, trending ratings, and a top-performer leaderboard. <strong>Daily Target</strong> &mdash; Tracks how many surveys have been collected today versus the branch's daily target. <strong>Results</strong> &mdash; Individual survey responses with export options. Sub-tabs: Leaderboard, Details, Manage, Highlights, and Settings. <strong>Manage</strong> &mdash; Add or remove staff from the survey rotation.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk desk-lim">Front Desk (limited)</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes">
      <div class="note desk"><span class="note-label">Front Desk</span>Can submit new survey responses on behalf of patients. Has a limited view &mdash; does not see the full leaderboard, settings, or highlights tabs.</div>
      <div class="note admin"><span class="note-label">Admin / HR Officer</span>Can access all tabs including Settings and Highlights (to flag positive quotes for social media use).</div>
    </div>
  </div></div>
</div>

<div class="section" id="reg-forms">
  <div class="section-header neutral"><div class="role-icon neutral">&#128203;</div><div><h2>Registration Forms</h2><p>View and process incoming patient registration form submissions.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Form Submissions <span class="module-path">/registration-forms</span></div>
    <p>Lists all patient registration form submissions received through the clinic's online registration links. Click a record to view the full intake form response. Download a PDF of any submission for physical filing.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes"><div class="note desk"><span class="note-label">Front Desk</span>Uses this module to process new patient registrations and hand off to the clinician assignment workflow.</div></div>
  </div></div>
</div>

<div class="section" id="decking">
  <div class="section-header desk"><div class="role-icon desk">&#128369;</div><div><h2>Decking Module</h2><p>Weekly recurring slot assignment for regular patients and therapists.</p><span class="role-tag mktg">Not available to Marketing Admin</span></div></div>
  <div class="section-body">
    <div class="module">
      <div class="module-name">Weekly Decking Table <span class="module-path">/decking</span></div>
      <p>The decking table shows each therapist's recurring weekly schedule &mdash; which patient is assigned to each time slot on which day. Click a slot to assign, reassign, or remove a patient. Slots can be disabled for a specific therapist (e.g., during leave) without deleting the recurring assignment.</p>
      <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div>
      <div class="notes"><div class="note desk"><span class="note-label">Front Desk</span>The primary users of this module. Uses it daily to track who has a slot with which therapist.</div></div>
    </div>
    <div class="module">
      <div class="module-name">Clinic Hours Settings <span class="module-path">/decking &rarr; Settings tab</span></div>
      <p>Configure the default clinic operating hours for each branch &mdash; which days are open and the opening/closing times. These defaults pre-fill new therapist schedule configurations.</p>
      <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div>
      <div class="mockup" style="margin-top:16px">
        <div class="mockup-bar">
          <div class="mockup-dots"><div class="mockup-dot" style="background:#FF5F57"></div><div class="mockup-dot" style="background:#FFBD2E"></div><div class="mockup-dot" style="background:#28C840"></div></div>
          <div class="mockup-url">operations.sapphireclinicseast.org/decking</div>
        </div>
        <div class="mockup-body" style="padding:12px 14px;overflow-x:auto">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;gap:6px">
              <div style="padding:4px 12px;background:#1A7B8A;color:#fff;border-radius:6px;font-size:0.65rem;font-weight:700">Deck</div>
              <div style="padding:4px 12px;background:#fff;border:1px solid #DDE4EF;border-radius:6px;font-size:0.65rem;color:#8A96A8">Waitlist</div>
              <div style="padding:4px 12px;background:#fff;border:1px solid #DDE4EF;border-radius:6px;font-size:0.65rem;color:#8A96A8">Settings</div>
            </div>
            <span class="cn">1</span>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.63rem;min-width:420px">
            <thead>
              <tr>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:left;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Therapist</th>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:center;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Mon</th>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:center;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Tue</th>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:center;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Wed</th>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:center;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Thu</th>
                <th style="background:#1C2535;color:rgba(255,255,255,0.7);padding:6px 10px;text-align:center;font-weight:600;font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase">Fri</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background:#fff">
                <td style="padding:6px 10px;font-weight:700;color:#1C2535;border-bottom:1px solid #DDE4EF">DE QUINTO, J. <span style="background:#E5F4F6;color:#1A7B8A;font-size:0.55rem;padding:1px 4px;border-radius:3px">OT</span></td>
                <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #DDE4EF"><div style="background:#E5F4F6;color:#1A7B8A;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">SANTOS, M.</div></td>
                <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #DDE4EF"><div style="background:#E5F4F6;color:#1A7B8A;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">REYES, J.</div></td>
                <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #DDE4EF"><div style="background:#E5F4F6;color:#1A7B8A;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">SANTOS, M.</div></td>
                <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #DDE4EF;position:relative"><div style="background:#FEF9C3;color:#92400E;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">BANICO, A.</div><span class="cn" style="position:absolute;top:-6px;right:-6px">2</span></td>
                <td style="padding:6px 10px;text-align:center;border-bottom:1px solid #DDE4EF"><div style="background:#F3F4F6;color:#9CA3AF;border-radius:5px;padding:2px 6px;font-size:0.6rem">— empty —</div></td>
              </tr>
              <tr style="background:#F8FAFD">
                <td style="padding:6px 10px;font-weight:700;color:#1C2535">GO, J. <span style="background:#D1FAE5;color:#047857;font-size:0.55rem;padding:1px 4px;border-radius:3px">SLP</span></td>
                <td style="padding:6px 10px;text-align:center"><div style="background:#D1FAE5;color:#047857;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">PAREJA, A.</div></td>
                <td style="padding:6px 10px;text-align:center"><div style="background:#D1FAE5;color:#047857;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">TAN, C.</div></td>
                <td style="padding:6px 10px;text-align:center"><div style="background:#F3F4F6;color:#9CA3AF;border-radius:5px;padding:2px 6px;font-size:0.6rem">— empty —</div></td>
                <td style="padding:6px 10px;text-align:center"><div style="background:#D1FAE5;color:#047857;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">PAREJA, A.</div></td>
                <td style="padding:6px 10px;text-align:center"><div style="background:#D1FAE5;color:#047857;border-radius:5px;padding:2px 6px;font-size:0.6rem;font-weight:600">TAN, C.</div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="clist">
        <div class="ci"><span class="cn">1</span><span>Three tabs: <strong>Deck</strong> (the recurring weekly table), <strong>Waitlist</strong> (patients awaiting a slot), and <strong>Settings</strong> (clinic hours configuration).</span></div>
        <div class="ci"><span class="cn">2</span><span>Click any <strong>slot cell</strong> to assign, change, or remove a patient from that therapist's recurring schedule. Yellow slots indicate recently changed assignments.</span></div>
      </div>
    </div>
  </div>
</div>

<div class="section" id="patient-rel">
  <div class="section-header desk"><div class="role-icon desk">&#129309;</div><div><h2>Patient Relationship</h2><p>Track waitlist, follow-ups, no-shows, and cancellation records.</p><span class="role-tag mktg">Not available to Marketing Admin</span></div></div>
  <div class="section-body">
    <div class="module"><div class="module-name">Waitlist <span class="module-path">/patient-relationship &rarr; Waitlist</span></div><p>Patients who have submitted a registration form but do not yet have a regular slot. When a slot opens up, locate the appropriate patient on the waitlist and move them into the decking table.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div></div>
    <div class="module"><div class="module-name">Follow-Up <span class="module-path">/patient-relationship &rarr; Follow-Up</span></div><p>Patients flagged for follow-up contact, organized by department. Track patients who need a return call after a missed appointment, schedule change, or therapy recommendation.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div></div>
    <div class="module"><div class="module-name">No-Show Log <span class="module-path">/patient-relationship &rarr; No-Show</span></div><p>Log and track patient no-shows. The log provides a full history per patient so that repeat no-shows can be identified and addressed proactively.</p><div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div></div>
    <div class="module">
      <div class="module-name">Cancellation Tracker <span class="module-path">/patient-relationship &rarr; Cancellation</span></div>
      <p>Tracks every cancellation per patient and enforces clinic policy automatically. Each patient receives <strong>2 free cancellations</strong> within a 6-month window. After that, a cancellation fee applies. At <strong>10 cancellations</strong>, the record is highlighted as a warning. At <strong>12 total cancellations</strong>, the patient is flagged for slot review.</p>
      <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk">Front Desk</span></div>
      <div class="notes">
        <div class="note desk"><span class="note-label">Front Desk</span>Logs each cancellation as it happens. The portal tracks the count and surfaces the policy threshold status (free remaining, fee applies, slot risk) on each patient row.</div>
        <div class="note admin"><span class="note-label">Admin / HR Officer</span>Can review the full cancellation history and make decisions on slot removal. Has override capability on fee application.</div>
      </div>
    </div>
  </div>
</div>

<div class="section" id="peer-eval">
  <div class="section-header neutral"><div class="role-icon neutral">&#127885;</div><div><h2>Peer Evaluation</h2><p>Structured evaluation system for clinical and administrative staff.</p></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Peer Evaluation System <span class="module-path">/peer-eval</span></div>
    <p>Supports two evaluation types: <strong>HR08</strong> (admin-to-peer) and <strong>HR09</strong> (clinical peer-to-peer). Each assignment has a status of Pending, Completed, or Expired. Evaluators complete a scored rubric. Completed evaluations can be downloaded as a PDF for filing.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill desk desk-lim">Front Desk (limited)</span><span class="role-pill mktg">Marketing Admin</span></div>
    <div class="notes">
      <div class="note admin"><span class="note-label">Admin / HR Officer</span>Can create and assign new evaluation pairs. Can delete pending assignments and download results.</div>
      <div class="note desk"><span class="note-label">Front Desk</span>Can view their own assigned evaluations and complete them. Cannot create or delete assignments.</div>
      <div class="note admin"><span class="note-label">QR Access</span>Each evaluation assignment has a QR code link. Share this with the evaluator so they can complete the form on mobile without logging into the portal.</div>
    </div>
  </div></div>
</div>

<div class="divider"></div>
<div class="eyebrow" style="margin-bottom:8px">Settings</div>

<div class="section" id="connected-accounts">
  <div class="section-header neutral"><div class="role-icon neutral">&#128279;</div><div><h2>Connected Accounts</h2><p>Link social media and email platform accounts to the portal.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Account Connections <span class="module-path">/settings/accounts</span></div>
    <p>Connect and manage the social media accounts and email integrations that power the Social Media Suite and Email Campaign modules. Each brand has its own set of linked accounts. If a post fails to publish, check here first to confirm the connected account token has not expired.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div>
  </div></div>
</div>

<div class="section" id="team">
  <div class="section-header admin"><div class="role-icon admin">&#128101;</div><div><h2>Team Management</h2><p>Create, edit, and deactivate Operations Hub user accounts.</p><span class="role-tag only">Clinic Manager (Admin) only</span></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">User Accounts <span class="module-path">/settings/users</span></div>
    <p>Add new team members by entering their name, email address, and assigning them a role. The portal sends login credentials to the new user's email. Change a user's role at any time without creating a new account. Deactivate accounts for staff who have left &mdash; deactivated accounts cannot log in but their history is preserved.</p>
    <div class="access-row"><span class="role-pill only">Clinic Manager (Admin) only</span></div>
    <div class="callout"><strong>Important:</strong> Only the Clinic Manager account (ADMIN role) can see or access this page. If you need a new account created or a role changed, contact the Clinic Manager.</div>
  </div></div>
</div>

<div class="section" id="brand-guide">
  <div class="section-header neutral"><div class="role-icon neutral">&#127912;</div><div><h2>Brand Guide</h2><p>Official brand assets, colors, and typography for both clinic brands.</p><span class="role-tag mktg">Not available to Front Desk</span></div></div>
  <div class="section-body"><div class="module">
    <div class="module-name">Brand Reference <span class="module-path">/brand</span></div>
    <p>A living reference page for SCEI's brand standards &mdash; logos, color codes (hex and CMYK), approved typefaces, and usage guidelines for Aura Health and Verdana sub-brands. Use this page when creating materials outside the portal to ensure visual consistency.</p>
    <div class="access-row"><span class="role-pill admin">Admin</span><span class="role-pill hr">HR Officer</span><span class="role-pill mktg">Marketing Admin</span></div>
  </div></div>
</div>

<div class="divider"></div>
<div id="hub-integrations" class="plain-section">
  <div class="eyebrow">System Architecture</div>
  <h2>Hub Interconnections</h2>
  <p>The Operations Hub is the central patient and scheduling layer of the Sapphire Clinics East platform. It does not operate in isolation — data flows automatically between three other hubs. Understanding these connections helps you trace where information originates and where downstream action is needed.</p>
  <p>The shared PostgreSQL database is the backbone: the Accounting Hub, HR Platform sync, and Client Portal all read from or write into the same data store that the Operations Hub uses. There is no manual export or import between systems.</p>

  <div class="hub-grid">

    <div class="hub-card" id="hub-accounting" style="border-top-color:#10B981">
      <div class="hub-card-head" style="color:#10B981">
        <span class="hub-icon">&#128181;</span>
        <div>
          <div class="hub-title">Accounting Hub</div>
          <div class="hub-url">accounting.sapphireclinicseast.org</div>
        </div>
      </div>
      <div class="hub-flows">
        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div><strong>Staff Service Invoices</strong> — When a consultant session is confirmed in the Clinic Schedule, the Accounting Hub generates a service invoice to record the consultant's professional fee for that session. Invoice data is derived from Operations Hub session records.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div><strong>Revenue &amp; Income Statement</strong> — The Accounting Hub Income Statement pulls confirmed session counts from the Operations Hub database to derive therapy revenue figures. No manual data entry is needed; it reads the schedule directly.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div><strong>Referral Records</strong> — The Referral module in the Accounting Hub cross-references patient records from the Operations Hub CRM to link referring partners and schools to their referred patients and sessions.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div><strong>Client Portal Payments</strong> — Booking downpayments processed through the Client Portal via PayMongo are recorded in the Accounting Hub as POS entries, credited to the correct income or unearned revenue account automatically via webhook.</div>
        </div>
      </div>
    </div>

    <div class="hub-card" id="hub-hr" style="border-top-color:#6D28D9">
      <div class="hub-card-head" style="color:#6D28D9">
        <span class="hub-icon">&#128101;</span>
        <div>
          <div class="hub-title">HR Platform (Staff Portal)</div>
          <div class="hub-url">staff.sapphireclinicseast.org</div>
        </div>
      </div>
      <div class="hub-flows">

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Staff Directory &mdash; Core Identity &amp; Employment Fields</strong> — All staff profiles are mastered in the HR Platform and synced one-way into Operations Hub via a secured API (<code>POST /api/staff/sync</code>). Every sync overwrites the following fields: <em>Employee ID, First Name, Last Name, Email, Phone, Date of Birth, Job Title, Employment Type (employee / consultant), Department, Branch, HR Platform ID, and Active status.</em> None of these can be edited from inside the Operations Hub — all writes are blocked. The only locally editable field is <strong>Sex</strong> (M/F), because the HR Platform does not track it; that local value is preserved across future syncs.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Government IDs &amp; Banking Details (Sensitive)</strong> — TIN, SSS Number, Pag-IBIG Number, PhilHealth Number, Bank Name, and Bank Account Number are also synced from the HR Platform and stored in the Operations Hub database. They are visible only to the <strong>Clinic Manager (ADMIN)</strong> and <strong>HR Officer (branch admin)</strong> roles inside the Staff profile modal, under the "Government IDs" and "Banking" sections. Front Desk and Marketing Admin accounts cannot see these fields at all. All corrections must be made in the HR Platform; the next sync will carry them over.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Registration Form Responses</strong> — The HR Platform hosts four Typeform-style intake forms: <em>Registration Form (East &amp; Greenhills branches), Group Therapy Registration (East), ALAGA Program Registration (East), and Psych Registration Form (East).</em> Operations Hub fetches new responses from all four forms in two places simultaneously: the notification bell (checking the last 48 hours on every load) and the Registration Forms module (full submissions list with PDF download). Operations Hub only reads — all form submissions are stored and owned by the HR Platform.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Waitlist (Patient Relationship)</strong> — The Waitlist tab in the Patient Relationship module reads from the exact same HR Platform form endpoints as the Registration Forms module. This means a single patient registration submitted in the HR Platform simultaneously appears in the Registration Forms module <em>and</em> populates the Waitlist. There is no separate waitlist data entry — the form response is the waitlist entry.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Patient Complaints</strong> — When any user opens an individual patient profile in the Operations Hub, the system fetches that patient's complaint history directly from the HR Platform in real time. Data pulled includes: date filed, complaint description, status, reference number, concern type (clinical, administrative, etc.), branch, and escalation level. The HR Platform is where complaints are logged and managed; Operations Hub only reads and displays them.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Staff Phone Numbers &rarr; Clinic Schedule SMS</strong> — The phone numbers synced from the HR Platform are what the Clinic Schedule module uses when you tap "Send SMS" on a clinician card. Operations Hub does not store a separate phone number for SMS — it uses the one that came from the HR sync. If a clinician's phone number is wrong in the SMS, the fix must be made in the HR Platform, not here. The correction will carry over on the next sync.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div>
            <strong>Extra Branch Assignments (Locally Managed)</strong> — One staff field is managed entirely within Operations Hub and is <em>never</em> overwritten by the HR sync: <strong>extraBranches</strong>. This array holds additional branch codes for clinicians who work at more than one branch. It is set by administrators here. Clinicians with an extra branch appear with a purple <strong>"Both Branches"</strong> badge in the Clinic Schedule and are shown in both branches' department views.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div>
            <strong>Peer Evaluation Assignments &amp; Results</strong> — Peer evaluation pairs (HR08 admin-to-peer and HR09 clinical peer-to-peer) are created, assigned, and tracked here in Operations Hub. Evaluators complete forms via a QR code link that requires no login to either platform. Results &mdash; scores, composite ratings (0&ndash;100), monthly trends, and free-text feedback &mdash; are stored in the Operations Hub database and exposed back to external systems via a secured API (<code>GET /api/peer-eval/external</code>) that can be consumed by HR analytics tools.
          </div>
        </div>

        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div>
            <strong>Marketing Event Registrants &rarr; HR Hiring Pool</strong> — When visitors register during clinic marketing events or online games, their contact information is sent directly from Operations Hub to the HR Platform's hiring pipeline. Fields sent: first name, last name, email, phone, profession, birth date, years of practice, and event source tag. This automatically adds them to the HR Platform's talent pool for future hiring consideration &mdash; no copy-paste between systems needed.
          </div>
        </div>

      </div>
    </div>

    <div class="hub-card" id="hub-client" style="border-top-color:#1A7B8A">
      <div class="hub-card-head" style="color:#1A7B8A">
        <span class="hub-icon">&#128241;</span>
        <div>
          <div class="hub-title">Client Portal</div>
          <div class="hub-url">client.sapphireclinicseast.org</div>
        </div>
      </div>
      <div class="hub-flows">
        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div><strong>Online Booking Requests</strong> — When a patient or caregiver submits a booking on the Client Portal, it is written directly into the Operations Hub database as a <em>PatientBooking</em> record (status: Pending). The notification bell fires immediately so front desk can act on it and add the patient to the Decking roster.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div><strong>Patient Profile &amp; Session History</strong> — Signed-in patients on the Client Portal can view their own profile, upcoming session schedule, and past session history. All of this is read directly from the Operations Hub database in real time.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow in">IN</span>
          <div><strong>Downpayment via PayMongo</strong> — When a booking is approved, the Operations Hub creates a PayMongo payment link and sends it to the patient. The patient pays on the Client Portal; a PayMongo webhook updates the booking status to Paid automatically in the Operations Hub database.</div>
        </div>
        <div class="flow-row">
          <span class="flow-arrow out">OUT</span>
          <div><strong>Feedback &amp; Survey</strong> — After confirmed sessions, QR codes generated by the Operations Hub direct patients to the Client Portal to submit satisfaction ratings. Responses feed back into the Customer Survey module and leaderboard.</div>
        </div>
      </div>
    </div>

  </div>

  <div class="callout" style="margin-top:20px">
    <strong>Flow direction key:</strong> &nbsp;<span style="background:#DCFCE7;color:#166534;font-size:0.65rem;font-weight:800;padding:1px 6px;border-radius:3px">OUT</span>&nbsp; means Operations Hub <em>sends</em> data to that hub. &nbsp;<span style="background:#EDE9FE;color:#4C1D95;font-size:0.65rem;font-weight:800;padding:1px 6px;border-radius:3px">IN</span>&nbsp; means Operations Hub <em>receives</em> data from that hub. Most flows are fully automatic &mdash; no manual export is required.
  </div>
</div>

<div class="divider"></div>
<div id="access-matrix" class="plain-section">
  <div class="eyebrow">Quick Reference</div>
  <h2>Full Access Matrix</h2>
  <p style="margin-bottom:16px">&#10003; = Full access &nbsp;&middot;&nbsp; &#9681; = Limited &nbsp;&middot;&nbsp; &mdash; = Not available</p>
  <div class="matrix-wrap">
    <table class="matrix">
      <thead><tr><th style="min-width:180px">Module</th><th style="color:#4CC9D9">Clinic Manager</th><th style="color:#A78BFA">HR Officer</th><th style="color:#34D399">Front Desk</th><th style="color:#FB923C">Marketing Admin</th></tr></thead>
      <tbody>
        <tr><td>Home Dashboard</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Social Media (Post / Schedule / Publish)</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Post Templates (Birthday / Holiday)</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Patient CRM</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Patient Profile</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Patient Dashboard (Analytics)</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Email Campaigns</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>SMS Campaigns</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Staff Module</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Staff &mdash; Full HR Profile Detail</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="no">&mdash;</td></tr>
        <tr><td>Queueing &mdash; Issue Tokens</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Queueing &mdash; Manage Display Ads</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Clinic Schedule</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td></tr>
        <tr><td>Clinic Utilization</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Customer Survey &mdash; Submit</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Customer Survey &mdash; Full Dashboard</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="lim">&#9681; Limited</td><td class="yes">&#10003;</td></tr>
        <tr><td>Registration Forms</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Decking Module</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td></tr>
        <tr><td>Patient Relationship (Waitlist / Follow-up)</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td></tr>
        <tr><td>Patient Relationship (No-show / Cancellation)</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td></tr>
        <tr><td>Peer Evaluation &mdash; Complete Forms</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Peer Evaluation &mdash; Manage Assignments</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Settings &mdash; Connected Accounts</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
        <tr><td>Settings &mdash; Team Management</td><td class="only-a">Admin only</td><td class="no">&mdash;</td><td class="no">&mdash;</td><td class="no">&mdash;</td></tr>
        <tr><td>Settings &mdash; Brand Guide</td><td class="yes">&#10003;</td><td class="yes">&#10003;</td><td class="no">&mdash;</td><td class="yes">&#10003;</td></tr>
      </tbody>
    </table>
  </div>
</div>

<p style="font-size:0.72rem;color:var(--text3);text-align:center;margin-top:24px">Sapphire Clinics East Inc. &nbsp;&middot;&nbsp; Operations Hub Internal Handbook &nbsp;&middot;&nbsp; 2026 &nbsp;&middot;&nbsp; Internal Use Only</p>

</div></div></div>
<script>
(function(){
  var links=document.querySelectorAll('.sb-link[href^="#"]'),sections=[];
  links.forEach(function(l){var id=l.getAttribute('href').slice(1),el=document.getElementById(id);if(el)sections.push({el:el,link:l})});
  var obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){links.forEach(function(l){l.classList.remove('active')});var m=sections.find(function(s){return s.el===e.target});if(m)m.link.classList.add('active')}})},{rootMargin:'-20% 0px -70% 0px',threshold:0});
  sections.forEach(function(s){obs.observe(s.el)});
})();
</script>
</body>
</html>`

export default function HandbookPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (session.user as { role?: string })?.role !== 'ADMIN') {
      router.replace('/dashboard')
      return
    }
    setReady(true)
  }, [session, status, router])

  function handlePrint() {
    iframeRef.current?.contentWindow?.print()
  }

  function handleWordDownload() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="UTF-8"><title>Operations Hub Handbook</title>
<style>body{font-family:Calibri,sans-serif;font-size:11pt;color:#1C2535}.sidebar{display:none!important}.mockup{display:none!important}</style>
</head><body>${doc.body.innerHTML}</body></html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Operations-Hub-Handbook.doc'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!ready) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: 2 }}>
            Internal Documentation &middot; 2026
          </p>
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--near-black)', lineHeight: 1.25 }}>
            Operations Hub — User Handbook
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--light-gray)', background: '#fff', color: 'var(--charcoal)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            🖨 Print / PDF
          </button>
          <button
            onClick={handleWordDownload}
            style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ⬇ Download Word
          </button>
        </div>
      </div>

      <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(237,104,35,0.2)', minHeight: 0 }}>
        <iframe
          ref={iframeRef}
          srcDoc={HANDBOOK_HTML}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Operations Hub User Handbook"
        />
      </div>
    </div>
  )
}
