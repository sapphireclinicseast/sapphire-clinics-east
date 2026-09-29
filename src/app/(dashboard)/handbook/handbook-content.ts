// The handbook document itself, kept apart from the page that frames it.
//
// One column, no sidebar. The page is already inside the Hub's own left rail,
// and the old build carried a second dark rail of its own — two nav columns
// side by side, which read as a layout fault rather than as navigation. Moving
// around now happens through the sticky bar at the top: a search box and a
// Contents panel that drops over the page instead of sitting beside it.
//
// Written for somebody on their first day. Every module says where it is, what
// each control does, and what to do in order — not just what the module is for.
//
// NOTE: this is a template literal. No backticks and no dollar-brace in the
// content, or the build breaks.

export const HANDBOOK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Operations Hub — User Handbook</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#F2F5F9;--surface:#FFFFFF;--border:#DDE4EF;--text:#1C2535;--text2:#4E5C74;--text3:#8A96A8;
  --ink:#141B2D;--teal:#1A7B8A;--teal-l:#E5F4F6;--orange:#ED6823;--orange-l:#FEF0E8;
  --admin:#1A7B8A;--hr:#6D28D9;--desk:#047857;--mktg:#ED6823;
  --warn-bg:#FEF6E7;--warn-br:#F3D9A4;--warn-tx:#7A4E08;
  --radius:10px;
}
html{scroll-behavior:smooth;font-size:15px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.62}
.wrap{max-width:900px;margin:0 auto;padding:0 28px 120px}

