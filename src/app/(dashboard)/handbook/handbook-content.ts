// The Operations Hub handbook, built to the same pattern as the HR portal
// handbook at hr.sapphireclinicseast.org/modules/handbook — masthead, sticky
// contents, module cards, connected-systems map, role playbooks, golden rules,
// help. Same structure and the same component vocabulary; Operations' own
// palette and its own modules.
//
// The contents list is WRITTEN OUT, not generated. A script-built list exists
// only in the live DOM, so it disappears from the printed copy and from anyone
// whose browser did not run it.
//
// Print and Word live in the masthead here, as they do in the HR handbook, so
// the document carries its own actions rather than depending on the page that
// frames it. Anything marked data-noexport is dropped from the Word copy.
//
// NOTE: template literal — no backticks, and no dollar immediately followed by
// a brace anywhere in the content, or the build breaks.

export const HANDBOOK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Operations Hub — User Handbook</title>
<style>
  *,*::before,*::after{box-sizing:border-box;}
  :root{
    --ink:#132A33; --body:#2E4049; --muted:#6B7C85;
    --teal:#1A7B8A; --teal-deep:#0E4C57; --teal-soft:#E3F1F3;
    --line:#D7E3E6; --line-soft:#E9F1F2;
    --paper:#F2F6F7; --card:#FFFFFF;
    --orange:#ED6823; --orange-soft:#FEF0E8;
    /* role accents, deliberately distinct from the brand teal */
    --mgr:#7E4CC4; --mgr-bg:#F1EAFB;
    --hro:#1F6FB2; --hro-bg:#E7F0F9;
    --desk:#2E8B57; --desk-bg:#E6F3EC;
    --mktg:#C2571C; --mktg-bg:#FDEDE2;
    --inv:#8A6A18; --inv-bg:#FAF2DC;
    --warn:#B7791F; --warn-bg:#FBF4E4;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
    --measure:70ch;
  }
  html{scroll-behavior:smooth;}
  body{margin:0;font-family:var(--sans);font-size:15.5px;line-height:1.62;
    color:var(--body);background:var(--paper);-webkit-font-smoothing:antialiased;}
  a{color:var(--teal);text-underline-offset:2px;}
  h1,h2,h3,h4{color:var(--ink);text-wrap:balance;line-height:1.2;margin:0;}
  p{margin:0 0 12px;}
  code{font-family:var(--mono);font-size:.86em;background:var(--teal-soft);
    color:var(--teal-deep);padding:.08em .4em;border-radius:4px;white-space:nowrap;}
  /* A named on-screen control: a button, tab, menu item, or field label. */
  kbd{font-family:var(--sans);font-size:.88em;font-weight:600;color:var(--ink);
    background:#fff;border:1px solid var(--line);border-bottom-width:2px;
    border-radius:6px;padding:.05em .45em;white-space:nowrap;}
  mark{background:#FFF1A8;color:inherit;padding:0 .1em;border-radius:3px;}

  /* ── Shell ─────────────────────────────────────── */
  .wrap{max-width:1160px;margin:0 auto;padding:0 24px;}
  .shell{display:grid;grid-template-columns:236px minmax(0,1fr);gap:52px;align-items:start;}
  @media(max-width:980px){.shell{grid-template-columns:1fr;gap:0;}}

  /* ── Masthead ─────────────────────────────────── */
  header.mast{background:
      radial-gradient(120% 140% at 100% 0%, rgba(26,123,138,.16), transparent 60%),
      linear-gradient(180deg,#0E4C57,#126673);
    color:#DCEBEE;padding:52px 0 46px;}
  .mast .wrap{display:flex;flex-direction:column;gap:18px;}
  .kicker{font-family:var(--mono);font-size:12.5px;letter-spacing:.22em;
    text-transform:uppercase;color:#7FC0C9;}
  .mast h1{color:#FFFFFF;font-size:clamp(30px,4.6vw,46px);font-weight:800;
    letter-spacing:-.02em;max-width:20ch;}
  .mast p.lede{margin:0;max-width:62ch;color:#CDE4E8;font-size:17px;}
  .mast .meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:6px;font-size:13.5px;color:#A9D0D6;}
  .mast .meta b{color:#EAF5F6;font-weight:600;}
  .mast .meta code{background:rgba(255,255,255,.12);color:#EAF5F6;}
  .mast-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;}
  .hb-btn{font-family:var(--sans);font-size:13.5px;font-weight:600;cursor:pointer;
    display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:9px;
    border:1px solid transparent;background:#EAF5F6;color:#0E4C57;transition:transform .12s,background .15s;}
  .hb-btn:hover{background:#FFFFFF;transform:translateY(-1px);}
  .hb-btn.ghost{background:rgba(255,255,255,.10);color:#EAF5F6;border-color:rgba(255,255,255,.35);}
  .hb-btn.ghost:hover{background:rgba(255,255,255,.18);}
  .hb-btn:focus-visible{outline:2px solid #FFFFFF;outline-offset:2px;}

  /* ── Body layout ──────────────────────────────── */
  main{padding:44px 0 90px;}
  nav.toc{position:sticky;top:20px;font-size:13.5px;max-height:calc(100vh - 40px);overflow:auto;}
  @media(max-width:980px){nav.toc{position:static;margin-bottom:28px;max-height:none;
    border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 16px;}}
  nav.toc .toc-h{font-family:var(--mono);font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--muted);margin:0 0 10px;}
  nav.toc ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;}
  nav.toc a{display:block;padding:5px 10px;border-radius:7px;color:var(--body);
    text-decoration:none;border-left:2px solid transparent;transition:background .15s,color .15s;}
  nav.toc a:hover{background:var(--teal-soft);color:var(--teal-deep);}
  nav.toc a.sub{padding-left:20px;font-size:12.5px;color:var(--muted);}

  section{margin-bottom:52px;scroll-margin-top:20px;}
  .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--teal);margin-bottom:8px;}
  section > h2{font-size:26px;font-weight:800;letter-spacing:-.015em;
    padding-bottom:12px;border-bottom:2px solid var(--line);margin-bottom:20px;}
  section p{max-width:var(--measure);}
  h3.blockh{font-size:18px;font-weight:700;margin:26px 0 8px;}

  /* Role badges & legend */
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
    padding:3px 9px 3px 7px;border-radius:999px;line-height:1;white-space:nowrap;}
  .badge .dot{width:14px;height:14px;border-radius:50%;color:#fff;font-size:9px;
    font-weight:800;display:grid;place-items:center;}
  .b-mgr{background:var(--mgr-bg);color:#5B2E96;}  .b-mgr .dot{background:var(--mgr);}
  .b-hr{background:var(--hro-bg);color:#154C7E;}   .b-hr .dot{background:var(--hro);}
  .b-desk{background:var(--desk-bg);color:#1F6340;} .b-desk .dot{background:var(--desk);}
  .b-mktg{background:var(--mktg-bg);color:#8C3D12;} .b-mktg .dot{background:var(--mktg);}
  .b-inv{background:var(--inv-bg);color:#6B5212;}  .b-inv .dot{background:var(--inv);}

  .legend{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0 8px;}
  @media(max-width:820px){.legend{grid-template-columns:1fr 1fr;}}
  @media(max-width:560px){.legend{grid-template-columns:1fr;}}
  .legend .rc{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:16px 16px 15px;border-top:3px solid var(--rc);}
  .legend .rc.mgr{--rc:var(--mgr);} .legend .rc.hr{--rc:var(--hro);}
  .legend .rc.desk{--rc:var(--desk);} .legend .rc.mktg{--rc:var(--mktg);}
  .legend .rc.inv{--rc:var(--inv);}
  .legend .rc h4{font-size:15.5px;margin-bottom:2px;display:flex;align-items:center;gap:8px;}
  .legend .rc .who{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-bottom:9px;}
  .legend .rc p{font-size:13.5px;margin:0;color:var(--body);}

  /* Module cards */
  .cards{display:flex;flex-direction:column;gap:16px;}
  .mod{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px 22px;scroll-margin-top:20px;}
  .mod-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;margin-bottom:4px;}
  .mod-top h3{font-size:17.5px;font-weight:750;}
  .mod-top .loc{font-family:var(--mono);font-size:12px;color:var(--muted);}
  .mod-roles{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px;}
  .mod .desc{max-width:var(--measure);margin:0 0 4px;}
  .mod ul{margin:8px 0 0;padding-left:0;list-style:none;max-width:var(--measure);
    display:flex;flex-direction:column;gap:7px;}
  .mod ul li{position:relative;padding-left:22px;font-size:14.5px;}
  .mod ul li::before{content:"";position:absolute;left:4px;top:9px;width:6px;height:6px;
    border-radius:50%;background:var(--teal);}
  .mod .note{margin-top:12px;font-size:13.5px;background:var(--teal-soft);border-radius:9px;
    padding:10px 13px;color:var(--teal-deep);max-width:var(--measure);}
  .mod .note b{color:var(--teal-deep);}
  .mod .note.care{background:var(--warn-bg);color:#6F4A0F;}
  .mod h4{font-size:14px;font-weight:700;margin:16px 0 6px;color:var(--ink);
    display:flex;align-items:center;gap:8px;}
  .mod h4 .tag{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--muted);font-weight:600;}
  .mod ol.steps{margin:6px 0 0;padding-left:0;counter-reset:s;list-style:none;
    display:flex;flex-direction:column;gap:8px;max-width:var(--measure);}
  .mod ol.steps li{position:relative;padding-left:32px;counter-increment:s;font-size:14.5px;}
  .mod ol.steps li::before{content:counter(s);position:absolute;left:0;top:1px;
    width:21px;height:21px;border-radius:50%;background:var(--teal);color:#fff;
    font-size:11.5px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
  .fields{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 4px;max-width:var(--measure);}
  .fields td{padding:6px 10px 6px 0;border-bottom:1px solid var(--line-soft);vertical-align:top;}
  .fields td:first-child{font-weight:600;color:var(--ink);width:34%;}
  .fields tr:last-child td{border-bottom:none;}

  .grouphead{font-size:13px;font-family:var(--mono);letter-spacing:.12em;text-transform:uppercase;
    color:var(--muted);margin:30px 0 12px;display:flex;align-items:center;gap:12px;scroll-margin-top:20px;}
  .grouphead::after{content:"";flex:1;height:1px;background:var(--line);}

  /* Connected systems */
  .hubwrap{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px;margin:6px 0 22px;overflow-x:auto;}
  .hubwrap svg{display:block;margin:0 auto;max-width:100%;height:auto;}
  .hub-legend{text-align:center;font-size:12px;color:var(--muted);margin-top:6px;}
  .hub-legend b{color:var(--body);font-weight:600;}
  .conn{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px 22px;margin-bottom:16px;}
  .conn-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;margin-bottom:4px;}
  .conn-head h3{font-size:17.5px;font-weight:750;}
  .conn-head .loc{font-family:var(--mono);font-size:12px;color:var(--muted);}
  .flowgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;}
  @media(max-width:620px){.flowgrid{grid-template-columns:1fr;}}
  .flowcol{border-radius:10px;padding:12px 14px 13px;border:1px solid var(--line-soft);}
  .flowcol.supplies{background:#EAF4EF;border-color:#CBE5D8;}
  .flowcol.receives{background:#EAF0F8;border-color:#CFDDF0;}
  .flow-lbl{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;
    font-weight:700;margin-bottom:8px;}
  .flowcol.supplies .flow-lbl{color:#1F6340;}
  .flowcol.receives .flow-lbl{color:#154C7E;}
  .flowcol ul{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:8px;}
  .flowcol li{font-size:13px;line-height:1.5;position:relative;padding-left:15px;}
  .flowcol li::before{content:"";position:absolute;left:1px;top:8px;width:5px;height:5px;border-radius:50%;}
  .flowcol.supplies li::before{background:#2E8B57;}
  .flowcol.receives li::before{background:#1F6FB2;}
  .flownone{font-size:13px;color:var(--muted);font-style:italic;}

  /* Callouts */
  .call{border-radius:12px;padding:15px 18px;margin:18px 0;max-width:var(--measure);
    font-size:14.5px;border:1px solid var(--line-soft);}
  .call b{color:var(--ink);}
  .call.rule{background:var(--warn-bg);border-color:#EAD9AE;}
  .call.rule .lbl{color:var(--warn);}
  .call.tip{background:var(--teal-soft);border-color:#BFDBD5;}
  .call.tip .lbl{color:var(--teal-deep);}
  .call .lbl{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
    display:block;margin-bottom:5px;font-weight:700;}

  /* Playbooks */
  .play{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px 22px;margin-bottom:16px;border-left:4px solid var(--pc);}
  .play.mgr{--pc:var(--mgr);} .play.hr{--pc:var(--hro);} .play.desk{--pc:var(--desk);}
  .play.mktg{--pc:var(--mktg);} .play.inv{--pc:var(--inv);}
  .play h3{font-size:16.5px;display:flex;align-items:center;gap:9px;margin-bottom:12px;}
  .play ol{margin:0;padding-left:0;counter-reset:s;list-style:none;display:flex;
    flex-direction:column;gap:9px;max-width:var(--measure);}
  .play ol li{position:relative;padding-left:34px;counter-increment:s;font-size:14.5px;}
  .play ol li::before{content:counter(s);position:absolute;left:0;top:-1px;width:22px;height:22px;
    border-radius:50%;background:var(--pc);color:#fff;font-size:12px;font-weight:700;
    display:grid;place-items:center;font-variant-numeric:tabular-nums;}

  /* Tables */
  .tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:8px;}
  table.access{border-collapse:collapse;width:100%;font-size:13.5px;min-width:560px;}
  table.access th{background:var(--teal-deep);color:#DCEBEE;text-align:left;padding:9px 12px;
    font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;}
  table.access td{padding:8px 12px;border-bottom:1px solid var(--line-soft);}
  table.access tr:last-child td{border-bottom:none;}
  table.access td:first-child{font-weight:600;color:var(--ink);}
  .y{color:#1F6340;font-weight:700;} .n{color:#9AA7AD;} .p{color:#8C3D12;font-weight:600;}

  /* FAQ + search */
  .faq details{background:var(--card);border:1px solid var(--line);border-radius:11px;
    margin-bottom:8px;overflow:hidden;}
  .faq summary{cursor:pointer;padding:13px 16px;font-weight:650;color:var(--ink);font-size:14.5px;
    list-style:none;display:flex;justify-content:space-between;gap:12px;}
  .faq summary::-webkit-details-marker{display:none;}
  .faq summary::after{content:"+";color:var(--teal);font-weight:800;}
  .faq details[open] summary::after{content:"\\2013";}
  .faq details[open] summary{border-bottom:1px solid var(--line-soft);}
  .faq .a{padding:13px 16px;font-size:14px;}
  .faq .a p{margin:0 0 8px;max-width:var(--measure);} .faq .a p:last-child{margin:0;}
  .hb-search{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;}
  .hb-search label{display:block;font-weight:650;color:var(--ink);font-size:14.5px;margin-bottom:8px;}
  .hb-search input{width:100%;max-width:520px;padding:10px 13px;border:1px solid var(--line);
    border-radius:9px;font-family:inherit;font-size:14.5px;color:var(--ink);background:var(--paper);}
  .hb-search input:focus{outline:2px solid var(--teal);outline-offset:1px;}
  .hb-search .hint{font-size:13px;color:var(--muted);margin:8px 0 0;}
  .sr-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}
  .sr-list li a{display:block;padding:10px 12px;border-radius:9px;border:1px solid var(--line-soft);
    text-decoration:none;color:var(--body);background:var(--paper);}
  .sr-list li a:hover{border-color:var(--teal);background:var(--teal-soft);}
  .sr-list .where{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;
    color:var(--teal-deep);display:block;margin-bottom:3px;}
  .sr-list .snip{font-size:13.5px;line-height:1.5;}
  .sr-empty{font-size:13.5px;color:var(--muted);margin-top:12px;}

  footer{border-top:1px solid var(--line);padding:26px 0 40px;color:var(--muted);font-size:13px;}
  footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;}

  @media(prefers-reduced-motion:reduce){*{transition:none!important;}}
  @media print{
    body{background:#fff;font-size:11.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    header.mast{background:#0E4C57!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    nav.toc,.mast-actions,.hb-search{display:none!important;} .shell{grid-template-columns:1fr;}
    .mod,.play,.legend .rc,.conn,.hubwrap,.call,.tablewrap,.faq details{break-inside:avoid;}
    .faq details{padding-bottom:0;} .faq details:not([open]) .a{display:block;}
    section{margin-bottom:26px;}
    a{text-decoration:none;color:inherit;}
  }
</style>
</head>
<body>
<header class="mast">
  <div class="wrap">
    <span class="kicker">Operations Hub &middot; User Handbook</span>
    <h1>How to Use the Sapphire Operations Hub</h1>
    <p class="lede">One system for patients, scheduling, decking, surveys and marketing — built so a clinic manager,
      an HR officer, the front desk, marketing and an investor each see exactly what they need. This handbook is a
      step-by-step guide: it assumes you have never opened the Hub before, and it walks through every screen, every
      tab, and every button.</p>
    <div class="meta">
      <span>Address: <code>operations.sapphireclinicseast.org</code></span>
      <span>Sign in with your <b>work email &amp; password</b></span>
      <span>Audience: <b>Clinic Managers &middot; HR &middot; Front Desk &middot; Marketing &middot; Investors</b></span>
    </div>
    <div class="mast-actions" data-noexport>
      <button type="button" class="hb-btn" onclick="window.print()">&#128424;&nbsp; Save as PDF</button>
      <button type="button" class="hb-btn ghost" onclick="downloadHandbookWord()">&#11015;&nbsp; Download as Word</button>
      <a class="hb-btn ghost" href="#search" style="text-decoration:none;">&#128269;&nbsp; Search this handbook</a>
    </div>
  </div>
</header>

<main class="wrap">
<div class="shell">

  <nav class="toc" aria-label="Contents" data-noexport>
    <p class="toc-h">Contents</p>
    <ol>
      <li><a href="#start">1 &middot; Getting started</a></li>
      <li><a href="#s-signin" class="sub">Signing in</a></li>
      <li><a href="#s-home" class="sub">Your home screen</a></li>
      <li><a href="#s-nav" class="sub">Moving around</a></li>
      <li><a href="#s-controls" class="sub">Controls you will meet everywhere</a></li>
      <li><a href="#roles">2 &middot; Know your role</a></li>
      <li><a href="#access" class="sub">Who sees what</a></li>
      <li><a href="#modules">3 &middot; The modules, step by step</a></li>
      <li><a href="#g-patients" class="sub">Patients &amp; records</a></li>
      <li><a href="#g-clinic" class="sub">Running the clinic day</a></li>
      <li><a href="#g-capacity" class="sub">Capacity &amp; analysis</a></li>
      <li><a href="#g-relations" class="sub">Relationships &amp; quality</a></li>
      <li><a href="#g-mktg" class="sub">Social &amp; marketing</a></li>
      <li><a href="#g-setup" class="sub">Settings &amp; access</a></li>
      <li><a href="#connect">4 &middot; Connected systems</a></li>
      <li><a href="#play">5 &middot; Role playbooks</a></li>
      <li><a href="#rules">6 &middot; Golden rules</a></li>
      <li><a href="#help">7 &middot; Help</a></li>
      <li><a href="#faq" class="sub">FAQ</a></li>
      <li><a href="#search" class="sub">Word search</a></li>
    </ol>
  </nav>

  <div class="content">

    <!-- ══ 1 ══ -->
    <section id="start">
      <p class="eyebrow">Section 1</p>
      <h2>Getting started</h2>
      <p>Read this section once. Everything after it assumes you know what is in it.</p>

      <h3 class="blockh" id="s-signin">Signing in</h3>
      <p>Go to <code>operations.sapphireclinicseast.org</code> and sign in with your work email and password.
        Accounts are created by a Clinic Manager under <kbd>Settings</kbd> &rsaquo; <kbd>Team</kbd> — if your email is
        refused, yours has probably not been made yet.</p>
      <div class="call tip"><span class="lbl">Tip</span>
        Your account already knows your role and your branch. There is nothing to choose at sign-in, and nothing to set up.</div>

      <h3 class="blockh" id="s-home">Your home screen</h3>
      <p>You land on the <b>Home Dashboard</b>: a summary of today across the clinic. Nothing on it is editable,
        so it is a safe place to look around. Each card is a link — click one to open the module it came from,
        already filtered to today.</p>

      <h3 class="blockh" id="s-nav">Moving around</h3>
      <ul class="mod-nav-list">
      </ul>
      <table class="fields">
        <tr><td>Left menu</td><td>Grouped by job: <b>Home</b>, <b>Social &amp; Marketing</b>, <b>Patients</b>,
          <b>Clinic Tools</b>, <b>Settings</b>. A group with a chevron expands when clicked; your current page is highlighted.</td></tr>
        <tr><td>Brand switcher</td><td>Top-left, above the menu. Changes which social accounts and templates you work
          with. It does <b>not</b> change clinic data.</td></tr>
        <tr><td>Branch tabs</td><td>Inside a module, <kbd>East Branch</kbd> and <kbd>Greenhills Branch</kbd>. The active
          one is filled dark. Nearly every figure on the page obeys this tab.</td></tr>
        <tr><td>Saving</td><td>There is no global Save. Each panel saves itself with its own button and confirms at the
          bottom of the screen. No message means nothing saved.</td></tr>
      </table>
      <div class="call rule"><span class="lbl">Check this first</span>
        When a number looks wrong, the cause is almost always the <b>branch tab</b>, a <b>date range</b> left over from
        last time, or a <b>department filter</b> still set. Check those three before reporting a fault.</div>

      <h3 class="blockh" id="s-controls">Controls you will meet everywhere</h3>
      <p>These behave identically in every module, so they are explained once here rather than repeated.</p>
      <table class="fields">
        <tr><td>Filter row</td><td>Dropdowns above a table — Department, Status, dates. They combine: two set means rows
          matching both.</td></tr>
        <tr><td>Tick-list dropdown</td><td>A dropdown of checkboxes rather than one choice. Tick several values to see
          all of them; click outside to close.</td></tr>
        <tr><td>Filter by name</td><td>A free-text box that narrows the list as you type. Clear it to see everything.</td></tr>
        <tr><td>From / To dates</td><td>Both inclusive. A range left wide is the usual reason a page feels slow.</td></tr>
        <tr><td>Column headers</td><td>Click to sort, click again to reverse.</td></tr>
        <tr><td>Pencil icon</td><td>Edit in place — opens the row as a form.</td></tr>
        <tr><td>Bin icon</td><td>Delete. Always asks first. Red means it cannot be undone.</td></tr>
        <tr><td>Envelope / speech bubble</td><td>Email or text that one person.</td></tr>
        <tr><td>Greyed-out button</td><td>Unavailable. Hover it — the tooltip says why.</td></tr>
      </table>
      <div class="call tip"><span class="lbl">Rule of thumb</span>
        Teal buttons make something happen. White buttons change what you are looking at. Red buttons destroy something.</div>
    </section>

    <!-- ══ 2 ══ -->
    <section id="roles">
      <p class="eyebrow">Section 2</p>
      <h2>Know your role</h2>
      <p>Every account has exactly one of five roles. Your role decides which modules appear in the left menu and what
        you may do in them. If a module named in this handbook is missing from your menu, your role does not include
        it — nothing is hidden by accident.</p>

      <div class="legend">
        <div class="rc mgr"><h4><span class="badge b-mgr"><span class="dot">M</span>Clinic Manager</span></h4>
          <div class="who">ADMIN</div>
          <p>Everything, both branches, plus <b>Team</b> — the only role that can create user accounts.</p></div>
        <div class="rc hr"><h4><span class="badge b-hr"><span class="dot">H</span>HR Officer</span></h4>
          <div class="who">AHEA_ADMIN &middot; AHGH_ADMIN</div>
          <p>As Clinic Manager, except managing user accounts. Tied to one branch in the scheduling tools.</p></div>
        <div class="rc desk"><h4><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></h4>
          <div class="who">AHEA_FRONT_DESK &middot; AHGH_FRONT_DESK</div>
          <p>Clinic Tools only — no social, email or analytics. Locked to one branch.</p></div>
        <div class="rc mktg"><h4><span class="badge b-mktg"><span class="dot">K</span>Marketing Admin</span></h4>
          <div class="who">MARKETING_ADMIN</div>
          <p>Full marketing suite plus patient analytics and staff tools. No Clinic Schedule, Decking or Patient Relationship.</p></div>
        <div class="rc inv"><h4><span class="badge b-inv"><span class="dot">I</span>Investor</span></h4>
          <div class="who">INVESTOR</div>
          <p>Two read-only pages. No patient identities at all, and therapist names shown as initials.</p></div>
      </div>

      <div class="call rule"><span class="lbl">Branch lock</span>
        A Front Desk account only ever sees its own branch — an East account cannot open Greenhills data. Where this
        handbook says &ldquo;switch branch&rdquo;, that applies to Clinic Manager and HR Officer accounts.</div>

      <h3 class="blockh" id="access">Who sees what</h3>
      <div class="tablewrap">
        <table class="access">
          <thead><tr><th>Module</th><th>Clinic Mgr</th><th>HR Officer</th><th>Front Desk</th><th>Marketing</th><th>Investor</th></tr></thead>
          <tbody>
            <tr><td>Home Dashboard</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Patient CRM / Profile</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Patient Dashboard</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="y">Yes</td><td class="p">Read-only, masked</td></tr>
            <tr><td>Staff Module</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Queueing</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>Clinic Schedule</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>Clinic Utilization</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>Customer Survey</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="p">Satisfaction only</td><td class="p">Satisfaction only, masked</td></tr>
            <tr><td>Registration Forms</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Decking Module</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>LOA Submission</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>Patient Relationship</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td></tr>
            <tr><td>Peer Evaluation</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Partner Institutions</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Social / Templates / Email / SMS</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Connected Accounts</td><td class="y">Yes</td><td class="y">Yes</td><td class="n">—</td><td class="y">Yes</td><td class="n">—</td></tr>
            <tr><td>Team</td><td class="y">Yes</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td></tr>
          </tbody>
        </table>
      </div>
      <div class="call tip"><span class="lbl">Note</span>
        Branch lock sits on top of this table. A Front Desk account with <b>Yes</b> still sees only its own branch.
        Investor accounts span both branches but see no names.</div>
    </section>
    <!-- SECTION 3 -->
    <section id="modules">
      <p class="eyebrow">Section 3</p>
      <h2>The modules, step by step</h2>
      <p>Every module you can open, in the order they appear in the left menu. Each card says where it lives, who may
        use it, what you will see, and what to do in order.</p>

      <div class="grouphead" id="g-patients">Patients &amp; records</div>
      <div class="cards">

        <div class="mod" id="m-dashboard">
          <div class="mod-top"><h3>Home Dashboard</h3><span class="loc">/dashboard</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">The landing page &mdash; a summary of today across the clinic. Read-only.</p>
          <h4>Step by step</h4>
          <ol class="steps">
            <li>Check the branch tab first. Every figure below it belongs to that branch.</li>
            <li>Read the cards across the top: today's sessions, patients in the queue, open slots.</li>
            <li>Click any card to open the module it came from, already filtered to today.</li>
          </ol>
        </div>

        <div class="mod" id="m-crm">
          <div class="mod-top"><h3>Patient CRM</h3><span class="loc">/patients</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">The master list of every patient. If somebody is not here they do not exist anywhere else in
            the Hub &mdash; no schedule, no queue entry, no survey.</p>
          <h4>Finding one person <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Type any part of the name into the search box &mdash; it matches first and last name.</li>
            <li>Narrow with <kbd>All Branches</kbd>, <kbd>All Types</kbd> (Pediatric / Adult) and the indicator filters.</li>
            <li>Click the row to open the full record.</li>
          </ol>
          <h4>Reading the indicators <span class="tag">What you will see</span></h4>
          <table class="fields">
            <tr><td>Star</td><td>Filipino-Chinese, identified from the surname &mdash; used for greetings and campaign targeting.</td></tr>
            <tr><td>ID on file</td><td>A PWD or Senior ID photo is held, so the discount can be applied.</td></tr>
            <tr><td>Referral on file</td><td>A doctor referral document has been uploaded.</td></tr>
            <tr><td>Existing in DB</td><td>They already had a record when they submitted a form.</td></tr>
            <tr><td>Email Newsletter</td><td>They consented to marketing email. Campaigns go only to these.</td></tr>
          </table>
          <h4>Getting patients in</h4>
          <ul>
            <li><b>They register themselves</b> &mdash; <kbd>Patient Registration QR</kbd> prints a code for the counter.</li>
            <li><b>A registration form</b> &mdash; submissions arrive in Registration Forms and are converted.</li>
            <li><b>Front desk adds them</b> &mdash; during walk-in booking in Queueing.</li>
          </ul>
          <div class="note care"><b>Always search before creating.</b> Two records for one child split the history in
            half, and neither one looks wrong on its own.</div>
        </div>

        <div class="mod" id="m-profile">
          <div class="mod-top"><h3>Patient Profile</h3><span class="loc">/patients/profile</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">One patient, everything about them, on a single page.</p>
          <h4>What you will see</h4>
          <table class="fields">
            <tr><td>Details</td><td>Name, birthday, sex, contact numbers, address, branch.</td></tr>
            <tr><td>Documents</td><td>Doctor referral and PWD/Senior ID &mdash; uploaded, or photographed at the counter.</td></tr>
            <tr><td>Session history</td><td>Every appointment with its status.</td></tr>
            <tr><td>Discount flags</td><td>What they are entitled to, and the proof held.</td></tr>
          </table>
          <h4>Editing <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Click the pencil beside the field group you want to change.</li>
            <li>Change the fields and press <kbd>Save</kbd>.</li>
            <li>Wait for the confirmation before leaving the page.</li>
          </ol>
          <div class="note care"><b>Birthdays matter.</b> The date of birth drives automatic birthday greetings and
            decides Pediatric versus Adult. A wrong one greets a real family on the wrong day.</div>
        </div>

        <div class="mod" id="m-pdash">
          <div class="mod-top"><h3>Patient Dashboard</h3><span class="loc">/patients/dashboard</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span><span class="badge b-inv"><span class="dot">I</span>Investor</span></div>
          <p class="desc">Patient numbers as charts &mdash; who they are and where they come from. Read-only.</p>
          <ul>
            <li><b>Age and sex</b> &mdash; stacked bars, Female / Male / Other.</li>
            <li><b>Growth</b> &mdash; new patients over time.</li>
            <li><b>Source</b> &mdash; how they found the clinic.</li>
            <li><b>Customer Satisfaction</b> &mdash; therapist leaderboard and positive feedback.</li>
          </ul>
          <div class="note">Set the branch tab and date range at the top; every chart follows them. Hover a bar to read
            the exact figure rather than estimating from the axis.</div>
        </div>

        <div class="mod" id="m-selfreg">
          <div class="mod-top"><h3>Patient self-registration</h3><span class="loc">/patient-register</span></div>
          <div class="mod-roles"><span class="badge b-desk"><span class="dot">P</span>Public page &mdash; no sign-in</span></div>
          <p class="desc">The form a family fills in themselves, on their phone or a tablet at the counter. Reachable by
            QR code from Patient CRM.</p>
          <h4>What the family fills in <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Patient and guardian details, contact number, address.</li>
            <li><b>Branch</b> &mdash; Aura Health East, Aura Health Greenhills, or Verdana Rehab Store.</li>
            <li><b>Partner school tickbox</b> &mdash; ticking it reveals a dropdown of partner schools. That list is
              maintained in <b>Registration Forms &rsaquo; Settings</b>.</li>
            <li><b>Doctor's Referral</b> &mdash; they start typing the referring doctor and matching names appear, read
              live from Accounting Hub. If their doctor is not listed they simply type the name.</li>
            <li><b>Documents</b> &mdash; <kbd>Choose file</kbd> to upload, or <kbd>Take a photo</kbd> to use the camera.</li>
          </ol>
          <div class="note"><b>At the counter,</b> Take a photo is faster and cleaner than a family emailing a scan
            later &mdash; the photo attaches to the record immediately.</div>
          <div class="note care"><b>Three characters minimum.</b> Doctor suggestions appear only after three letters of
            the name itself; the honorific does not count, so "dr. a" shows nothing and "dr. aid" shows the match.
            That is deliberate &mdash; it stops the referrer list being harvested from a public page.</div>
        </div>
      </div>

      <div class="grouphead" id="g-clinic">Running the clinic day</div>
      <div class="cards">

        <div class="mod" id="m-staff">
          <div class="mod-top"><h3>Staff Module</h3><span class="loc">/staff</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">The clinician roster. Everything here comes from HR Hub &mdash; this is a mirror, not the original.</p>
          <div class="note care"><b>You cannot add or delete staff here.</b> Names, departments, branches, job titles,
            employment type and contact details are owned by HR Hub. Change them there and re-sync. Only a few
            Operations-owned fields (extra branches, sex) are editable here, and the sync deliberately leaves those alone.</div>
          <h4>Reading a row <span class="tag">What you will see</span></h4>
          <table class="fields">
            <tr><td>Branch</td><td><b>AHEA</b> is East, <b>AHGH</b> is Greenhills.</td></tr>
            <tr><td>Also at Branch</td><td>Extra branches an interbranch consultant covers.</td></tr>
            <tr><td>Employment</td><td>Employee, Consultant, Intern or Renter.</td></tr>
          </table>
          <h4>Employment types, and what each changes</h4>
          <table class="fields">
            <tr><td>Employee</td><td>Salaried. Appears everywhere normally.</td></tr>
            <tr><td>Consultant</td><td>Paid per session. Appears everywhere normally.</td></tr>
            <tr><td>Intern</td><td>Kept out of the bookable clinician lists; picked separately as a supervised intern on
              a session, and only while their internship dates are current.</td></tr>
            <tr><td>Renter</td><td>Not paid by us at all &mdash; they pay the clinic a monthly facility fee and bring
              their own private clients. Book and queue them normally, but the clinic does not message their patients,
              so the reminder buttons in Clinic Schedule are switched off for them.</td></tr>
          </table>
          <h4>Syncing from HR <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Change the person in HR Hub first and save there.</li>
            <li>Come back to Staff Module and run the sync.</li>
            <li>Check the row updated. A leaver should now read as inactive rather than disappearing.</li>
          </ol>
          <div class="note"><b>Leavers are deactivated, never deleted.</b> Deleting would take their whole appointment
            history with them. An inactive person drops off the boards and pickers; their past sessions stay intact.</div>
        </div>

        <div class="mod" id="m-queue">
          <div class="mod-top"><h3>Queueing</h3><span class="loc">/queueing</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">The live waiting room: who has arrived, who is in session, and what the TV screen shows.</p>
          <h4>Booking a walk-in <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Press <kbd>Search Existing Patient</kbd> first &mdash; most walk-ins already have a record. Use
              <kbd>New Patient</kbd> only if they genuinely do not.</li>
            <li>For a new patient fill in name, <kbd>Date of Birth</kbd>, <kbd>Sex</kbd>, <kbd>Email</kbd>,
              <kbd>Address / Barangay</kbd> and <kbd>Diagnosis</kbd>.</li>
            <li>Choose <kbd>Clinician</kbd>, <kbd>Date</kbd>, <kbd>Start Time</kbd> and <kbd>Duration</kbd> &mdash;
              <kbd>End Time</kbd> fills itself. Pick <kbd>Custom</kbd> for an unusual length.</li>
            <li>Set <kbd>Session Type</kbd>, and <kbd>Select Intern</kbd> if a student is sitting in.</li>
            <li>Save. The patient joins the queue and appears on the TV screen.</li>
          </ol>
          <h4>Moving people through</h4>
          <p>A patient moves <b>Pending</b> &rarr; <b>Confirmed</b> as they arrive and are seen. Change the status on
            their row; the TV display follows within seconds.</p>
          <h4>The TV display</h4>
          <table class="fields">
            <tr><td>Upload Ad</td><td>Adds a picture or video to the rotation between queue screens. Use portrait images
              sized for the screen or they letterbox.</td></tr>
            <tr><td>Leaderboard</td><td>Shows the clinician satisfaction leaderboard on the TV, alternating with ads.</td></tr>
          </table>
          <div class="note care"><b>The leaderboard is public.</b> Anyone in the waiting room can read it, including the
            families of the clinicians on it. Turn it on deliberately, not by accident.</div>
        </div>

        <div class="mod" id="m-schedule">
          <div class="mod-top"><h3>Clinic Schedule</h3><span class="loc">/clinic-schedule</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">Individual appointments: booking them, changing them, and telling people about them. The
            module front desk spends the most time in.</p>
          <h4>Four views of the same day <span class="tag">Tabs</span></h4>
          <table class="fields">
            <tr><td>Department View</td><td>The default. One card per clinician, grouped by department. Where you book,
              edit and send reminders.</td></tr>
            <tr><td>Calendar View</td><td>The shape of a week rather than a list of a day.</td></tr>
            <tr><td>Daily View</td><td>One day as a time-ordered list &mdash; good for printing a day sheet.</td></tr>
            <tr><td>Status View</td><td>Chasing attendance: Pending, Confirmed, Cancelled, No-Show, Rescheduled.</td></tr>
          </table>
          <h4>Booking a session <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Set the branch tab and the date.</li>
            <li>Find the clinician's card and click to expand. Narrow a long list with <kbd>All Departments</kbd> /
              <kbd>All Staff</kbd>.</li>
            <li>Press the add button on that card.</li>
            <li>Choose <kbd>Patient</kbd>, <kbd>Start Time</kbd>, <kbd>Duration</kbd> and <kbd>Session Type</kbd>.
              <kbd>Mode</kbd> sets in-clinic or teletherapy.</li>
            <li>If a student attends, use <kbd>Select Intern</kbd> &mdash; only interns whose dates are current appear.</li>
            <li>If a mentor sits in, tick <kbd>With Mentor</kbd> and pick them.</li>
            <li>Save. The session appears on the card, in the queue, and on the clinician's own portal.</li>
          </ol>
          <h4>Telling people about it <span class="tag">Buttons</span></h4>
          <table class="fields">
            <tr><td>Envelope on a row</td><td>Email that one patient. Shown only if they have an email address.</td></tr>
            <tr><td>Speech bubble on a row</td><td>Text that one patient. Viber where possible, otherwise SMS.</td></tr>
            <tr><td>Email All Patients</td><td>Every patient on that clinician's list for that day.</td></tr>
            <tr><td>Text All Patients</td><td>The same, by text.</td></tr>
            <tr><td>Text / Email: Clinician Absent Notice</td><td>Tells every patient booked with that clinician today
              that the session is off. Red, because families act on it immediately.</td></tr>
            <tr><td>Text / Email Clinician</td><td>Sends the clinician their own schedule for the day.</td></tr>
          </table>
          <div class="note care"><b>These leave the building.</b> Absent notices reach real families within seconds and
            cannot be recalled. Check the branch tab, the date and the clinician before pressing one.</div>
          <div class="note"><b>Greyed-out reminder buttons</b> mean either the clinician has no mobile number on file,
            or they are a <b>Renter</b> &mdash; renters look after their own private clients, so the clinic does not
            message their patients. Hover the button; the tooltip says which.</div>
          <h4>Make-up sessions</h4>
          <p>Lists clinicians not normally on tomorrow but covering. Add one here and they appear alongside the regular
            list for that day only.</p>
        </div>

        <div class="mod" id="m-loa">
          <div class="mod-top"><h3>LOA Submission</h3><span class="loc">/loa-submissions</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">Letters of Authorization from HMOs &mdash; submitted by families through a public form, then
            worked here.</p>
          <h4>Working the queue <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Filter with <kbd>All branches</kbd>, <kbd>All HMOs</kbd> and <kbd>Any status</kbd>.</li>
            <li>Open a submission and check the uploaded letter against the patient record.</li>
            <li>Match it to the patient in <b>Patient CRM</b> &mdash; the search here matches on name.</li>
            <li>Set the status. <kbd>Not yet</kbd> marks one still waiting on the HMO.</li>
          </ol>
          <div class="note"><kbd>LOA form</kbd> opens the public form as a family sees it; <kbd>LOA form settings</kbd>
            controls what it asks. The HMO list mirrors the POS digital wallets, so an HMO added there appears here
            without being typed twice.</div>
        </div>
      </div>

      <div class="grouphead" id="g-capacity">Capacity &amp; analysis</div>
      <div class="cards">

        <div class="mod" id="m-decking">
          <div class="mod-top"><h3>Decking Module</h3><span class="loc">/decking</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">The weekly grid of who is available and which hours are sold. Clinic Schedule books one
            appointment on one date; Decking is the repeating shape of the week behind it.</p>
          <h4>Two cards, two jobs <span class="tag">Chips</span></h4>
          <p>The chips at the top sit in two cards, and the split is the point: the left card is where the week gets
            filled in, the right card reads the same slots back as a report. Hover any chip for its description.</p>
          <table class="fields">
            <tr><td>On-site</td><td>Consultants seeing patients in clinic.</td></tr>
            <tr><td>Teletherapy</td><td>Consultants running remote sessions.</td></tr>
            <tr><td>Homecare</td><td>Consultants travelling to patients.</td></tr>
            <tr><td>SPED Class</td><td>One board for the branch rather than a grid per consultant, because SPED runs
              classes &mdash; many children in a block, blocks longer than an hour.</td></tr>
            <tr><td>All</td><td>Every consultant however they are tagged. Use this when someone is missing from the
              section you expected.</td></tr>
            <tr><td>Per Day</td><td>Weekly totals by day across all departments, for setting a daily target.</td></tr>
            <tr><td>Interdepartment</td><td>Patients already seeing more than one department, and those who could be.</td></tr>
            <tr><td>History</td><td>Filled and open slots over time, per department.</td></tr>
          </table>
          <div class="note"><b>Why somebody appears twice:</b> a consultant tagged "On-site + Teletherapy" genuinely
            appears under both. Two roles, not a mistake and not a third category.</div>
          <h4>Booking a slot <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Pick the branch tab, then a section chip, then a department chip.</li>
            <li>Find the consultant's column and the hour. Use <kbd>Filter by name</kbd> if the board is wide.</li>
            <li>Click the empty cell and choose the patient.</li>
            <li>Set how it is paid: <kbd>Cash</kbd>, <kbd>HMO</kbd> or <kbd>Guarantee Letter</kbd>.</li>
            <li>Save. The cell fills with the patient's name.</li>
          </ol>
          <h4>Reading the cells <span class="tag">What you will see</span></h4>
          <table class="fields">
            <tr><td>Named cell</td><td>Booked &mdash; the patient is in that hour.</td></tr>
            <tr><td>Empty cell</td><td>Open, available to sell.</td></tr>
            <tr><td>Greyed cell</td><td>Unavailable &mdash; outside the consultant's hours, or deliberately blocked.</td></tr>
            <tr><td>Slots card</td><td>Total / Booked / Open, each percentage stated as a share <b>of total</b>, and the
              tile says so.</td></tr>
          </table>
          <h4>Working Hours and Settings</h4>
          <p>Hours are set per branch <i>and</i> per service. <kbd>Use clinic default hours</kbd> adopts the standard
            day; untick it to set a <kbd>Start Time</kbd> and <kbd>End Time</kbd> of their own. Because hours are per
            service, one consultant can be on-site Thursdays at one branch and teletherapy Tuesdays at the other
            &mdash; enter those as separate rows rather than describing both in one.</p>
          <h4>SPED Class board</h4>
          <p>Switch between <kbd>Day</kbd> and <kbd>Week</kbd>. The weekly view lays overlapping classes side by side,
            so you can see how many groups share the clinic at once and plan the spacing. Adding or removing a child
            updates in place without reloading.</p>
          <h4>History</h4>
          <p>Two panels sharing one date axis &mdash; <b>Filled</b> in green above, <b>Open</b> in gold below. Each
            panel is zoomed to its own range so a change of two or three slots is visible; read the numbers on the left
            rather than judging by the height of the line. Hovering either panel reads both at that date.</p>
          <div class="note care"><b>The chart does not reach "Slots offered".</b> Blocked hours are counted in that tile
            but deliberately not drawn, so the top of the chart sits below it. <b>Fill rate</b> is filled divided by
            (filled + open) &mdash; of what could be sold, how much was.</div>
          <div class="note"><b>History starts at the first reading.</b> The board is a weekly template holding no dates,
            so earlier days genuinely cannot be reconstructed. The page says where history begins rather than drawing a
            flat line through a past it does not have.</div>
        </div>

        <div class="mod" id="m-util">
          <div class="mod-top"><h3>Clinic Utilization</h3><span class="loc">/scheduling-dashboard</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span></div>
          <p class="desc">How full the clinic is, as charts &mdash; the management view of what front desk books.</p>
          <h4>What each chart answers</h4>
          <table class="fields">
            <tr><td>Slot Utilization</td><td>Of the hours consultants offered, how many were sold.</td></tr>
            <tr><td>Clinic Utilization Rate Over Time</td><td>The same figure tracked across the range.</td></tr>
            <tr><td>Total Number of Sessions Over Time</td><td>Volume rather than fullness. A clinic can be busier and
              emptier at once if capacity grew faster.</td></tr>
            <tr><td>Therapist</td><td>The same broken down per clinician.</td></tr>
          </table>
          <h4>Comparing both branches side by side <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Set <kbd>Start Date</kbd> and <kbd>End Date</kbd>.</li>
            <li>Switch the branch selector to the comparison view.</li>
            <li>Both branches render in one panel on the same scale, so the difference is read directly rather than by
              flipping tabs and remembering.</li>
          </ol>
          <div class="note">Where both are genuinely close the page says <b>Both branches level on utilization</b>
            rather than inviting you to read a difference that is not there.
            <b>Dashboard Settings</b> sets the capacity assumptions behind every percentage &mdash; a management
            decision, not a display preference.</div>
        </div>
      </div>

      <div class="grouphead" id="g-relations">Relationships &amp; quality</div>
      <div class="cards">

        <div class="mod" id="m-prel">
          <div class="mod-top"><h3>Patient Relationship</h3><span class="loc">/patient-relationship</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">The people who are not currently in a chair: waiting for a slot, needing a follow-up, or who
            did not turn up.</p>
          <h4>Four tabs</h4>
          <table class="fields">
            <tr><td>Waitlist</td><td>Families waiting for a slot. The <b>Branch</b> column shows where they filled the
              form in, so you know which clinic they asked about.</td></tr>
            <tr><td>Follow Up</td><td>Patients due a check-in. Log the outcome of each call.</td></tr>
            <tr><td>No-Show</td><td>Missed appointments, with a log per patient.</td></tr>
            <tr><td>Cancellations</td><td>Cancelled sessions and whether a fee applies.</td></tr>
          </table>
          <p>Within a tab, the department chips &mdash; <kbd>PT</kbd>, <kbd>OT</kbd>, <kbd>SLP</kbd>, <kbd>SPED</kbd>,
            <kbd>Psych</kbd>, <kbd>MD</kbd> &mdash; narrow the list further.</p>
          <h4>Fees and repeated misses</h4>
          <p>A row marked <b>Fee applies</b> has passed the threshold in policy. <b>SUBJECT TO SLOT REMOVAL</b> means
            they have missed often enough that their standing slot is at risk &mdash; a conversation, not an automatic
            action.</p>
          <div class="note"><b>Scan to Upload Proof</b> gives the family a QR code to send evidence for a waived fee,
            such as a medical certificate. <b>Form Responses</b> shows what they originally submitted &mdash; useful
            context before a difficult call.</div>
        </div>

        <div class="mod" id="m-survey">
          <div class="mod-top"><h3>Customer Survey</h3><span class="loc">/customer-survey</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span></div>
          <p class="desc">Patient satisfaction: sending surveys out, reading what comes back, and the clinician
            leaderboard built from it.</p>
          <h4>Getting a survey to a patient <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li><kbd>Scan to Take Survey</kbd> shows a QR code &mdash; the normal route, printed at the counter.</li>
            <li><kbd>Manual Survey Assignment</kbd> assigns one to a named patient.</li>
            <li><kbd>Assessment Schedule</kbd> sets the automatic rhythm, so most go out without anyone pressing anything.</li>
          </ol>
          <h4>Reading the results</h4>
          <table class="fields">
            <tr><td>Completion Rate &middot; Avg Rating</td><td>The two headline numbers.</td></tr>
            <tr><td>Monthly Rating Trend</td><td>The direction of travel, which matters more than any single month.</td></tr>
            <tr><td>Strengths &middot; Areas for Improvement &middot; Other Comments</td><td>The written answers. Read
              these before drawing conclusions from the score.</td></tr>
            <tr><td>Manage Survey Entries</td><td>Correct or remove a specific response.</td></tr>
          </table>
          <div class="note care"><b>Small numbers mislead.</b> A clinician with three responses can outrank one with
            ninety. Check the response count beside the score before acting on a ranking.
            <b>Leaderboard Scoring Weights</b> sets how much rating counts against volume; only active clinicians appear.</div>
        </div>

        <div class="mod" id="m-peer">
          <div class="mod-top"><h3>Peer Evaluation</h3><span class="loc">/peer-eval</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Staff evaluating each other on the HR08 and HR09 instruments. Annual, and largely automatic
            once generated.</p>
          <h4>Running a round <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Choose <kbd>Period</kbd>, <kbd>Branch</kbd> and <kbd>Evaluation Type</kbd> &mdash; HR08 Peer, HR08 Admin
              or HR09.</li>
            <li>Generate the assignments. <b>Generation Complete</b> confirms who was assigned to whom;
              <b>Assignment Logic Reference</b> explains the pairing rules if one looks odd.</li>
            <li>Distribute with <kbd>QR Codes</kbd>, or <kbd>Open Survey</kbd> to see what evaluators will see.</li>
            <li>Track Pending, Answered, Completed and Expired with the status filters.</li>
            <li>Read results under <kbd>Scores</kbd> and <kbd>Score Entry</kbd>.</li>
          </ol>
          <div class="note"><b>Work Days in Clinic</b> feeds the pairing &mdash; people are matched with colleagues they
            actually work alongside. If that is wrong, fix the work days before regenerating rather than reassigning by hand.</div>
        </div>

        <div class="mod" id="m-regforms">
          <div class="mod-top"><h3>Registration Forms</h3><span class="loc">/registration-forms</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Everything submitted through the public forms, and the settings behind those forms.</p>
          <h4>Working the list <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Use the status tickboxes at the top to show only what you are working on: <kbd>Converted</kbd>,
              <kbd>Not Converted</kbd>, <kbd>For prioritization</kbd>. Ticking more than one shows all of them.</li>
            <li>Narrow further with the tick-list dropdowns on each column.</li>
            <li>Read the contact columns &mdash; name, email and number are separate columns, so the table sorts and scans.</li>
            <li>Open a submission and use <kbd>Edit Response</kbd> to correct a typo before converting it.</li>
          </ol>
          <div class="note">A row that is both converted and flagged for prioritization shows as <b>Converted
            Priority</b> in purple, so the combination stands out.
            <b>Settings</b> holds the partner schools offered on the public registration form &mdash; add one there and
            it appears on the form; there is no second place to update.</div>
        </div>

        <div class="mod" id="m-partners">
          <div class="mod-top"><h3>Partner Institutions</h3><span class="loc">/partner-institutions</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-desk"><span class="dot">F</span>Front Desk</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Schools and institutions we hold agreements with, and what discount each gets. View-only here
            &mdash; HR Hub owns the records.</p>
          <h4>Reading a card <span class="tag">What you will see</span></h4>
          <table class="fields">
            <tr><td>Left side</td><td>The contact &mdash; who to call and how. <b>No contact recorded</b> means nobody
              has been named yet.</td></tr>
            <tr><td>Right side</td><td>The discount terms in plain sentences with figures in bold, because this is what
              front desk needs at the counter.</td></tr>
            <tr><td>No discount set</td><td>An agreement exists but carries no discount &mdash; different from one
              nobody has entered, so it is stated rather than left blank.</td></tr>
          </table>
          <div class="note"><b>To change anything</b> &mdash; a contact, a discount, a new partner &mdash; edit it in
            HR Hub. This page updates on its own. Commission terms are deliberately not shown here.</div>
        </div>
      </div>

      <div class="grouphead" id="g-mktg">Social &amp; marketing</div>
      <div class="cards">

        <div class="mod" id="m-social">
          <div class="mod-top"><h3>Social Media Suite</h3><span class="loc">/social</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Writing, scheduling and reviewing posts to the connected Facebook and Instagram accounts.</p>
          <h4>Posting <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Go to <kbd>New Post</kbd>.</li>
            <li>Write the caption, then add artwork &mdash; <kbd>Click to upload image or video</kbd>, or
              <kbd>Import from Canva</kbd> to pull a finished design in. <kbd>Add more</kbd> attaches further images
              for a carousel.</li>
            <li>Choose which accounts it goes to.</li>
            <li>Publish now, or set a date and time to schedule it.</li>
          </ol>
          <p><kbd>Scheduled</kbd> lists queued posts &mdash; edit or remove one before it goes.
            <kbd>Published</kbd> shows what went out and how it performed.</p>
          <div class="note care"><b>Scheduled means scheduled.</b> Once the time passes the post is public. If you are
            unsure about wording, leave it as a draft rather than scheduling it and planning to check later.</div>
        </div>

        <div class="mod" id="m-templates">
          <div class="mod-top"><h3>Post Templates</h3><span class="loc">/templates</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Reusable artwork for the two things posted most often: <b>Birthday Posts</b> and
            <b>Holiday Posts</b>.</p>
          <p>Add artwork with <kbd>Upload Photo or Video</kbd> (JPG, PNG, MP4, MOV) or <kbd>Use a Canva design</kbd>.
            Saved templates are offered when composing rather than rebuilt each time.</p>
        </div>

        <div class="mod" id="m-email">
          <div class="mod-top"><h3>Email Campaigns</h3><span class="loc">/email</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Bulk email to patients, from a branch address.</p>
          <h4>Sending one <span class="tag">Step by step</span></h4>
          <ol class="steps">
            <li>Choose the sending identity &mdash; Aura Health Rehab Clinic or Sapphire Clinics East.</li>
            <li>Write the <kbd>Subject</kbd> and body.</li>
            <li>Choose <kbd>Recipients</kbd>. Only patients who consented to the newsletter are included.</li>
            <li>Use <kbd>Email Preview</kbd> and read it once more.</li>
            <li>Send now or schedule, then track under <kbd>Past Campaigns</kbd>.</li>
          </ol>
          <p>Statuses run Draft, Scheduled, Sending, Sent, Failed. One stuck on <b>Sending</b> is still working through
            the list; <b>Failed</b> needs looking at.</p>
          <div class="note care"><b>There is no unsend.</b> Preview, check the recipient count, then send.</div>
        </div>

        <div class="mod" id="m-sms">
          <div class="mod-top"><h3>SMS Campaigns</h3><span class="loc">/sms</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">Bulk text messages. The same shape as email, with two differences worth knowing.</p>
          <ol class="steps">
            <li>Pick <kbd>Branch</kbd> &mdash; or <kbd>Both branches</kbd>. Messages send from that branch's own number.</li>
            <li>Choose the recipient <kbd>Group</kbd>.</li>
            <li>Write the <kbd>Message</kbd>. Keep it short: long messages split into several and each part is charged.</li>
            <li>Send or schedule, then follow it in <kbd>Past Campaigns</kbd>.</li>
          </ol>
          <div class="note">A campaign can finish as <b>Partial</b> &mdash; some delivered, some not, usually bad
            numbers. Open it to see which, and correct those records in Patient CRM.</div>
        </div>
      </div>

      <div class="grouphead" id="g-setup">Settings &amp; access</div>
      <div class="cards">

        <div class="mod" id="m-investor">
          <div class="mod-top"><h3>Investor View</h3><span class="loc">/patients/dashboard</span></div>
          <div class="mod-roles"><span class="badge b-inv"><span class="dot">I</span>Investor</span></div>
          <p class="desc">A deliberately narrow, read-only account for people who should see how the clinic is
            performing without seeing who the patients are.</p>
          <h4>What it can reach</h4>
          <ul>
            <li><b>Patient Dashboard</b> &mdash; numbers, growth and mix, plus the therapist leaderboard and positive
              feedback. This is the landing page.</li>
            <li><b>Customer Satisfaction Survey</b> &mdash; the leaderboard and patient feedback on its own page.</li>
          </ul>
          <p>The left menu shows only those two, under the heading <b>Investor View</b>. Typing any other address lands
            back on the Patient Dashboard.</p>
          <h4>What is deliberately hidden</h4>
          <table class="fields">
            <tr><td>Patient identity</td><td>Respondent names, emails and phone numbers are never fetched from the
              database for this view at all &mdash; not merely left off the screen.</td></tr>
            <tr><td>Therapist names</td><td>Masked to initials. An investor sees the ranking and the scores, not who is who.</td></tr>
            <tr><td>Every other module</td><td>Blocked on the server. Adding a menu link would not grant access.</td></tr>
          </table>
          <div class="note"><b>Why masking sits in the API, not the page:</b> if names were only hidden by the screen,
            the full names would still arrive in the browser and be readable by anyone who looked. They are removed
            before the data is sent.</div>
          <div class="note care"><b>Do not use an admin account as a stand-in.</b> Handing an investor a Clinic Manager
            login exposes every patient record in the clinic. The Investor role exists so that never has to happen.</div>
        </div>

        <div class="mod" id="m-accounts">
          <div class="mod-top"><h3>Connected Accounts</h3><span class="loc">/settings/accounts</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">The external accounts the Hub posts through: Facebook Page, Instagram Business and Canva.</p>
          <p>Each row shows <kbd>Platform</kbd>, <kbd>Status</kbd> and <kbd>Last Synced</kbd>. If social posting fails,
            check here first &mdash; a <b>Page Access Token</b> expires periodically and must be reconnected.
            <b>No accounts connected</b> means nothing can post at all.</p>
        </div>

        <div class="mod" id="m-team">
          <div class="mod-top"><h3>Team</h3><span class="loc">/settings/users</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span></div>
          <p class="desc">Hub user accounts. The only place accounts are created, and only Clinic Managers can open it.</p>
          <ol class="steps">
            <li>Enter the person's <kbd>Name</kbd> and <kbd>Email</kbd>.</li>
            <li>Choose the <kbd>Role</kbd> &mdash; the five in Section 2.</li>
            <li>Set the <kbd>Branch</kbd> for a branch-locked role.</li>
            <li>Set a <kbd>Password</kbd> and pass it to them privately.</li>
          </ol>
          <div class="note care"><b>Staff accounts are not clinician records.</b> Creating someone here does not add
            them to the roster &mdash; that comes from HR Hub. A clinician who never signs in needs no account here.</div>
        </div>

        <div class="mod" id="m-brand">
          <div class="mod-top"><h3>Brand Guide</h3><span class="loc">/brand</span></div>
          <div class="mod-roles"><span class="badge b-mgr"><span class="dot">M</span>Manager</span><span class="badge b-hr"><span class="dot">H</span>HR</span><span class="badge b-mktg"><span class="dot">K</span>Marketing</span></div>
          <p class="desc">The reference for anything public-facing: <b>Colors</b>, <b>Typography</b>, <b>Brand Tone</b>
            and <b>Design Notes</b>. Check it before publishing artwork made outside the Hub.</p>
        </div>
      </div>
    </section>

    <!-- SECTION 4 -->
    <section id="connect">
      <p class="eyebrow">Section 4</p>
      <h2>Connected systems &mdash; where the data flows</h2>
      <p>The Operations Hub is one of several connected systems. They share data automatically over secure
        system-to-system links, so information typed once does not have to be typed again elsewhere. This map shows
        what the Operations Hub <b>supplies</b> to each system and what it <b>receives</b> back.</p>

      <div class="hubwrap">
        <svg viewBox="0 0 820 470" role="img" aria-label="Operations Hub at the centre, exchanging data with HR Hub, Accounting Hub, Client Portal and Staff Portal">
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#8FA8AD"/>
            </marker>
          </defs>
          <g>
            <rect x="30" y="34" width="290" height="76" rx="12" fill="#fff" stroke="#CBD9DC" stroke-width="1.5"/>
            <text x="175" y="68" text-anchor="middle" font-size="17" font-weight="700" fill="#132A33">HR Hub</text>
            <text x="175" y="90" text-anchor="middle" font-size="13" fill="#6B7C85">staff &middot; employment &middot; partners</text>
          </g>
          <g>
            <rect x="500" y="34" width="290" height="76" rx="12" fill="#fff" stroke="#CBD9DC" stroke-width="1.5"/>
            <text x="645" y="68" text-anchor="middle" font-size="17" font-weight="700" fill="#132A33">Accounting Hub</text>
            <text x="645" y="90" text-anchor="middle" font-size="13" fill="#6B7C85">billing &middot; referrers &middot; finance</text>
          </g>
          <g>
            <rect x="30" y="360" width="290" height="76" rx="12" fill="#fff" stroke="#CBD9DC" stroke-width="1.5"/>
            <text x="175" y="394" text-anchor="middle" font-size="17" font-weight="700" fill="#132A33">Client Portal</text>
            <text x="175" y="416" text-anchor="middle" font-size="13" fill="#6B7C85">what families see</text>
          </g>
          <g>
            <rect x="500" y="360" width="290" height="76" rx="12" fill="#fff" stroke="#CBD9DC" stroke-width="1.5"/>
            <text x="645" y="394" text-anchor="middle" font-size="17" font-weight="700" fill="#132A33">Staff Portal</text>
            <text x="645" y="416" text-anchor="middle" font-size="13" fill="#6B7C85">what clinicians see</text>
          </g>
          <g>
            <rect x="265" y="192" width="290" height="86" rx="14" fill="#0E4C57"/>
            <text x="410" y="228" text-anchor="middle" font-size="19" font-weight="800" fill="#fff" letter-spacing="1">OPERATIONS HUB</text>
            <text x="410" y="252" text-anchor="middle" font-size="12" fill="rgba(255,255,255,0.62)">operations.sapphireclinicseast.org</text>
          </g>
          <path d="M195 118 L330 184" stroke="#8FA8AD" stroke-width="2" fill="none" marker-end="url(#ah)" marker-start="url(#ah)"/>
          <path d="M625 118 L490 184" stroke="#8FA8AD" stroke-width="2" fill="none" marker-end="url(#ah)" marker-start="url(#ah)"/>
          <path d="M330 286 L195 352" stroke="#8FA8AD" stroke-width="2" fill="none" marker-end="url(#ah)"/>
          <path d="M490 286 L625 352" stroke="#8FA8AD" stroke-width="2" fill="none" marker-end="url(#ah)"/>
          <text x="222" y="162" font-size="11.5" fill="#2E4049" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">staff in &middot; results out</text>
          <text x="598" y="162" text-anchor="end" font-size="11.5" fill="#2E4049" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">doctors in &middot; bookings out</text>
          <text x="222" y="330" font-size="11.5" fill="#2E4049" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">patients &middot; sessions</text>
          <text x="598" y="330" text-anchor="end" font-size="11.5" fill="#2E4049" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">schedules &middot; queue</text>
        </svg>
        <p class="hub-legend"><b>&#8646;</b> two-way automatic sync &nbsp;&middot;&nbsp; <b>&rarr;</b> one-way (Operations publishes out)</p>
      </div>

      <div class="conn">
        <div class="conn-head"><h3>HR Hub</h3><span class="loc">hr.sapphireclinicseast.org</span></div>
        <p>The system of record for people. Anything about a person is changed there, not here.</p>
        <div class="flowgrid">
          <div class="flowcol receives"><div class="flow-lbl">Operations receives</div>
            <ul><li>Staff records, departments and branches</li><li>Employment type &mdash; Employee, Consultant, Intern, Renter</li>
              <li>Work arrangement, which decides the Decking sections</li><li>Partner institutions and their discount terms</li></ul></div>
          <div class="flowcol supplies"><div class="flow-lbl">Operations supplies</div>
            <ul><li>Customer survey results</li><li>Peer evaluation results</li></ul></div>
        </div>
      </div>

      <div class="conn">
        <div class="conn-head"><h3>Accounting Hub</h3><span class="loc">accounting.sapphireclinicseast.org</span></div>
        <p>Billing and the referral network.</p>
        <div class="flowgrid">
          <div class="flowcol receives"><div class="flow-lbl">Operations receives</div>
            <ul><li>The referring-doctor list used by the registration form, read live &mdash; a doctor added there is
              findable on the next keystroke</li></ul></div>
          <div class="flowcol supplies"><div class="flow-lbl">Operations supplies</div>
            <ul><li>Booking and payment markers for reconciliation</li></ul></div>
        </div>
      </div>

      <div class="conn">
        <div class="conn-head"><h3>Client Portal &amp; Staff Portal</h3><span class="loc">what families and clinicians see</span></div>
        <p>Both read from Operations. Neither writes back into it.</p>
        <div class="flowgrid">
          <div class="flowcol receives"><div class="flow-lbl">Operations receives</div>
            <p class="flownone">Nothing &mdash; these are one-way.</p></div>
          <div class="flowcol supplies"><div class="flow-lbl">Operations supplies</div>
            <ul><li>Client Portal: the patient record, sessions and documents</li>
              <li>Staff Portal: each clinician's own schedule and the day queue</li></ul></div>
        </div>
      </div>

      <div class="call rule"><span class="lbl">One-way means one-way</span>
        Editing a staff name in Operations does not reach HR Hub, and the next sync overwrites it. Change it where it
        is owned &mdash; the cards above say where that is.</div>
    </section>

    <!-- SECTION 5 -->
    <section id="play">
      <p class="eyebrow">Section 5</p>
      <h2>Role playbooks</h2>
      <p>If you only read one thing, read the playbook for your own role. Each is the shape of an ordinary day.</p>

      <div class="play desk">
        <h3><span class="badge b-desk"><span class="dot">F</span>Front Desk</span> A day at the counter</h3>
        <ol>
          <li>Open <b>Queueing</b> and check the branch tab is yours.</li>
          <li>As families arrive, move their row from <b>Pending</b> to <b>Confirmed</b>.</li>
          <li>Take walk-ins with <kbd>Search Existing Patient</kbd> first, <kbd>New Patient</kbd> only if they are genuinely new.</li>
          <li>In <b>Clinic Schedule</b>, send the day's reminders &mdash; per patient, or <kbd>Email All Patients</kbd> for a whole list.</li>
          <li>If a clinician calls in sick, use <kbd>Text: Clinician Absent Notice</kbd> after checking the date and the name.</li>
          <li>Fill gaps from <b>Patient Relationship &rsaquo; Waitlist</b>, and log any no-shows.</li>
          <li>Hand new families the <b>Patient Registration QR</b> rather than typing their details for them.</li>
        </ol>
      </div>

      <div class="play mgr">
        <h3><span class="badge b-mgr"><span class="dot">M</span>Clinic Manager</span> A week of oversight</h3>
        <ol>
          <li>Open <b>Clinic Utilization</b> and set the week. Compare both branches side by side.</li>
          <li>Open <b>Decking &rsaquo; History</b> for the departments that look thin, and read the fill rate.</li>
          <li>Check <b>Decking &rsaquo; Interdepartment</b> for patients who could be seeing a second department.</li>
          <li>Read <b>Customer Survey</b> &mdash; the written comments before the scores.</li>
          <li>Review <b>Patient Relationship</b> for fees due and repeated no-shows.</li>
          <li>Create or retire accounts in <b>Settings &rsaquo; Team</b>, and never lend one.</li>
        </ol>
      </div>

      <div class="play hr">
        <h3><span class="badge b-hr"><span class="dot">H</span>HR Officer</span> Keeping the roster true</h3>
        <ol>
          <li>Make every staff change in <b>HR Hub</b> first &mdash; it is the system of record.</li>
          <li>Run the sync in <b>Staff Module</b> and confirm the row changed.</li>
          <li>Check leavers read as inactive, not missing.</li>
          <li>Confirm work arrangement is right, or the consultant lands in the wrong Decking section.</li>
          <li>Run <b>Peer Evaluation</b> rounds and chase the Pending ones.</li>
        </ol>
      </div>

      <div class="play mktg">
        <h3><span class="badge b-mktg"><span class="dot">K</span>Marketing Admin</span> A campaign, start to finish</h3>
        <ol>
          <li>Check <b>Settings &rsaquo; Connected Accounts</b> shows the socials still connected.</li>
          <li>Build artwork in <b>Post Templates</b>, or import a Canva design.</li>
          <li>Schedule posts in <b>Social &rsaquo; New Post</b>.</li>
          <li>For email or SMS, check the recipient count and preview before sending &mdash; neither can be recalled.</li>
          <li>Read results in <b>Patient Dashboard</b> and <b>Published</b>.</li>
        </ol>
      </div>

      <div class="play inv">
        <h3><span class="badge b-inv"><span class="dot">I</span>Investor</span> What you will see</h3>
        <ol>
          <li>You land on <b>Patient Dashboard</b>. It is the whole clinic, both branches.</li>
          <li>Read patient growth and mix, then the therapist leaderboard.</li>
          <li>Open <b>Customer Satisfaction Survey</b> for feedback in more detail.</li>
          <li>Therapists appear as initials and patients are never named &mdash; that is by design, not a fault.</li>
        </ol>
      </div>
    </section>

    <!-- SECTION 6 -->
    <section id="rules">
      <p class="eyebrow">Section 6</p>
      <h2>Golden rules</h2>
      <p>Six habits that prevent almost every avoidable problem in this system.</p>
      <div class="call rule"><span class="lbl">Rule 1</span>
        <b>Search before you create.</b> Two records for one child split the history in half, and neither looks wrong
        on its own.</div>
      <div class="call rule"><span class="lbl">Rule 2</span>
        <b>Check the branch tab before reading any number.</b> It is the single most common reason a figure looks wrong.</div>
      <div class="call rule"><span class="lbl">Rule 3</span>
        <b>Change people in HR Hub, not here.</b> Staff edits made in Operations are overwritten at the next sync.</div>
      <div class="call rule"><span class="lbl">Rule 4</span>
        <b>Nothing sent can be recalled.</b> Reminders, absent notices, campaigns and social posts all reach real people
        within seconds. Read it twice.</div>
      <div class="call rule"><span class="lbl">Rule 5</span>
        <b>Never lend an account.</b> Roles exist so each person sees only what they should &mdash; especially the
        Investor role. Ask a Clinic Manager for the right account instead.</div>
      <div class="call rule"><span class="lbl">Rule 6</span>
        <b>If a number contradicts the board, say so.</b> The board is what front desk acts on. A count that disagrees
        with it is worth investigating, not working around.</div>
    </section>

    <!-- SECTION 7 -->
    <section id="help">
      <p class="eyebrow">Section 7</p>
      <h2>Help</h2>
      <p>Answers to the questions people ask most, and a search box that finds any word in this handbook and takes
        you to it.</p>

      <h3 class="blockh" id="faq">Frequently asked questions</h3>
      <div class="faq">
        <details><summary>A module I need isn't in my menu.</summary><div class="a">
          <p>The menu shows only what your role may open &mdash; nothing is hidden by accident. Compare against
            <a href="#access">Who sees what</a>. If you genuinely need it, ask a Clinic Manager, who can change your
            role in <b>Settings &rsaquo; Team</b>.</p></div></details>
        <details><summary>I can only see one branch.</summary><div class="a">
          <p>Front Desk accounts are locked to their own branch by design. Clinic Manager and HR Officer accounts see
            both and switch with the branch tabs inside each module.</p></div></details>
        <details><summary>Someone changed something, but I still see the old version.</summary><div class="a">
          <p>Reload the page, or press <b>Cmd/Ctrl + Shift + R</b> for a full refresh. A tab open since before the
            change may be showing an old copy.</p></div></details>
        <details><summary>A patient exists twice.</summary><div class="a">
          <p>Usually because they registered themselves and were also added at the counter. Their history is now split
            and neither record looks wrong on its own. Ask a Clinic Manager to merge them &mdash; do not delete one, or
            you delete half the history.</p></div></details>
        <details><summary>How do I get a family to register themselves?</summary><div class="a">
          <p>In Patient CRM open <b>Patient Registration QR</b> and show or print the code. They fill the form in
            themselves and can photograph their referral and PWD/Senior ID with their own phone, which removes
            transcription errors.</p></div></details>
        <details><summary>The doctor's name will not come up on the registration form.</summary><div class="a">
          <p>Type at least three letters <b>of the name itself</b> &mdash; the honorific does not count, so "dr. a" is
            one letter and shows nothing, while "dr. aid" finds the match. Matching is on the start of a word, so a
            surname works as well as a first name.</p>
          <p>If the doctor is genuinely not listed, the family can just type the name. To add them permanently, add them
            in Accounting Hub under <b>Referral &rsaquo; Referrers &rsaquo; Doctors</b>.</p></div></details>
        <details><summary>A partner school is missing from the registration form.</summary><div class="a">
          <p>Add it in <b>Registration Forms &rsaquo; Settings</b>. That list is what the public form offers; there is
            no second place to update.</p></div></details>
        <details><summary>What is the difference between Clinic Schedule and Decking?</summary><div class="a">
          <p><b>Clinic Schedule</b> is individual appointments on a specific date &mdash; booking, changing, reminding.
            <b>Decking</b> is the repeating weekly shape behind it: which consultant offers which hours, and how much
            of that is sold.</p>
          <p>Book a one-off in Clinic Schedule. Ask "how full is Tuesday?" in Decking.</p></div></details>
        <details><summary>The reminder buttons are greyed out.</summary><div class="a">
          <p>Two possible reasons, and the tooltip says which. Either the clinician has no mobile number on file
            &mdash; fix that in HR Hub &mdash; or they are a <b>Renter</b>.</p>
          <p>Renters pay the clinic a monthly facility fee and bring their own private clients, so the clinic does not
            message those patients. You can still book their sessions and they still appear in the queue.</p></div></details>
        <details><summary>A consultant is missing from the Decking board.</summary><div class="a">
          <p>Click the <b>All</b> chip. On-site, Teletherapy and Homecare are driven by work arrangement in HR Hub, and
            someone untagged appears in none of the three but does appear under All. Fix the work arrangement in HR Hub
            and re-sync. If they are missing from All too, they are probably inactive in HR Hub.</p></div></details>
        <details><summary>Someone appears in two Decking sections at once.</summary><div class="a">
          <p>That is correct. A consultant tagged "On-site + Teletherapy" genuinely does both, so they appear under
            both. Two roles, not a duplicate.</p></div></details>
        <details><summary>Why does the History chart not reach the "Slots offered" number?</summary><div class="a">
          <p>Because blocked hours are counted in that tile but deliberately not drawn. The chart shows only what was
            sellable &mdash; filled plus open &mdash; so its top edge sits below the total whenever anything is
            blocked.</p></div></details>
        <details><summary>Fill rate jumped. Did we get better?</summary><div class="a">
          <p>Not necessarily. Fill rate is filled divided by (filled + open) &mdash; of what could be sold, how much
            was. Blocked hours are not in the denominator, so a department is not marked down for time its consultants
            never offered. The same work measured against a fairer base gives a higher number.</p></div></details>
        <details><summary>Someone has left but still appears.</summary><div class="a">
          <p>Mark them inactive in HR Hub, then re-sync in Staff Module. They drop out of the boards and pickers but
            keep their history. They are never deleted &mdash; that would take thousands of past appointments with
            them.</p></div></details>
        <details><summary>I changed a staff name here and it reverted.</summary><div class="a">
          <p>Expected. HR Hub owns staff data and the sync overwrites the local copy. Change it in HR Hub.</p></div></details>
        <details><summary>What is a Renter?</summary><div class="a">
          <p>A clinician we do not pay. They pay the clinic a fixed monthly fee for use of the facility and see their
            own private clients here. Schedule and queue them as normal; the clinic just does not send messages to
            their patients.</p></div></details>
        <details><summary>Can I give an investor a login without showing them patient names?</summary><div class="a">
          <p>Yes &mdash; that is exactly what the <b>Investor</b> role is for. Two read-only pages, patient identities
            never sent to it, therapist names as initials. Create it under <b>Settings &rsaquo; Team</b>. Never hand an
            investor an admin login instead; that exposes every patient record in the clinic.</p></div></details>
        <details><summary>I sent something by mistake. Can it be recalled?</summary><div class="a">
          <p>No. Emails, texts and social posts leave immediately. If it was an Absent Notice, ring the affected
            families &mdash; they will have read it within minutes.</p></div></details>
        <details><summary>An SMS campaign finished as "Partial".</summary><div class="a">
          <p>Some messages delivered and some did not, nearly always bad or missing mobile numbers. Open the campaign
            to see which failed, then correct those numbers in Patient CRM.</p></div></details>
        <details><summary>A patient says they never get our emails.</summary><div class="a">
          <p>Check they are marked <b>Email Newsletter</b> in Patient CRM &mdash; campaigns go only to patients who
            consented. Then check the address for a typo.</p></div></details>
        <details><summary>Social posting has stopped working.</summary><div class="a">
          <p>Check <b>Settings &rsaquo; Connected Accounts</b>. Page access tokens expire periodically and the account
            needs reconnecting; the <b>Last Synced</b> column usually shows the problem.</p></div></details>
        <details><summary>A figure does not match what I can see on the board.</summary><div class="a">
          <p>Check three things in order: the <b>branch tab</b>, the <b>date range</b>, and any <b>department
            filter</b> still set from last time. If all three are right and it still disagrees, say so &mdash; a count
            that contradicts the board is worth investigating.</p></div></details>
        <details><summary>The leaderboard looks unfair.</summary><div class="a">
          <p>Check the response count beside each score. A clinician with three responses can outrank one with ninety.
            <b>Leaderboard Scoring Weights</b> controls how much rating counts against volume.</p></div></details>
        <details><summary>Who do I ask when the answer is not here?</summary><div class="a">
          <p>Staff records, employment type or partner agreements &mdash; HR Hub, because it owns them. Billing or
            referrers &mdash; Accounting Hub. Anything else, your Clinic Manager.</p></div></details>
      </div>

      <h3 class="blockh" id="search">Word search</h3>
      <div class="hb-search" data-noexport>
        <label for="hbq">Type a word or phrase &mdash; a button name, a module, a field, anything.</label>
        <input id="hbq" type="search" placeholder="e.g. Renter, Absent Notice, fill rate, QR, Investor, waitlist…" autocomplete="off">
        <p class="hint">Results list every place the words appear, with the section they are in. Click one to jump
          there; matches are highlighted on the page.</p>
        <ul class="sr-list" id="hbres" aria-live="polite"></ul>
        <p class="sr-empty" id="hbempty" hidden>No matches. Try a shorter word, or the name as it appears on screen.</p>
      </div>
    </section>

</div>
</div>
</main>

<footer>
  <div class="wrap">
    <span>Sapphire Clinics East &middot; Operations Hub &mdash; internal documentation</span>
    <span>Questions this handbook does not answer go to your Clinic Manager.</span>
  </div>
</footer>

<script>
(function () {
  // ── Word search ───────────────────────────────────────────────────────
  // Indexes the rendered document, so a section added to the HTML is
  // searchable without touching this script.
  var blocks = [];
  document.querySelectorAll('section').forEach(function (sec) {
    var secName = (sec.querySelector('h2') || {}).textContent || sec.id;
    var units = sec.querySelectorAll('.mod, .conn, .play, .faq details, .call, .legend .rc');
    if (units.length) {
      units.forEach(function (u) {
        var t = (u.querySelector('h3, summary, h4') || {}).textContent || secName;
        blocks.push({ el: u, where: secName.trim(), title: t.trim(), text: u.innerText || '' });
      });
    }
    // Loose prose in the section, so nothing is unreachable.
    blocks.push({ el: sec, where: secName.trim(), title: secName.trim(), text: sec.innerText || '' });
  });

  var q = document.getElementById('hbq');
  var res = document.getElementById('hbres');
  var empty = document.getElementById('hbempty');
  if (!q) return;

  // Character class ends with the dollar on purpose: a dollar followed by a
  // brace would open an interpolation in the template literal this lives in.
  function esc(t) { return t.replace(/[.*+?^()|[\]\\{}$]/g, '\\$&'); }
  function safe(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function clearMarks() {
    document.querySelectorAll('mark.hit').forEach(function (m) {
      var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
  }

  function highlight(root, term) {
    var re = new RegExp(esc(term), 'gi');
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var hits = [], n;
    while ((n = walker.nextNode())) {
      if (n.parentNode && (n.parentNode.nodeName === 'SCRIPT' || n.parentNode.nodeName === 'STYLE')) continue;
      re.lastIndex = 0;
      if (re.test(n.nodeValue)) hits.push(n);
    }
    hits.forEach(function (node) {
      var span = document.createElement('span');
      span.innerHTML = safe(node.nodeValue).replace(new RegExp(esc(safe(term)), 'gi'), function (m) {
        return '<mark class="hit">' + m + '</mark>';
      });
      node.parentNode.replaceChild(span, node);
    });
  }

  function snip(text, term) {
    var i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return text.slice(0, 130);
    var a = Math.max(0, i - 60), b = Math.min(text.length, i + term.length + 85);
    return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '');
  }

  function run() {
    clearMarks();
    var term = q.value.trim();
    res.innerHTML = '';
    if (term.length < 2) { empty.hidden = true; return; }

    var seen = {}, found = [];
    blocks.forEach(function (b) {
      if (b.text.toLowerCase().indexOf(term.toLowerCase()) === -1) return;
      var id = b.el.id || b.title;
      if (seen[id]) return;
      seen[id] = 1; found.push(b);
    });
    // Prefer the specific card over the whole section it sits in.
    found = found.filter(function (b) {
      return b.el.tagName !== 'SECTION' || !found.some(function (o) {
        return o.el !== b.el && b.el.contains(o.el);
      });
    });

    empty.hidden = found.length > 0;
    found.slice(0, 25).forEach(function (b) {
      if (!b.el.id) b.el.id = 'hit-' + Math.random().toString(36).slice(2, 8);
      var li = document.createElement('li');
      li.innerHTML = '<a href="#' + b.el.id + '"><span class="where">' + safe(b.where) + '</span>' +
        '<span class="snip">' + safe(snip(b.text, term))
          .replace(new RegExp(esc(safe(term)), 'gi'), function (m) { return '<mark>' + m + '</mark>'; }) +
        '</span></a>';
      res.appendChild(li);
    });
    found.forEach(function (b) { highlight(b.el, term); });
  }

  var t;
  q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(run, 160); });
  q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; run(); } });
})();

// ── Word export ─────────────────────────────────────────────────────────
// Clones the masthead and body as rendered, then drops anything marked
// data-noexport — the contents rail, the action buttons and the search box,
// none of which mean anything in a Word file.
function downloadHandbookWord() {
  try {
    var mast = document.querySelector('header.mast').cloneNode(true);
    var main = document.querySelector('main').cloneNode(true);
    [mast, main].forEach(function (n) {
      n.querySelectorAll('[data-noexport]').forEach(function (x) { x.remove(); });
    });
    main.querySelectorAll('details').forEach(function (d) { d.setAttribute('open', 'open'); });
    var style = '<style>body{font-family:Calibri,sans-serif;font-size:11pt;color:#2E4049;}' +
      'h1,h2,h3,h4{color:#132A33;} table{border-collapse:collapse;width:100%;}' +
      'td,th{border:1px solid #D7E3E6;padding:6px 8px;vertical-align:top;}' +
      '.mod,.conn,.play,.call{border:1px solid #D7E3E6;padding:10px 12px;margin:10px 0;}' +
      'header.mast{background:#0E4C57;color:#fff;padding:18px;}' +
      'header.mast h1,header.mast .kicker,header.mast .lede{color:#fff;}</style>';
    var html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="UTF-8">' +
      '<title>Operations Hub Handbook</title>' + style + '</head><body>' +
      mast.outerHTML + main.outerHTML + '</body></html>';
    var blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'Operations-Hub-Handbook.doc';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  } catch (e) {
    alert('Could not build the Word file. Use Save as PDF instead.');
  }
}
</script>
</body>
</html>`