/* ── Sticky bar: the only navigation furniture ─────────────────────────── */
.topbar{position:sticky;top:0;z-index:60;background:rgba(242,245,249,0.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.topbar-in{max-width:900px;margin:0 auto;padding:10px 28px;display:flex;align-items:center;gap:10px}
.tb-title{font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:var(--teal);white-space:nowrap}
.tb-spacer{flex:1}
.tb-search{position:relative;flex:1;max-width:330px}
.tb-search input{width:100%;padding:7px 30px 7px 30px;border:1.5px solid var(--border);border-radius:8px;font-size:0.8rem;background:#fff;color:var(--text);outline:none;font-family:inherit}
.tb-search input:focus{border-color:var(--teal)}
.tb-search .mag{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:0.82rem;pointer-events:none}
.tb-search .clr{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;color:var(--text3);cursor:pointer;font-size:0.95rem;line-height:1;padding:2px 4px;display:none}
.tb-btn{padding:7px 13px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text);font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;font-family:inherit}
.tb-btn:hover{border-color:var(--teal);color:var(--teal)}
.tb-btn.on{background:var(--teal);border-color:var(--teal);color:#fff}

/* Contents drops OVER the page, full width — never a second column */
.toc{display:none;border-top:1px solid var(--border);background:#fff;box-shadow:0 12px 28px rgba(20,27,45,0.1)}
.toc.open{display:block}
.toc-in{max-width:900px;margin:0 auto;padding:18px 28px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px 24px}
.toc-col h4{font-size:0.6rem;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:var(--text3);margin-bottom:7px}
.toc-col a{display:block;font-size:0.79rem;color:var(--text2);text-decoration:none;padding:3px 0;border-radius:4px}
.toc-col a:hover{color:var(--teal)}

/* ── Search results ───────────────────────────────────────────────────── */
.results{display:none;background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;margin:18px 0 0}
.results.show{display:block}
.results h3{font-size:0.82rem;font-weight:800;margin-bottom:9px;color:var(--text)}
.res{display:block;padding:9px 11px;border-radius:8px;text-decoration:none;border:1px solid var(--border);margin-bottom:6px;background:var(--bg)}
.res:hover{border-color:var(--teal)}
.res .rt{font-size:0.79rem;font-weight:700;color:var(--teal);margin-bottom:2px}
.res .rs{font-size:0.75rem;color:var(--text2);line-height:1.5}
.res mark,mark.hit{background:#FDE68A;color:#5B3A00;border-radius:2px;padding:0 1px}
.no-res{font-size:0.8rem;color:var(--text2);padding:6px 2px}

/* ── Cover ────────────────────────────────────────────────────────────── */
.cover{background:var(--ink);border-radius:var(--radius);padding:34px 34px 30px;margin:24px 0 30px;position:relative;overflow:hidden}
.cover::before{content:'';position:absolute;right:-60px;top:-60px;width:240px;height:240px;background:radial-gradient(circle,rgba(26,123,138,0.28) 0%,transparent 70%)}
.cover-eye{font-size:0.62rem;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:var(--teal);margin-bottom:9px}
.cover h1{font-size:1.72rem;font-weight:800;color:#fff;line-height:1.22;margin-bottom:9px}
.cover p{font-size:0.87rem;color:rgba(255,255,255,0.6);max-width:520px}

/* Connected-systems map. Inline SVG rather than an image so it stays sharp,
   scales with the column, and prints. */
.diagram{border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);padding:14px 14px 8px;margin:12px 0 16px}
.diagram svg{width:100%;height:auto;display:block}
.diagram .node rect{fill:#fff;stroke:#CBD9D6;stroke-width:1.5}
.diagram .hub rect{fill:#1E4D4A;stroke:#1E4D4A}
.diagram .nt{font:700 17px -apple-system,Segoe UI,system-ui,sans-serif;fill:var(--text);text-anchor:middle}
.diagram .ns{font:400 13px -apple-system,Segoe UI,system-ui,sans-serif;fill:var(--text3);text-anchor:middle}
.diagram .ht{font:800 19px -apple-system,Segoe UI,system-ui,sans-serif;fill:#fff;text-anchor:middle;letter-spacing:0.04em}
.diagram .hs{font:400 12px -apple-system,Segoe UI,system-ui,sans-serif;fill:rgba(255,255,255,0.6);text-anchor:middle}
.diagram .edge{stroke:#8FA8A5;stroke-width:2;fill:none}
.diagram .edge.one{stroke-dasharray:none}
/* Halo so a label crossing its own arrow stays readable */
.diagram .el{font:500 11.5px -apple-system,Segoe UI,system-ui,sans-serif;fill:var(--text2);paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.diagram .legend{text-align:center;font-size:0.74rem;color:var(--text3);margin:2px 0 4px}
.diagram .sw{display:inline-block;width:20px;height:0;border-top:2px solid #8FA8A5;vertical-align:middle;margin-right:3px}
.diagram .sw.one{border-top-style:solid;opacity:0.55}

/* Static contents page — plain links, no script, survives Print and Word */
.toc-static h4{margin:0 0 6px}
.toc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:15px 22px;margin-top:10px}
.toc-block h4{font-size:0.7rem;font-weight:800;letter-spacing:0.09em;text-transform:uppercase;color:var(--orange);margin:0 0 6px}
.toc-block a{display:block;font-size:0.79rem;color:var(--text2);text-decoration:none;padding:2px 0;border-bottom:1px dotted transparent}
.toc-block a:hover{color:var(--teal);border-bottom-color:var(--teal)}
@media print{.toc-grid{grid-template-columns:repeat(2,1fr)}}

/* ── Chapters & sections ──────────────────────────────────────────────── */
.chapter{margin:40px 0 14px;padding-bottom:7px;border-bottom:2px solid var(--border)}
.chapter .num{font-size:0.6rem;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:var(--orange)}
.chapter h2{font-size:1.22rem;font-weight:800;color:var(--text);margin-top:2px}
.chapter p{font-size:0.83rem;color:var(--text2);margin-top:4px}

.sec{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px;margin-bottom:16px}
.sec > h3{font-size:1rem;font-weight:800;color:var(--text);margin-bottom:3px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.path{font-size:0.68rem;font-weight:600;color:var(--text3);font-family:'SF Mono',Consolas,monospace;background:var(--bg);border:1px solid var(--border);padding:1px 6px;border-radius:4px}
.lede{font-size:0.83rem;color:var(--text2);margin:6px 0 13px}
.sec h4{font-size:0.78rem;font-weight:800;color:var(--text);margin:16px 0 7px;letter-spacing:0.01em}
.sec p{font-size:0.82rem;color:var(--text2);margin-bottom:9px}
.sec ul{margin:0 0 9px 18px}
.sec ul li{font-size:0.82rem;color:var(--text2);margin-bottom:4px}
ol.steps{margin:0 0 10px;padding:0;list-style:none;counter-reset:s}
ol.steps li{counter-increment:s;position:relative;padding:0 0 9px 30px;font-size:0.82rem;color:var(--text2)}
ol.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:var(--teal-l);color:var(--teal);font-size:0.68rem;font-weight:800;display:flex;align-items:center;justify-content:center}
ol.steps li b,.sec p b,.sec ul li b{color:var(--text);font-weight:700}

/* Button reference table */
.btns{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:0.79rem}
.btns th{background:var(--ink);color:rgba(255,255,255,0.72);padding:7px 11px;text-align:left;font-size:0.64rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase}
.btns th:first-child{border-radius:7px 0 0 0;width:32%}.btns th:last-child{border-radius:0 7px 0 0}
.btns td{padding:7px 11px;border-bottom:1px solid var(--border);color:var(--text2);vertical-align:top}
.btns tr:last-child td{border-bottom:none}
.btns td:first-child{color:var(--text);font-weight:700;white-space:nowrap}
.k{display:inline-block;font-family:'SF Mono',Consolas,monospace;font-size:0.72rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:0 5px;color:var(--text)}

.tip{display:flex;gap:9px;padding:9px 12px;border-radius:8px;font-size:0.79rem;margin:10px 0;background:var(--bg);border-left:3px solid var(--teal);color:var(--text2)}
.tip.warn{background:var(--warn-bg);border-left-color:var(--orange);color:var(--warn-tx)}
.tip b{font-weight:800;white-space:nowrap}

.pill{display:inline-flex;font-size:0.62rem;font-weight:800;letter-spacing:0.06em;padding:2px 8px;border-radius:20px;text-transform:uppercase}
.pill.admin{background:var(--teal-l);color:var(--admin)}.pill.hr{background:#EDE9FE;color:var(--hr)}
.pill.desk{background:#D1FAE5;color:var(--desk)}.pill.mktg{background:var(--orange-l);color:var(--mktg)}
.pill.all{background:#E8EDF5;color:#44506A}.pill.inv{background:#FEF3C7;color:#92400E}
.who{display:flex;gap:5px;flex-wrap:wrap;margin:2px 0 11px}

.rolegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px;margin:12px 0}
.rolecard{border:1px solid var(--border);border-radius:9px;padding:13px 15px;background:var(--bg)}
.rolecard.admin{border-top:3px solid var(--admin)}.rolecard.hr{border-top:3px solid var(--hr)}
.rolecard.desk{border-top:3px solid var(--desk)}.rolecard.mktg{border-top:3px solid var(--mktg)}.rolecard.inv{border-top:3px solid #B45309}
.rolecard h5{font-size:0.85rem;font-weight:800;color:var(--text);margin-bottom:2px}
.rolecard .code{font-size:0.64rem;font-family:'SF Mono',Consolas,monospace;color:var(--text3);margin-bottom:6px}
.rolecard p{font-size:0.77rem;color:var(--text2);margin:0}

/* FAQ */
.faq{border:1px solid var(--border);border-radius:9px;margin-bottom:7px;background:var(--bg);overflow:hidden}
.faq summary{cursor:pointer;padding:11px 14px;font-size:0.83rem;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;gap:10px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';color:var(--teal);font-weight:800;flex-shrink:0}
.faq[open] summary::after{content:'–'}
.faq[open] summary{background:#fff;border-bottom:1px solid var(--border)}
.faq .a{padding:11px 14px;background:#fff;font-size:0.81rem;color:var(--text2)}
.faq .a p{margin-bottom:7px}.faq .a p:last-child{margin-bottom:0}

table.matrix{width:100%;border-collapse:collapse;font-size:0.75rem;margin-top:6px}
table.matrix th{background:var(--ink);color:rgba(255,255,255,0.72);padding:7px 9px;text-align:left;font-size:0.62rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase}
table.matrix td{padding:6px 9px;border-bottom:1px solid var(--border)}
table.matrix td:first-child{font-weight:700;color:var(--text)}
.yes{color:var(--desk);font-weight:800}.no{color:#C2410C;font-weight:800}.part{color:var(--text3);font-weight:700}
.matrix-wrap{overflow-x:auto}
:target > h3, :target.sec{scroll-margin-top:74px}
.sec{scroll-margin-top:74px}
.chapter{scroll-margin-top:74px}
@media print{.topbar,.toc,.results{display:none!important}.sec{break-inside:avoid}}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-in">
    <span class="tb-title">Handbook</span>
    <div class="tb-spacer"></div>
    <div class="tb-search">
      <span class="mag">&#128269;</span>
      <input id="q" type="search" placeholder="Search the handbook…" autocomplete="off">
      <button class="clr" id="qclr" title="Clear">&times;</button>
    </div>
    <button class="tb-btn" id="toctog">Contents</button>
  </div>
  <div class="toc" id="toc"><div class="toc-in" id="tocin"></div></div>
</div>

<div class="wrap">
<div class="results" id="results"></div>

<div class="cover">
  <div class="cover-eye">Internal Documentation &middot; 2026</div>
  <h1>Operations Hub<br>User Handbook</h1>
  <p>A step-by-step guide to every module, written for someone opening the Hub
     for the first time. Each section says where to find the module, what every
     button does, and the order to do things in.</p>
</div>

<!-- A REAL contents page, written out rather than generated.
     The Contents button builds its list with script; that list is not in the
     document, so it was missing from the printed copy and from anyone whose
     browser did not run the script — and a handbook with no contents page is
     not a handbook. This one is plain links and always there. -->
<div class="sec toc-static" id="contents">
  <h3>Table of contents</h3>
  <p class="lede">Six chapters, 33 sections. Click any line to jump; the Contents button at the top does the same thing without scrolling back here.</p>

  <div class="toc-grid">
    <div class="toc-block">
      <h4>1 &middot; Start here</h4>
      <a href="#about">How to use this handbook</a>
      <a href="#roles">Your role decides what you see</a>
      <a href="#layout">The screen, explained</a>
      <a href="#controls">Controls you will meet everywhere</a>
      <a href="#first-day">Your first fifteen minutes</a>
    </div>
    <div class="toc-block">
      <h4>2 &middot; Home and patient records</h4>
      <a href="#dashboard">Home Dashboard</a>
      <a href="#patient-crm">Patient CRM</a>
      <a href="#patient-profile">Patient Profile</a>
      <a href="#patient-dashboard">Patient Dashboard</a>
      <a href="#self-register">Patient self-registration</a>
    </div>
    <div class="toc-block">
      <h4>3 &middot; Clinic Tools</h4>
      <a href="#staff">Staff Module</a>
      <a href="#queueing">Queueing</a>
      <a href="#clinic-schedule">Clinic Schedule</a>
      <a href="#utilization">Clinic Utilization</a>
      <a href="#survey">Customer Survey</a>
      <a href="#reg-forms">Registration Forms</a>
      <a href="#decking">Decking Module</a>
      <a href="#loa">LOA Submission</a>
      <a href="#patient-rel">Patient Relationship</a>
      <a href="#peer-eval">Peer Evaluation</a>
      <a href="#partners">Partner Institutions</a>
    </div>
    <div class="toc-block">
      <h4>4 &middot; Social and marketing</h4>
      <a href="#social">Social Media Suite</a>
      <a href="#templates">Post Templates</a>
      <a href="#email">Email Campaigns</a>
      <a href="#sms">SMS Campaigns</a>
    </div>
    <div class="toc-block">
      <h4>5 &middot; Settings and reference</h4>
      <a href="#investor">Investor View</a>
      <a href="#accounts">Connected Accounts</a>
      <a href="#team">Team</a>
      <a href="#brand">Brand Guide</a>
      <a href="#hubs">How the Hub connects to the other systems</a>
      <a href="#matrix">Who can see what</a>
    </div>
    <div class="toc-block">
      <h4>6 &middot; Help</h4>
      <a href="#search">Word search</a>
      <a href="#faq">Frequently asked questions</a>
    </div>
  </div>
</div>

<!-- ══════════════ 1. START HERE ══════════════ -->
<div class="chapter" id="ch-start">
  <div class="num">Chapter 1</div>
  <h2>Start here</h2>
  <p>Read this chapter once. Everything after it assumes you know what is in it.</p>
</div>

<div class="sec" id="about">
  <h3>How to use this handbook</h3>
  <p class="lede">Three ways to find what you need.</p>
  <ul>
    <li><b>Contents</b> — the button at the top right. It drops a full list of chapters over the page. Click any entry to jump.</li>
    <li><b>Search</b> — the box at the top. Type a word and matching sections appear with the phrase highlighted. This is the fastest route when you know what the thing is called but not where it lives.</li>
    <li><b>Read straight through</b> — the chapters run in the same order as the menu down the left of the Hub.</li>
  </ul>
  <div class="tip"><b>Print it:</b> the <span class="k">Print / PDF</span> and <span class="k">Download Word</span> buttons sit above this page, outside the handbook itself. The Word copy is handy for onboarding packs.</div>
</div>

<div class="sec" id="roles">
  <h3>Your role decides what you see</h3>
  <p class="lede">Every account has exactly one role — five of them. If a module named in this handbook is missing from your menu, your role does not have it; that is not a fault.</p>
  <div class="rolegrid">
    <div class="rolecard admin"><h5>Clinic Manager</h5><div class="code">ADMIN</div>
      <p>Everything, both branches, plus Team (user accounts). If you can read this handbook and also see <b>Team</b> in the menu, you are this.</p></div>
    <div class="rolecard hr"><h5>HR Officer</h5><div class="code">AHEA_ADMIN &middot; AHGH_ADMIN</div>
      <p>The same as Clinic Manager except managing user accounts. Tied to one branch in the scheduling tools.</p></div>
    <div class="rolecard desk"><h5>Front Desk</h5><div class="code">AHEA_FRONT_DESK &middot; AHGH_FRONT_DESK</div>
      <p>Clinic Tools only — no social media, email or analytics. Locked to one branch: an East account cannot see Greenhills data.</p></div>
    <div class="rolecard mktg"><h5>Marketing Admin</h5><div class="code">MARKETING_ADMIN</div>
      <p>The full marketing suite plus patient analytics and staff tools. No Clinic Schedule, Decking or Patient Relationship.</p></div>
    <div class="rolecard inv"><h5>Investor</h5><div class="code">INVESTOR</div>
      <p>Two pages, read-only: Patient Dashboard and Customer Satisfaction Survey. No patient names, and therapist names shown as initials. See <a href="#investor" style="color:inherit;text-decoration:underline">Investor View</a>.</p></div>
  </div>
  <div class="tip warn"><b>Branch lock:</b> Front Desk accounts only ever see their own branch. Where this handbook says "switch branch", that applies to Clinic Manager and HR Officer accounts.</div>
</div>

<div class="sec" id="layout">
  <h3>The screen, explained</h3>
  <p class="lede">Every page shares the same frame. Learn it once.</p>
  <h4>The left menu</h4>
  <p>Grouped by job: <b>Home</b>, <b>Social &amp; Marketing</b>, <b>Patients</b>, <b>Clinic Tools</b>, <b>Settings</b>. A group with a chevron expands when you click it. Your current page is highlighted.</p>
  <h4>The brand switcher</h4>
  <p>Top-left, above the menu. Sapphire Clinics East is the default. Switching brand changes which social accounts and templates you are working with — it does not change clinic data.</p>
  <h4>Branch tabs</h4>
  <p>Inside a module, branch appears as two tabs near the top — <b>East Branch</b> and <b>Greenhills Branch</b>. The active tab is filled dark. Nearly every number on the page obeys this tab, so check it before reading any figure.</p>
  <h4>Saving</h4>
  <p>There is no global Save. Each panel saves its own changes with its own button, and a short message appears at the bottom of the screen to confirm. If no message appears, the change did not save.</p>
</div>

<div class="sec" id="controls">
  <h3>Controls you will meet everywhere</h3>
  <p class="lede">These behave the same in every module, so they are explained once here rather than repeated.</p>
  <table class="btns">
    <thead><tr><th>Control</th><th>What it does</th></tr></thead>
    <tbody>
      <tr><td>Branch tabs</td><td>Two buttons at the top of a module. Filters the whole page to one clinic. Front Desk accounts see only their own.</td></tr>
      <tr><td>Filter row</td><td>A row of dropdowns above a table — typically Department, Status, Date range. They combine: setting two narrows to rows matching both.</td></tr>
      <tr><td>Tick-list dropdown</td><td>A dropdown with checkboxes rather than one choice. Tick several values to see all of them. Click outside to close. Used for filters where more than one answer is normal.</td></tr>
      <tr><td>Filter by name</td><td>A free-text box. Type part of a name; the list narrows as you type. Clear it to see everything again.</td></tr>
      <tr><td>From / To dates</td><td>Two date pickers. Both are inclusive. Leaving a long range set is the usual cause of "this is slow".</td></tr>
      <tr><td>Column headers</td><td>Click to sort. Click again to reverse.</td></tr>
      <tr><td><span class="k">+</span> / <b>Add</b></td><td>Opens a form for a new record. Teal buttons create or confirm.</td></tr>
      <tr><td>Pencil icon</td><td>Edit in place. Opens the row as a form.</td></tr>
      <tr><td>Bin icon</td><td>Delete. Always asks first. Red means it cannot be undone.</td></tr>
      <tr><td>Envelope icon</td><td>Send an email to that one person.</td></tr>
      <tr><td>Speech-bubble icon</td><td>Send a text message to that one person.</td></tr>
      <tr><td>Greyed-out button</td><td>Not available. Hover it — the tooltip says why (no mobile number on file, no permission, nothing selected).</td></tr>
    </tbody>
  </table>
  <div class="tip"><b>Rule of thumb:</b> teal buttons make something happen, white buttons change what you are looking at, red buttons destroy something.</div>
</div>

<div class="sec" id="first-day">
  <h3>Your first fifteen minutes</h3>
  <p class="lede">If you have never opened the Hub before, do these in order.</p>
  <ol class="steps">
    <li>Sign in with the email address your manager registered. If it is refused, your account may not exist yet — a Clinic Manager creates it under <b>Settings &rarr; Team</b>.</li>
    <li>Look at the left menu and compare it with the five roles above. That tells you which account type you have.</li>
    <li>Open <b>Home Dashboard</b>. Nothing here changes any data — it is safe to click around.</li>
    <li>Open <b>Clinic Schedule</b> and switch between the four view tabs without editing anything, to see the same day four ways.</li>
    <li>Open <b>Decking Module</b> and click each chip in the two cards at the top. Again, looking changes nothing.</li>
    <li>Come back here and read the chapter for whichever module you were hired to use.</li>
  </ol>
  <div class="tip warn"><b>Before you edit anything real:</b> the two actions that reach patients are sending reminders in Clinic Schedule and sending campaigns in Email/SMS. Everything else stays inside the Hub. Take extra care with those two.</div>
</div>
<!-- ══════════════ 2. HOME & PATIENTS ══════════════ -->
<div class="chapter" id="ch-patients">
  <div class="num">Chapter 2</div>
  <h2>Home and patient records</h2>
  <p>Where a patient exists in the system, and everything that reads from that record.</p>
</div>

<div class="sec" id="dashboard">
  <h3>Home Dashboard <span class="path">/dashboard</span></h3>
  <div class="who"><span class="pill all">All roles</span></div>
  <p class="lede">The landing page. A summary of today across the clinic — nothing here is edited, only read.</p>
  <h4>What to do with it</h4>
  <ol class="steps">
    <li>Check the branch tab first. Every figure below it belongs to that branch.</li>
    <li>Read the cards across the top: today's sessions, patients in the queue, open slots.</li>
    <li>Click any card to jump straight to the module it came from, already filtered to today.</li>
  </ol>
  <div class="tip"><b>If a number looks wrong:</b> it is almost always the branch tab or a date range left over from your last visit. Check those two before reporting a fault.</div>
</div>

<div class="sec" id="patient-crm">
  <h3>Patient CRM <span class="path">/patients</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">The master list of every patient. If somebody is not here, they do not exist anywhere else in the Hub — no schedule, no queue entry, no survey.</p>
  <h4>Finding one person</h4>
  <ol class="steps">
    <li>Type any part of the name into the search box. It matches first and last name.</li>
    <li>Narrow further with the dropdowns: <b>All Branches</b>, <b>All Types</b> (Pediatric / Adult), and the indicator filters.</li>
    <li>Click the row to open the full record.</li>
  </ol>
  <h4>Reading the indicators</h4>
  <p>Small marks on a row tell you something about the patient without opening them:</p>
  <table class="btns">
    <thead><tr><th>Mark</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>Star</td><td>Filipino-Chinese, identified from the surname. Used for greetings and campaign targeting.</td></tr>
      <tr><td>ID on file</td><td>A PWD or Senior ID photo has been uploaded — the discount can be applied.</td></tr>
      <tr><td>Referral on file</td><td>A doctor referral document has been uploaded.</td></tr>
      <tr><td>Existing in DB</td><td>The person already had a record when they submitted a form, rather than being newly created.</td></tr>
      <tr><td>Email Newsletter</td><td>They have consented to marketing email. Campaigns only go to these.</td></tr>
    </tbody>
  </table>
  <h4>Getting patients in</h4>
  <p>Three routes, in order of how common they are:</p>
  <ul>
    <li><b>They register themselves</b> — the public form at <span class="k">/patient-register</span>. Use <b>Patient Registration QR</b> to print a code for the counter; a parent scans it and types their own details, which removes transcription errors.</li>
    <li><b>A registration form</b> — submissions arrive under Registration Forms and can be converted into a patient.</li>
    <li><b>Front desk adds them</b> — during walk-in booking in Queueing.</li>
  </ul>
  <div class="tip"><b>Duplicates:</b> always search before creating. Two records for one child split their history in half and neither one looks wrong on its own.</div>
</div>

<div class="sec" id="patient-profile">
  <h3>Patient Profile <span class="path">/patients/profile</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">One patient, everything about them, on a single page.</p>
  <h4>What is on it</h4>
  <ul>
    <li><b>Details</b> — name, birthday, sex, contact numbers, address, branch.</li>
    <li><b>Documents</b> — the doctor referral and PWD/Senior ID, either uploaded as a file or photographed at the counter.</li>
    <li><b>Session history</b> — every appointment, with status.</li>
    <li><b>Discount flags</b> — what they are entitled to and the proof held on file.</li>
  </ul>
  <h4>Editing</h4>
  <ol class="steps">
    <li>Click the pencil beside the field group you want to change.</li>
    <li>Change the fields and press <b>Save</b>.</li>
    <li>Wait for the confirmation message before leaving the page.</li>
  </ol>
  <div class="tip warn"><b>Birthdays matter:</b> the date of birth drives automatic birthday greetings and decides Pediatric versus Adult. A wrong birthday sends a greeting on the wrong day to a real family.</div>
</div>

<div class="sec" id="patient-dashboard">
  <h3>Patient Dashboard <span class="path">/patients/dashboard</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Patient numbers as charts — who they are and where they come from. Reading only.</p>
  <ul>
    <li><b>Age and sex</b> — stacked bars, split Female / Male / Other.</li>
    <li><b>Growth</b> — new patients over time.</li>
    <li><b>Source</b> — how they found the clinic.</li>
  </ul>
  <p>Set the branch tab and date range at the top; every chart follows them. Hover any bar or point to read the exact figure rather than estimating from the axis.</p>
</div>

<div class="sec" id="self-register">
  <h3>Patient self-registration <span class="path">/patient-register</span></h3>
  <div class="who"><span class="pill all">Public page — no sign-in</span></div>
  <p class="lede">The form a family fills in themselves, on their own phone or on a tablet at the counter. Reachable by QR code from Patient CRM.</p>
  <h4>What the family fills in</h4>
  <ol class="steps">
    <li>Patient and guardian details, contact number, address.</li>
    <li><b>Branch</b> — they tick which clinic (Aura Health East, Aura Health Greenhills, or Verdana Rehab Store).</li>
    <li><b>Partner school tickbox</b> — if they tick "I am from one of Sapphire's partner schools or institutions", a dropdown of partner schools appears. The list is maintained in Registration Forms &rarr; Settings, so adding a school there makes it appear here.</li>
    <li><b>Doctor's Referral</b> — they start typing the referring doctor's name and matching names appear. The list comes live from Accounting Hub, so a doctor added there is findable immediately. If their doctor is not listed they simply type the name.</li>
    <li><b>Documents</b> — either <b>Choose file</b> to upload, or <b>Take a photo</b> to use the device camera for the referral and the PWD/Senior ID.</li>
  </ol>
  <div class="tip"><b>At the counter:</b> Take a photo is usually faster and cleaner than a family emailing a scan later. The photo is attached to the record immediately.</div>
  <div class="tip warn"><b>Three characters minimum:</b> doctor suggestions only appear after three letters of the actual name. Typing "dr. a" shows nothing; "dr. aid" shows the match. This is deliberate — it stops the full referrer list being harvested from a public page.</div>
</div>

<!-- ══════════════ 3. CLINIC TOOLS ══════════════ -->
<div class="chapter" id="ch-clinic">
  <div class="num">Chapter 3</div>
  <h2>Clinic Tools</h2>
  <p>The day-to-day of running the clinic: who works, who is booked, who is waiting, and how full the week is.</p>
</div>

<div class="sec" id="staff">
  <h3>Staff Module <span class="path">/staff</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">The clinician roster. Everything here comes from HR Hub — this is a mirror, not the original.</p>
  <h4>What you can and cannot change</h4>
  <div class="tip warn"><b>Read this first:</b> you cannot add or delete staff here. Names, departments, branches, job titles, employment type and contact details are all owned by HR Hub. To change any of them, change them in HR Hub and re-sync. Only a few Operations-owned fields (such as extra branches and sex) are editable here, and the sync deliberately leaves those alone.</div>
  <h4>Reading a row</h4>
  <ul>
    <li><b>Branch</b> — the home branch, shown as <b>AHEA</b> (East) or <b>AHGH</b> (Greenhills).</li>
    <li><b>Also at Branch</b> — the extra branches an interbranch consultant covers.</li>
    <li><b>Employment</b> — Employee, Consultant, Intern, or Renter.</li>
  </ul>
  <h4>Employment types, and why they matter</h4>
  <table class="btns">
    <thead><tr><th>Type</th><th>What it changes elsewhere</th></tr></thead>
    <tbody>
      <tr><td>Employee</td><td>Salaried staff. Appears everywhere normally.</td></tr>
      <tr><td>Consultant</td><td>Paid per session. Appears everywhere normally.</td></tr>
      <tr><td>Intern</td><td>Excluded from the bookable clinician lists. Picked separately as a supervised intern on a session, and only while their internship dates are current.</td></tr>
      <tr><td>Renter</td><td>Not paid by us at all — they pay the clinic a monthly facility fee and bring their own private clients. Book their sessions as normal and they show in the queue as normal, but the clinic does not message their patients, so the reminder buttons in Clinic Schedule are switched off for them.</td></tr>
    </tbody>
  </table>
  <h4>Syncing from HR</h4>
  <ol class="steps">
    <li>Change the person in HR Hub first and save there.</li>
    <li>Come back to Staff Module and run the sync.</li>
    <li>Check the row updated. If the person has left, they should now show as inactive rather than disappearing.</li>
  </ol>
  <div class="tip"><b>Leavers are deactivated, never deleted.</b> Deleting would take their whole appointment history with them. An inactive person drops out of the boards and pickers but their past sessions stay intact.</div>
</div>

<div class="sec" id="queueing">
  <h3>Queueing <span class="path">/queueing</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">The live waiting room: who has arrived, who is in session, and what the TV screen shows.</p>
  <h4>Booking a walk-in</h4>
  <ol class="steps">
    <li>Press <b>New Patient</b> — or <b>Search Existing Patient</b> first, because most walk-ins already have a record.</li>
    <li>If they are new, fill in name, <b>Date of Birth</b>, <b>Sex</b>, <b>Email</b>, <b>Address / Barangay</b> and <b>Diagnosis</b>.</li>
    <li>Choose <b>Clinician</b>, <b>Date</b>, <b>Start Time</b> and <b>Duration</b> — the <b>End Time</b> fills in for you. Choose <b>Custom</b> if the session is an unusual length.</li>
    <li>Set <b>Session Type</b>, and <b>Select Intern</b> if a student is sitting in.</li>
    <li>Save. The patient joins the queue and appears on the TV screen.</li>
  </ol>
  <h4>Moving people through</h4>
  <p>A patient moves <b>Pending &rarr; Confirmed</b> as they arrive and are seen. Change the status on their row; the TV display follows within seconds.</p>
  <h4>The TV display</h4>
  <p>The waiting-room screen runs from the same data. Two things are controlled here:</p>
  <ul>
    <li><b>Upload Ad</b> — adds a picture or video to the rotation between queue screens. Use portrait images sized for the screen or they will letterbox.</li>
    <li><b>Leaderboard</b> — a switch that shows the clinician satisfaction leaderboard on the TV, alternating with the ads.</li>
  </ul>
  <div class="tip warn"><b>The leaderboard is public.</b> Anyone in the waiting room can read it, including the families of the clinicians on it. Turn it on deliberately, not by accident.</div>
</div>

<div class="sec" id="clinic-schedule">
  <h3>Clinic Schedule <span class="path">/clinic-schedule</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">Individual appointments: booking them, changing them, and telling people about them. This is the module front desk spends the most time in.</p>
  <h4>Four views of the same day</h4>
  <table class="btns">
    <thead><tr><th>Tab</th><th>Use it when</th></tr></thead>
    <tbody>
      <tr><td>Department View</td><td>The default. One card per clinician, grouped by department. This is where you book, edit and send reminders.</td></tr>
      <tr><td>Calendar View</td><td>You want the shape of a week rather than a list of a day.</td></tr>
      <tr><td>Daily View</td><td>You want one day as a straight time-ordered list — good for printing a day sheet.</td></tr>
      <tr><td>Status View</td><td>You are chasing attendance: who is Pending, Confirmed, Cancelled, No-Show or Rescheduled.</td></tr>
    </tbody>
  </table>
  <h4>Booking a session</h4>
  <ol class="steps">
    <li>Set the branch tab and the date.</li>
    <li>Find the clinician's card and click it to expand. Use <b>All Departments</b> / <b>All Staff</b> at the top to narrow a long list.</li>
    <li>Press the add button on that card.</li>
    <li>Choose the <b>Patient</b>, <b>Start Time</b>, <b>Duration</b> and <b>Session Type</b>. <b>Mode</b> sets whether it is in clinic or teletherapy.</li>
    <li>If a student is attending, use <b>Select Intern</b>. Only interns whose dates are current appear.</li>
    <li>If a mentor is sitting in, tick <b>With Mentor</b> and pick them.</li>
    <li>Save. The session appears on the card, in the queue, and on the clinician's own portal.</li>
  </ol>
  <h4>Telling people about it</h4>
  <p>Reminders are grouped by who receives them — <b>Patients</b> in one row, <b>Clinician</b> in the other.</p>
  <table class="btns">
    <thead><tr><th>Button</th><th>Who gets it</th></tr></thead>
    <tbody>
      <tr><td>Envelope on a row</td><td>Email to that one patient. Only shown if they have an email address.</td></tr>
      <tr><td>Speech bubble on a row</td><td>Text to that one patient. Only shown if they have a mobile number. Sent over Viber where possible, otherwise SMS.</td></tr>
      <tr><td>Email All Patients</td><td>Every patient on that clinician's list for that day.</td></tr>
      <tr><td>Text All Patients</td><td>The same, by text.</td></tr>
      <tr><td>Text / Email: Clinician Absent Notice</td><td>Tells every patient booked with that clinician today that the session is off. Red, because families act on it immediately.</td></tr>
      <tr><td>Text Clinician / Email Clinician</td><td>Sends the clinician their own schedule for the day.</td></tr>
    </tbody>
  </table>
  <div class="tip warn"><b>These leave the building.</b> Absent notices in particular reach real families within seconds and cannot be recalled. Check the branch tab, the date and the clinician before pressing one.</div>
  <div class="tip"><b>Greyed-out reminder buttons:</b> either the clinician has no mobile number on file, or they are a <b>Renter</b> — renters look after their own private clients, so the clinic does not message their patients. Hover the button and the tooltip will say which.</div>
  <h4>Make-up sessions</h4>
  <p>The <b>Make-up sessions</b> area lists clinicians who are not normally on tomorrow but are covering. Add a clinician here and they appear alongside the regular list for that day only.</p>
</div>

<div class="sec" id="utilization">
  <h3>Clinic Utilization <span class="path">/scheduling-dashboard</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span></div>
  <p class="lede">How full the clinic is, as charts. The management view of the same data front desk books.</p>
  <h4>What each chart answers</h4>
  <ul>
    <li><b>Slot Utilization</b> — of the hours consultants offered, how many were sold.</li>
    <li><b>Clinic Utilization Rate Over Time</b> — the same figure tracked across the range.</li>
    <li><b>Total Number of Sessions Over Time</b> — volume rather than fullness. A clinic can be busier and emptier at once if capacity grew faster.</li>
    <li><b>Therapist</b> breakdown — per clinician.</li>
  </ul>
  <h4>Comparing the two branches side by side</h4>
  <ol class="steps">
    <li>Set <b>Start Date</b> and <b>End Date</b>.</li>
    <li>Switch the branch selector to the comparison view.</li>
    <li>Both branches render in the same panel on the same scale, so the difference is read directly rather than by flipping tabs and remembering.</li>
  </ol>
  <p>Where both branches are genuinely close, the page says <b>Both branches level on utilization</b> rather than inviting you to read a difference that is not there.</p>
  <h4>Dashboard Settings</h4>
  <p>Sets the capacity assumptions the percentages are measured against. Changing them changes every historical figure on the page, so treat it as a management decision rather than a display preference.</p>
  <div class="tip"><b>Not enough days in range to fit a trend</b> means exactly that — widen the date range and the trend line returns.</div>
</div>

<div class="sec" id="survey">
  <h3>Customer Survey <span class="path">/customer-survey</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">Patient satisfaction: sending the surveys out, reading what comes back, and the clinician leaderboard built from it.</p>
  <h4>Getting a survey to a patient</h4>
  <ol class="steps">
    <li><b>Scan to Take Survey</b> shows a QR code — the normal route, printed at the counter or shown on a phone.</li>
    <li><b>Manual Survey Assignment</b> assigns one to a named patient when you want a specific person asked.</li>
    <li><b>Assessment Schedule</b> controls the automatic rhythm so most surveys go out without anyone pressing anything.</li>
  </ol>
  <h4>Reading the results</h4>
  <ul>
    <li><b>Completion Rate</b> and <b>Avg Rating</b> — the two headline numbers.</li>
    <li><b>Monthly Rating Trend</b> — the direction of travel, which matters more than any single month.</li>
    <li><b>Patient Feedback Summary</b>, <b>Strengths</b>, <b>Areas for Improvement</b> and <b>Other Comments</b> — the written answers. Read these before drawing conclusions from the score.</li>
    <li><b>Manage Survey Entries</b> — correct or remove a specific response.</li>
  </ul>
  <h4>The leaderboard</h4>
  <p><b>Leaderboard Scoring Weights</b> sets how the ranking is calculated — how much rating counts against how much volume counts. Only currently active clinicians appear; somebody who has left drops off rather than sitting frozen at the top.</p>
  <div class="tip warn"><b>Small numbers mislead:</b> a clinician with three responses can outrank one with ninety. Look at the response count beside the score before acting on a ranking.</div>
</div>

<div class="sec" id="reg-forms">
  <h3>Registration Forms <span class="path">/registration-forms</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Everything submitted through the public forms, and the settings behind those forms.</p>
  <h4>Working the list</h4>
  <ol class="steps">
    <li>Use the <b>status tickboxes</b> at the top to show only what you are working on: <b>Converted</b>, <b>Not Converted</b>, <b>For prioritization</b>. Ticking more than one shows all of them.</li>
    <li>Use the tick-list dropdowns on each column to narrow further. These are checkbox lists — tick several values at once.</li>
    <li>Contact details are split into their own columns — name, email, number — rather than crammed into one, so the table can be scanned and sorted.</li>
    <li>Open a submission and use <b>Edit Response</b> to correct a typo before converting it.</li>
  </ol>
  <h4>Colour on a row</h4>
  <p>A row that is both converted and flagged for prioritization shows as <b>Converted Priority</b> in purple, so the combination stands out from ordinary converted rows.</p>
  <h4>Settings</h4>
  <p>The partner schools and institutions offered on the public registration form are maintained here. Add a school here and it appears in the tickbox list on the patient registration page — there is no second place to update.</p>
  <div class="tip"><b>About this program</b> holds the description families read before filling the form in. Worth re-reading whenever the offering changes.</div>
</div>

<div class="sec" id="decking">
  <h3>Decking Module <span class="path">/decking</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">The weekly grid of who is available and which hours are sold. Clinic Schedule books one appointment on one date; Decking is the repeating shape of the week behind it.</p>
  <h4>Two cards, two jobs</h4>
  <p>The chips at the top sit in two cards, and the split is the point: the left card is where the week gets filled in, the right card reads the same slots back as a report. Hover any chip for its one-line description.</p>
  <table class="btns">
    <thead><tr><th>Chip</th><th>What it shows</th></tr></thead>
    <tbody>
      <tr><td colspan="2" style="background:var(--bg);font-weight:800;color:var(--text)">Decking — filling the week</td></tr>
      <tr><td>On-site</td><td>Consultants seeing patients in clinic.</td></tr>
      <tr><td>Teletherapy</td><td>Consultants running remote sessions.</td></tr>
      <tr><td>Homecare</td><td>Consultants travelling to patients.</td></tr>
      <tr><td>SPED Class</td><td>One board for the whole branch rather than a grid per consultant, because SPED runs classes — many children in a block, and blocks longer than an hour.</td></tr>
      <tr><td>All</td><td>Every consultant, however they are tagged. Use this when somebody is missing from the section you expected.</td></tr>
      <tr><td colspan="2" style="background:var(--bg);font-weight:800;color:var(--text)">Analysis — reading it back</td></tr>
      <tr><td>Per Day</td><td>Weekly totals by day across all departments, for setting a daily target.</td></tr>
      <tr><td>Interdepartment</td><td>Patients already seeing more than one department, and the ones who could be.</td></tr>
      <tr><td>History</td><td>Filled and open slots over time, per department.</td></tr>
    </tbody>
  </table>
  <div class="tip"><b>Why somebody appears twice:</b> a consultant tagged "On-site + Teletherapy" genuinely appears under both. That is two roles, not a mistake and not a third category.</div>
  <h4>Booking a slot</h4>
  <ol class="steps">
    <li>Pick the branch tab, then a section chip, then a department chip.</li>
    <li>Find the consultant's column and the hour you want. Use <b>Filter by name</b> if the board is wide.</li>
    <li>Click the empty cell and choose the patient.</li>
    <li>Set how the session is paid: <b>Cash</b>, <b>HMO</b> or <b>Guarantee Letter</b>.</li>
    <li>Save. The cell fills with the patient's name.</li>
  </ol>
  <h4>Reading the cells and the Slots card</h4>
  <table class="btns">
    <thead><tr><th>Cell / figure</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>Named cell</td><td>Booked. The patient is in that hour.</td></tr>
      <tr><td>Empty cell</td><td>Open — available to sell.</td></tr>
      <tr><td>Greyed cell</td><td>Unavailable. Outside the consultant's hours, or deliberately blocked.</td></tr>
      <tr><td>Total / Booked / Open</td><td>The Slots card. Each percentage is stated as a share <b>of total</b>, and the tile says so.</td></tr>
    </tbody>
  </table>
  <h4>Working Hours and Settings</h4>
  <p>Each consultant's available hours are set per branch and per service. <b>Use clinic default hours</b> adopts the standard day; untick it to set a <b>Start Time</b> and <b>End Time</b> of their own. Because the hours are per service, one consultant can be on-site Thursdays at one branch and teletherapy Tuesdays at the other — set them as separate entries rather than trying to describe both in one.</p>
  <h4>SPED Class board</h4>
  <p>Switch between <b>Day</b> and <b>Week</b>. The weekly view shows classes as blocks laid side by side where they overlap, so you can see how many groups share the clinic at the same time and plan the spacing. Adding or removing a child updates the board in place without reloading the page.</p>
  <h4>History</h4>
  <p>Two panels sharing one date axis — <b>Filled</b> in green above, <b>Open</b> in gold below. Each panel is zoomed to its own range so a change of two or three slots is visible; read the numbers on the left rather than judging by the height of the line. Hovering either panel reads both at that date.</p>
  <div class="tip warn"><b>The chart does not reach "Slots offered".</b> Blocked hours are counted in the Slots offered tile but deliberately not drawn, so the top of the chart sits below that number. <b>Fill rate</b> is filled divided by (filled + open) — of what could be sold, how much was.</div>
  <div class="tip"><b>History only goes back to the first reading.</b> The board is a weekly template holding no dates, so earlier days genuinely cannot be reconstructed. The page says where history begins rather than drawing a flat line through a past it does not have.</div>
</div>

<div class="sec" id="loa">
  <h3>LOA Submission <span class="path">/loa-submissions</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">Letters of Authorization from HMOs — submitted by families through a public form, then worked here.</p>
  <h4>Working the queue</h4>
  <ol class="steps">
    <li>Filter with <b>All branches</b>, <b>All HMOs</b> and <b>Any status</b> to reach the ones you are handling.</li>
    <li>Open a submission and check the uploaded letter against the patient record.</li>
    <li>Match it to the patient in <b>Patient CRM</b> — the search here matches on name.</li>
    <li>Set the status. <b>Not yet</b> marks one still waiting on the HMO.</li>
  </ol>
  <h4>Settings</h4>
  <p><b>LOA form</b> opens the public form as a family sees it. <b>LOA form settings</b> controls what it asks. The HMO list mirrors the digital wallets used in the POS, so an HMO added there appears here without being typed twice.</p>
</div>

<div class="sec" id="patient-rel">
  <h3>Patient Relationship <span class="path">/patient-relationship</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span></div>
  <p class="lede">The people who are not currently in a chair: waiting for a slot, needing a follow-up, or who did not turn up.</p>
  <h4>Four tabs</h4>
  <table class="btns">
    <thead><tr><th>Tab</th><th>What it holds</th></tr></thead>
    <tbody>
      <tr><td>Waitlist</td><td>Families waiting for a slot. The <b>Branch</b> column shows where they filled the form in, so you know which clinic they were asking about.</td></tr>
      <tr><td>Follow Up</td><td>Patients due a check-in. Log the outcome of each call.</td></tr>
      <tr><td>No-Show</td><td>Missed appointments, with a log per patient.</td></tr>
      <tr><td>Cancellations</td><td>Cancelled sessions and whether a fee applies.</td></tr>
    </tbody>
  </table>
  <p>Within a tab, the department chips — <b>PT</b>, <b>OT</b>, <b>SLP</b>, <b>SPED</b>, <b>Psych</b>, <b>MD</b> — narrow the list further.</p>
  <h4>Fees and repeated misses</h4>
  <p>A row marked <b>Fee applies</b> has passed the threshold in policy. A patient marked <b>SUBJECT TO SLOT REMOVAL</b> has missed often enough that their standing slot is at risk — a conversation, not an automatic action.</p>
  <h4>Logs and proof</h4>
  <p><b>No-Show Logs</b> and <b>Cancellation Logs</b> hold the history behind a row; both can be deleted, which asks first. <b>Scan to Upload Proof</b> gives the family a QR code to send in evidence for a waived fee, such as a medical certificate.</p>
  <div class="tip"><b>Form Responses</b> shows what the family originally submitted — useful context before a difficult call about a fee.</div>
</div>

<div class="sec" id="peer-eval">
  <h3>Peer Evaluation <span class="path">/peer-eval</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Staff evaluating each other on the HR08 and HR09 instruments. Annual, and largely automatic once generated.</p>
  <h4>Running a round</h4>
  <ol class="steps">
    <li>Choose the <b>Period</b>, <b>Branch</b> and <b>Evaluation Type</b> — <b>HR08 Peer</b>, <b>HR08 Admin</b> or <b>HR09</b>.</li>
    <li>Generate the assignments. <b>Generation Complete</b> confirms who was assigned to whom. <b>Assignment Logic Reference</b> explains the pairing rules if a pairing looks odd.</li>
    <li>Distribute using <b>QR Codes</b> — one per evaluator — or <b>Open Survey</b> to check what they will see.</li>
    <li>Track <b>Pending</b>, <b>Answered</b>, <b>Completed</b> and <b>Expired</b> using the status filters.</li>
    <li>Read results under <b>Scores</b> and <b>Score Entry</b>, including <b>Strengths</b> and <b>Areas for Improvement</b>.</li>
  </ol>
  <div class="tip"><b>Work Days in Clinic</b> feeds the pairing — people are matched with colleagues they actually work alongside. If that is wrong, fix the work days before regenerating rather than reassigning by hand.</div>
</div>

<div class="sec" id="partners">
  <h3>Partner Institutions <span class="path">/partner-institutions</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill desk">Front Desk</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Schools and institutions we hold agreements with, and what discount each one gets. View-only here — HR Hub owns the records.</p>
  <h4>Reading a card</h4>
  <ul>
    <li><b>Left</b> — the contact: who to call and how. <b>No contact recorded</b> means nobody has been named yet.</li>
    <li><b>Right</b> — the discount terms, in plain sentences with the figures in bold, because this is what front desk needs at the counter.</li>
    <li><b>No discount set</b> — an agreement exists but carries no discount. That is different from a discount nobody has entered, so it is stated rather than left blank.</li>
  </ul>
  <p>Filter by <b>All types</b> to narrow to schools, clinics or corporate partners. <b>Signed document on file in HR Hub</b> tells you the contract scan exists without exposing it here.</p>
  <div class="tip"><b>To change anything</b> — a contact, a discount, a new partner — edit it in HR Hub. This page updates on its own. Commission terms are deliberately not shown here.</div>
</div>

<!-- ══════════════ 4. SOCIAL & MARKETING ══════════════ -->
<div class="chapter" id="ch-mktg">
  <div class="num">Chapter 4</div>
  <h2>Social and marketing</h2>
  <p>Everything that speaks to the public. Front Desk accounts do not have this chapter.</p>
</div>

<div class="sec" id="social">
  <h3>Social Media Suite <span class="path">/social</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Writing, scheduling and reviewing posts to the connected Facebook and Instagram accounts.</p>
  <h4>Posting</h4>
  <ol class="steps">
    <li>Go to <b>New Post</b>.</li>
    <li>Write the caption, then add artwork — <b>Click to upload image or video</b> from your computer, or <b>Import from Canva</b> to pull a finished design straight in. <b>Add more</b> attaches further images for a carousel.</li>
    <li>Choose which accounts it goes to.</li>
    <li>Publish now, or set a date and time to schedule it.</li>
  </ol>
  <h4>The other two pages</h4>
  <ul>
    <li><b>Scheduled</b> — queued posts. Edit or remove one before it goes out; <b>No posts scheduled</b> means the queue is empty.</li>
    <li><b>Published</b> — what has gone out, with how it performed.</li>
  </ul>
  <div class="tip warn"><b>Scheduled means scheduled.</b> Once the time passes the post is public. If you are unsure about wording, leave it as a draft rather than scheduling it and planning to check later.</div>
</div>

<div class="sec" id="templates">
  <h3>Post Templates <span class="path">/templates</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Reusable artwork for the two things posted most often: <b>Birthday Posts</b> and <b>Holiday Posts</b>.</p>
  <p>Add artwork with <b>Upload Photo or Video</b> (JPG, PNG, MP4 or MOV) or <b>Use a Canva design</b> and <b>Browse your designs</b>. Saved templates are offered when composing rather than rebuilt each time.</p>
</div>

<div class="sec" id="email">
  <h3>Email Campaigns <span class="path">/email</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Bulk email to patients, from a branch address.</p>
  <ol class="steps">
    <li>Choose the sending identity — <b>Aura Health Rehab Clinic</b> or <b>Sapphire Clinics East</b>.</li>
    <li>Write the <b>Subject</b> and body.</li>
    <li>Choose <b>Recipients</b>. Only patients who consented to the newsletter are included.</li>
    <li>Use <b>Email Preview</b> and read it once more.</li>
    <li>Send now, or schedule. Track it under <b>Past Campaigns</b> and <b>Sent / Scheduled</b>.</li>
  </ol>
  <p>Statuses run <b>Draft</b>, <b>Scheduled</b>, <b>Sending</b>, <b>Sent</b>, <b>Failed</b>. A campaign stuck on Sending is still working through the list; Failed needs looking at.</p>
  <div class="tip warn"><b>There is no unsend.</b> Preview, check the recipient count, then send.</div>
</div>

<div class="sec" id="sms">
  <h3>SMS Campaigns <span class="path">/sms</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">Bulk text messages. Same shape as email, with two differences worth knowing.</p>
  <ol class="steps">
    <li>Pick <b>Branch</b> — or <b>Both branches</b>. Messages send from that branch's own number.</li>
    <li>Choose the recipient <b>Group</b>.</li>
    <li>Write the <b>Message</b>. Keep it short: long messages split into several and each part is charged.</li>
    <li>Send or schedule, then follow it in <b>Past Campaigns</b>.</li>
  </ol>
  <p>A campaign can finish as <b>Partial</b> — some delivered, some not, usually bad numbers. Open it to see which, and correct those records in Patient CRM.</p>
</div>

<!-- ══════════════ 5. SETTINGS & REFERENCE ══════════════ -->
<div class="chapter" id="ch-settings">
  <div class="num">Chapter 5</div>
  <h2>Settings and reference</h2>
  <p>Configuration, accounts, and how the Hub connects to the other systems.</p>
</div>

<div class="sec" id="investor">
  <h3>Investor View <span class="path">/patients/dashboard</span></h3>
  <div class="who"><span class="pill inv">Investor only</span></div>
  <p class="lede">A deliberately narrow, read-only account for people who should see how the clinic is performing without seeing who the patients are.</p>
  <h4>What an investor account can reach</h4>
  <p>Exactly two pages, and nothing else:</p>
  <ul>
    <li><b>Patient Dashboard</b> — patient numbers, growth and mix, plus the therapist leaderboard and positive feedback highlights. This is the landing page.</li>
    <li><b>Customer Satisfaction Survey</b> — the leaderboard and patient feedback on a page of their own.</li>
  </ul>
  <p>The left menu shows only those two, under the heading <b>Investor View</b>. Typing any other address into the browser lands back on the Patient Dashboard rather than opening the page.</p>
  <h4>What is deliberately hidden</h4>
  <table class="btns">
    <thead><tr><th>Hidden</th><th>How</th></tr></thead>
    <tbody>
      <tr><td>Patient identity</td><td>Respondent names, emails and phone numbers are never fetched from the database for this view at all — not merely left off the screen.</td></tr>
      <tr><td>Therapist names</td><td>Masked to initials. An investor sees the ranking and the scores, not who is who.</td></tr>
      <tr><td>Every other module</td><td>Blocked on the server. Adding a link to the menu would not grant access; the allowed list is enforced behind it.</td></tr>
    </tbody>
  </table>
  <div class="tip"><b>Why masking sits in the API, not the page:</b> if the names were only hidden by the screen, the full names would still arrive in the browser and be readable by anyone who looked. They are removed before the data is sent.</div>
  <h4>Setting one up</h4>
  <ol class="steps">
    <li>Go to <b>Settings &rarr; Team</b> as a Clinic Manager.</li>
    <li>Create the account and set the role to <b>Investor</b>.</li>
    <li>No branch is needed — the view already spans the clinic.</li>
    <li>Sign in as them once to confirm they land on the Patient Dashboard and the menu shows only the two entries.</li>
  </ol>
  <div class="tip warn"><b>Do not use an admin account as a stand-in.</b> Handing an investor a Clinic Manager login exposes every patient record in the clinic. The Investor role exists so that never has to happen.</div>
</div>

<div class="sec" id="accounts">
  <h3>Connected Accounts <span class="path">/settings/accounts</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">The external accounts the Hub posts through: <b>Facebook Page</b>, <b>Instagram Business</b> and <b>Canva</b>.</p>
  <p>Each row shows <b>Platform</b>, <b>Status</b> and <b>Last Synced</b>. If social posting fails, check here first — a <b>Page Access Token</b> expires periodically and must be reconnected. <b>No accounts connected</b> means nothing can post at all.</p>
</div>

<div class="sec" id="team">
  <h3>Team <span class="path">/settings/users</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager only</span></div>
  <p class="lede">Hub user accounts. This is the only place accounts are created, and only Clinic Managers can open it.</p>
  <ol class="steps">
    <li>Enter the person's <b>Name</b> and <b>Email</b>.</li>
    <li>Choose the <b>Role</b> — the five in Chapter 1. <b>Admin — all branches, all modules</b> is the unrestricted one.</li>
    <li>Set the <b>Branch</b> for a branch-locked role.</li>
    <li>Set a <b>Password</b> and pass it to them privately.</li>
  </ol>
  <div class="tip warn"><b>Staff accounts are not clinician records.</b> Creating someone here does not add them to the roster — that comes from HR Hub. A clinician who never signs in does not need an account here at all.</div>
</div>

<div class="sec" id="brand">
  <h3>Brand Guide <span class="path">/brand</span></h3>
  <div class="who"><span class="pill admin">Clinic Manager</span><span class="pill hr">HR Officer</span><span class="pill mktg">Marketing Admin</span></div>
  <p class="lede">The reference for anything public-facing: <b>Colors</b>, <b>Typography</b>, <b>Brand Tone</b> and <b>Design Notes</b>. Check it before publishing artwork made outside the Hub.</p>
</div>

<div class="sec" id="hubs">
  <h3>Connected systems — where the data flows</h3>
  <p class="lede">The Operations Hub is one of several connected systems. They share data automatically over secure
     system-to-system links, so information typed once does not have to be typed again elsewhere. This map shows
     what the Operations Hub <b>supplies</b> to each system and what it <b>receives</b> back.</p>

  <div class="diagram">
    <svg viewBox="0 0 820 470" role="img" aria-label="Operations Hub at the centre, exchanging data with HR Hub, Accounting Hub, Client Portal and Staff Portal">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#8FA8A5"/>
        </marker>
      </defs>

      <!-- outer systems -->
      <g class="node">
        <rect x="30" y="34" width="290" height="76" rx="12"/>
        <text class="nt" x="175" y="68">HR Hub</text>
        <text class="ns" x="175" y="90">staff &middot; employment &middot; partners</text>
      </g>
      <g class="node">
        <rect x="500" y="34" width="290" height="76" rx="12"/>
        <text class="nt" x="645" y="68">Accounting Hub</text>
        <text class="ns" x="645" y="90">billing &middot; referrers &middot; finance</text>
      </g>
      <g class="node">
        <rect x="30" y="360" width="290" height="76" rx="12"/>
        <text class="nt" x="175" y="394">Client Portal</text>
        <text class="ns" x="175" y="416">what families see</text>
      </g>
      <g class="node">
        <rect x="500" y="360" width="290" height="76" rx="12"/>
        <text class="nt" x="645" y="394">Staff Portal</text>
        <text class="ns" x="645" y="416">what clinicians see</text>
      </g>

      <!-- centre -->
      <g class="hub">
        <rect x="265" y="192" width="290" height="86" rx="14"/>
        <text class="ht" x="410" y="228">OPERATIONS HUB</text>
        <text class="hs" x="410" y="252">operations.sapphireclinicseast.org</text>
      </g>

      <!-- flows: two-way above, one-way below -->
      <path class="edge two" d="M195 118 L330 184" marker-end="url(#ah)" marker-start="url(#ah)"/>
      <path class="edge two" d="M625 118 L490 184" marker-end="url(#ah)" marker-start="url(#ah)"/>
      <path class="edge one" d="M330 286 L195 352" marker-end="url(#ah)"/>
      <path class="edge one" d="M490 286 L625 352" marker-end="url(#ah)"/>

      <text class="el" x="222" y="162">staff in &middot; results out</text>
      <text class="el" x="598" y="162" text-anchor="end">doctors in &middot; bookings out</text>
      <text class="el" x="222" y="330">patients &middot; sessions</text>
      <text class="el" x="598" y="330" text-anchor="end">schedules &middot; queue</text>
    </svg>
    <p class="legend"><span class="sw two"></span> two-way automatic sync &nbsp;&middot;&nbsp;
       <span class="sw one"></span> one-way (Operations publishes out)</p>
  </div>

  <h4>What moves, and which way</h4>
  <table class="btns">
    <thead><tr><th>System</th><th>Operations receives / supplies</th></tr></thead>
    <tbody>
      <tr><td>HR Hub</td><td><b>Receives</b> staff records, employment type, work arrangement and partner institutions — HR owns all of these. <b>Supplies</b> survey and peer-evaluation results back.</td></tr>
      <tr><td>Accounting Hub</td><td><b>Receives</b> the referring-doctor list used by the registration form, read live. <b>Supplies</b> booking and payment markers for reconciliation.</td></tr>
      <tr><td>Client Portal</td><td><b>Supplies</b> what families see: their patient record, sessions and documents.</td></tr>
      <tr><td>Staff Portal</td><td><b>Supplies</b> what clinicians see: their own schedule and the day queue.</td></tr>
    </tbody>
  </table>
  <div class="tip warn"><b>One-way means one-way.</b> Editing a staff name in Operations does not reach HR Hub, and the next sync will overwrite it. Change it where it is owned — the table above says where that is.</div>
</div>

<div class="sec" id="matrix">
  <h3>Who can see what</h3>
  <div class="matrix-wrap">
  <table class="matrix">
    <thead><tr><th>Module</th><th>Clinic Mgr</th><th>HR Officer</th><th>Front Desk</th><th>Marketing</th><th>Investor</th></tr></thead>
    <tbody>
      <tr><td>Home Dashboard</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td></tr>
      <tr><td>Patient CRM / Profile</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td></tr>
      <tr><td>Patient Dashboard</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="yes">Yes</td></tr>
      <tr><td>Staff Module</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Queueing</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>Clinic Schedule</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>Clinic Utilization</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>Customer Survey</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="part">Satisfaction only</td></tr>
      <tr><td>Registration Forms</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Decking Module</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>LOA Submission</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>Patient Relationship</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td></tr>
      <tr><td>Peer Evaluation</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Partner Institutions</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Social / Templates / Email / SMS</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Connected Accounts</td><td class="yes">Yes</td><td class="yes">Yes</td><td class="no">No</td><td class="yes">Yes</td><td class="no">No</td></tr>
      <tr><td>Team</td><td class="yes">Yes</td><td class="no">No</td><td class="no">No</td><td class="no">No</td><td class="no">No</td></tr>
    </tbody>
  </table>
  </div>
  <div class="tip"><b>Branch lock sits on top of this.</b> A Front Desk account with Yes in this table still only sees its own branch. Investor accounts span both branches but see no names.</div>
</div>

<!-- ══════════════ 6. HELP ══════════════ -->
<div class="chapter" id="ch-help">
  <div class="num">Chapter 6</div>
  <h2>Help</h2>
  <p>Search this handbook, and the questions that come up most often.</p>
</div>

<div class="sec" id="search">
  <h3>Word search</h3>
  <p class="lede">Type a word and every section containing it is listed, with the word highlighted where it sits.</p>
  <div class="tb-search" style="max-width:none;margin-bottom:8px">
    <span class="mag">&#128269;</span>
    <input id="q2" type="search" placeholder="Search for a word — try: renter, no-show, QR, fill rate…" autocomplete="off">
  </div>
  <div id="results2" class="results" style="margin:0"></div>
  <h4>Getting better results</h4>
  <ul>
    <li>Search what the thing is <b>called on screen</b> — "Absent Notice" rather than "cancel message".</li>
    <li>One or two words beat a sentence. "fill rate" works; "how do I work out the fill rate" does not.</li>
    <li>Part of a word is enough — "regist" finds registration, registered and Registration Forms.</li>
    <li>Nothing found? Try the other name for it. Decking and Clinic Schedule both deal with appointments but use different words.</li>
  </ul>
  <div class="tip">The same box sits in the bar at the top of every page, so you can search without scrolling back here.</div>
</div>

<div class="sec" id="faq">
  <h3>Frequently asked questions</h3>
  <p class="lede">Click a question to open the answer.</p>

  <h4>Getting in and getting around</h4>
  <details class="faq"><summary>A module in this handbook is missing from my menu.</summary><div class="a">
    <p>Your role does not include it. Check Chapter 1 against the four role cards. Front Desk accounts have no social, email or analytics modules; Marketing Admin accounts have no Clinic Schedule, Decking or Patient Relationship.</p>
    <p>If you believe you have the wrong role, a Clinic Manager can change it under <b>Settings &rarr; Team</b>.</p></div></details>
  <details class="faq"><summary>I can only see one branch.</summary><div class="a">
    <p>Front Desk accounts are locked to their own branch by design — an East account cannot see Greenhills data. Clinic Manager and HR Officer accounts see both and switch with the branch tabs inside each module.</p></div></details>
  <details class="faq"><summary>The page looks out of date after someone else changed something.</summary><div class="a">
    <p>Refresh the page. If it still looks old, hold Shift and refresh, which bypasses the browser cache.</p></div></details>

  <h4>Patients</h4>
  <details class="faq"><summary>A patient exists twice.</summary><div class="a">
    <p>Usually because they registered themselves and were also added at the counter. Their history is now split across two records and neither looks wrong on its own. Always search before creating. Ask a Clinic Manager to merge them — do not simply delete one, or you delete half the history with it.</p></div></details>
  <details class="faq"><summary>How do I get a family to register themselves?</summary><div class="a">
    <p>In Patient CRM, open <b>Patient Registration QR</b> and show or print the code. They scan it, fill the form in themselves, and can photograph their referral and PWD/Senior ID with their own phone. This removes transcription errors.</p></div></details>
  <details class="faq"><summary>The doctor's name will not come up on the registration form.</summary><div class="a">
    <p>Type at least three letters <b>of the name itself</b> — the honorific does not count, so "dr. a" is one letter and shows nothing, while "dr. aid" finds the match. Matching is on the start of a word, so a surname works as well as a first name.</p>
    <p>If the doctor genuinely is not listed, the family can just type the name — the field accepts anything. To add them permanently, add them in Accounting Hub under Referral &rarr; Referrers &rarr; Doctors and they are findable immediately.</p></div></details>
  <details class="faq"><summary>A partner school is missing from the registration form.</summary><div class="a">
    <p>Add it in <b>Registration Forms &rarr; Settings</b>. That list is what the public form offers; there is no second place to update.</p></div></details>

  <h4>Scheduling</h4>
  <details class="faq"><summary>What is the difference between Clinic Schedule and Decking?</summary><div class="a">
    <p><b>Clinic Schedule</b> is individual appointments on a specific date — booking, changing and reminding. <b>Decking</b> is the repeating weekly shape behind it: which consultant offers which hours, and how much of that is sold.</p>
    <p>Book a one-off in Clinic Schedule. Ask "how full is Tuesday?" in Decking.</p></div></details>
  <details class="faq"><summary>The reminder buttons are greyed out.</summary><div class="a">
    <p>Two possible reasons, and the tooltip on the button says which. Either the clinician has no mobile number on file — fix that in HR Hub — or they are a <b>Renter</b>.</p>
    <p>Renters pay the clinic a monthly facility fee and bring their own private clients, so the clinic does not message those patients. You can still book their sessions normally and they still appear in the queue.</p></div></details>
  <details class="faq"><summary>A consultant is missing from the Decking board.</summary><div class="a">
    <p>Click the <b>All</b> chip. The On-site, Teletherapy and Homecare sections are driven by each person's work arrangement in HR Hub, and somebody untagged will not appear in any of the three but will appear under All. Fix the work arrangement in HR Hub and re-sync.</p>
    <p>If they are missing from All too, they are probably inactive in HR Hub.</p></div></details>
  <details class="faq"><summary>Someone appears in two Decking sections at once.</summary><div class="a">
    <p>That is correct. A consultant tagged "On-site + Teletherapy" genuinely does both, so they appear under both. It is two roles, not a duplicate.</p></div></details>
  <details class="faq"><summary>Why does the History chart not reach the "Slots offered" number?</summary><div class="a">
    <p>Because blocked hours are counted in that tile but deliberately not drawn. The chart shows only what was sellable — filled plus open — so its top edge sits below the total whenever anything is blocked.</p></div></details>
  <details class="faq"><summary>Fill rate jumped. Did we get better?</summary><div class="a">
    <p>Not necessarily. Fill rate is filled divided by (filled + open) — of what could be sold, how much was. Blocked hours are not in the denominator, so a department is not marked down for time its consultants never offered. The same work measured against a fairer base gives a higher number.</p></div></details>
  <details class="faq"><summary>History does not go back far enough.</summary><div class="a">
    <p>It starts at the first reading ever taken, and the page says that date. The board is a weekly template holding no dates, so earlier days genuinely cannot be reconstructed — they were never recorded.</p></div></details>

  <h4>Staff</h4>
  <details class="faq"><summary>Someone has left but still appears.</summary><div class="a">
    <p>Mark them inactive in HR Hub, then re-sync in Staff Module. They drop out of the boards and pickers but keep their history. They are never deleted — deleting would take thousands of past appointments with them.</p>
    <p>If they still show after a sync, check they are actually inactive in HR Hub rather than merely finished.</p></div></details>
  <details class="faq"><summary>I changed a staff name here and it reverted.</summary><div class="a">
    <p>Expected. HR Hub owns staff data and the sync overwrites the local copy. Change it in HR Hub.</p></div></details>
  <details class="faq"><summary>What is a Renter?</summary><div class="a">
    <p>A clinician we do not pay. They pay the clinic a fixed monthly fee for use of the facility and see their own private clients here. Schedule and queue them as normal; the clinic just does not send messages to their patients.</p></div></details>

  <h4>Messages and campaigns</h4>
  <details class="faq"><summary>I sent something by mistake. Can it be recalled?</summary><div class="a">
    <p>No. Emails, texts and social posts leave immediately and cannot be pulled back. If it was an Absent Notice, ring the affected families — they will have read it within minutes.</p></div></details>
  <details class="faq"><summary>An SMS campaign finished as "Partial".</summary><div class="a">
    <p>Some messages delivered and some did not, nearly always bad or missing mobile numbers. Open the campaign to see which failed, then correct those numbers in Patient CRM.</p></div></details>
  <details class="faq"><summary>A patient says they never get our emails.</summary><div class="a">
    <p>Check they are marked <b>Email Newsletter</b> in Patient CRM — campaigns only go to patients who consented. Then check the address itself for a typo.</p></div></details>
  <details class="faq"><summary>Social posting has stopped working.</summary><div class="a">
    <p>Check <b>Settings &rarr; Connected Accounts</b>. Page access tokens expire periodically and the account needs reconnecting. The <b>Last Synced</b> column usually shows the problem.</p></div></details>

  <h4>Numbers that look wrong</h4>
  <details class="faq"><summary>A figure does not match what I can see on the board.</summary><div class="a">
    <p>Check three things in order: the <b>branch tab</b>, the <b>date range</b>, and any <b>department filter</b> still set from last time. These explain most mismatches.</p>
    <p>If all three are right and it still disagrees, say so — a count that contradicts the board is worth investigating rather than working around.</p></div></details>
  <details class="faq"><summary>The leaderboard looks unfair.</summary><div class="a">
    <p>Check the response count beside each score. A clinician with three responses can outrank one with ninety. <b>Leaderboard Scoring Weights</b> controls how much rating counts against volume.</p></div></details>
  <details class="faq"><summary>Can I give an investor a login without showing them patient names?</summary><div class="a">
    <p>Yes — that is exactly what the <b>Investor</b> role is for. It reaches two read-only pages, patient identities are never sent to it, and therapist names appear as initials.</p>
    <p>Create it under <b>Settings &rarr; Team</b> and set the role to Investor. Never hand an investor an admin login instead; that exposes every patient record in the clinic.</p></div></details>
  <details class="faq"><summary>Who do I ask when the answer is not here?</summary><div class="a">
    <p>Anything about staff records, employment type or partner agreements — HR Hub, because it owns them. Anything about billing or referrers — Accounting Hub. Anything else, your Clinic Manager.</p></div></details>
</div>

</div><!-- /.wrap -->

<script>
(function () {
  // Contents is built from the document itself, so a new section cannot be
  // added without appearing in the menu.
  var CHAPTERS = [
    ['ch-start',    'Start here'],
    ['ch-patients', 'Home & patients'],
    ['ch-clinic',   'Clinic Tools'],
    ['ch-mktg',     'Social & marketing'],
    ['ch-settings', 'Settings & reference'],
    ['ch-help',     'Help']
  ];

  var secs = [];
  Array.prototype.forEach.call(document.querySelectorAll('.sec[id]'), function (el) {
    var h = el.querySelector('h3');
    if (!h) return;
    // The path chip is part of the heading; drop it from the menu label.
    var label = h.textContent.replace(/\s*\/[a-z0-9/_-]+\s*$/i, '').trim();
    secs.push({ id: el.id, label: label, el: el, text: el.innerText || el.textContent || '' });
  });

  // Group each section under the chapter heading that precedes it.
  var order = [], nodes = document.querySelectorAll('.chapter[id], .sec[id]'), cur = null;
  Array.prototype.forEach.call(nodes, function (n) {
    if (n.classList.contains('chapter')) { cur = n.id; order.push({ chapter: cur, items: [] }); }
    else if (order.length) { order[order.length - 1].items.push(n.id); }
  });

  var tocin = document.getElementById('tocin');
  order.forEach(function (grp) {
    var name = '';
    CHAPTERS.forEach(function (c) { if (c[0] === grp.chapter) name = c[1]; });
    if (!name) return;
    var col = document.createElement('div');
    col.className = 'toc-col';
    var h4 = document.createElement('h4'); h4.textContent = name; col.appendChild(h4);
    grp.items.forEach(function (id) {
      var found = null;
      secs.forEach(function (x) { if (x.id === id) found = x; });
      if (!found) return;
      var a = document.createElement('a');
      a.href = '#' + id; a.textContent = found.label;
      a.addEventListener('click', function () { closeToc(); });
      col.appendChild(a);
    });
    tocin.appendChild(col);
  });

  var toc = document.getElementById('toc'), tog = document.getElementById('toctog');
  function closeToc() { toc.classList.remove('open'); tog.classList.remove('on'); }
  tog.addEventListener('click', function () {
    toc.classList.toggle('open'); tog.classList.toggle('on', toc.classList.contains('open'));
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeToc(); } });

  // ── Search ──────────────────────────────────────────────────────────────
  // Character class deliberately ends with the dollar: a dollar immediately
  // followed by a brace would open an interpolation in the template literal
  // this file is written inside, and the build would fail.
  function esc(t) { return t.replace(/[.*+?^()|[\]\\{}$]/g, '\\$&'); }
  function safe(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function clearMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('mark.hit'), function (m) {
      var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
  }

  function highlight(root, term) {
    var re = new RegExp(esc(term), 'gi');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var targets = [], n;
    while ((n = walker.nextNode())) {
      if (n.parentNode && n.parentNode.nodeName === 'SCRIPT') continue;
      if (re.test(n.nodeValue)) targets.push(n);
      re.lastIndex = 0;
    }
    targets.forEach(function (node) {
      var span = document.createElement('span');
      span.innerHTML = safe(node.nodeValue).replace(new RegExp(esc(safe(term)), 'gi'), function (m) {
        return '<mark class="hit">' + m + '</mark>';
      });
      node.parentNode.replaceChild(span, node);
    });
  }

  function snippet(text, term) {
    var i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return text.slice(0, 120);
    var a = Math.max(0, i - 55), b = Math.min(text.length, i + term.length + 75);
    return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '');
  }

  function run(term, box) {
    clearMarks();
    if (!term || term.trim().length < 2) { box.classList.remove('show'); box.innerHTML = ''; return; }
    term = term.trim();
    var hits = secs.filter(function (s) { return s.text.toLowerCase().indexOf(term.toLowerCase()) > -1; });

    var html = '<h3>' + hits.length + ' section' + (hits.length === 1 ? '' : 's') +
               ' mention “' + safe(term) + '”</h3>';
    if (!hits.length) {
      html += '<p class="no-res">Nothing found. Try the words used on screen — for example “Absent Notice”, ' +
              '“Renter”, “fill rate” — or a shorter fragment such as “regist”.</p>';
    } else {
      hits.forEach(function (h) {
        var sn = safe(snippet(h.text, term)).replace(new RegExp(esc(safe(term)), 'gi'), function (m) {
          return '<mark>' + m + '</mark>';
        });
        html += '<a class="res" href="#' + h.id + '"><div class="rt">' + safe(h.label) +
                '</div><div class="rs">' + sn + '</div></a>';
      });
    }
    box.innerHTML = html;
    box.classList.add('show');
    hits.forEach(function (h) { highlight(h.el, term); });
  }

  function wire(inputId, boxId, clearId) {
    var input = document.getElementById(inputId), box = document.getElementById(boxId);
    if (!input || !box) return;
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      var v = input.value;
      if (clearId) {
        var c = document.getElementById(clearId);
        if (c) c.style.display = v ? 'block' : 'none';
      }
      t = setTimeout(function () { run(v, box); }, 160);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; run('', box); }
    });
  }
  wire('q', 'results', 'qclr');
  wire('q2', 'results2', null);

  var clr = document.getElementById('qclr');
  if (clr) clr.addEventListener('click', function () {
    var i = document.getElementById('q');
    i.value = ''; clr.style.display = 'none'; run('', document.getElementById('results')); i.focus();
  });
})();
</script>
</body>
</html>`
