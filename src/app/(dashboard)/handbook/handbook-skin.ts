// Screen-only skin for the framed handbook (see ./page.tsx).
//
// The document in ./handbook-content.ts keeps its own stylesheet, and that is
// still what print ("Save as PDF") and the Word export use: everything here is
// wrapped in @media screen and only restyles what is already there. Nothing in
// the document's text or structure is changed.
//
// Layered over the document's own rules (it is injected after them), so it
// re-uses the same class names: .mod, .call, .faq, .fields, table.access …
//
// The page around the frame now carries the contents rail, so the document's
// own contents list is hidden on screen. It was already hidden in print, and
// the Word export drops it (data-noexport), so nothing loses it.

const SYSTEM_SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'

/** @param bodyFont / displayFont — the app's Manrope / Montserrat stacks, or '' to keep the system stack. */
export function HANDBOOK_SKIN_CSS(bodyFont: string, displayFont: string): string {
  const sans = bodyFont ? `${bodyFont},${SYSTEM_SANS}` : `${SYSTEM_SANS}`
  const display = displayFont ? `${displayFont},${sans}` : sans
  return `
@media screen {
  :root{
    --ink:#17292D; --body:#34464B; --muted:#6B7F7A;
    --teal:#2F6E68; --teal-deep:#244952; --teal-soft:#EAF2ED;
    --line:#D3E1DB; --line-soft:#E6EEE9;
    --paper:#F7F9F3; --card:#FFFFFF;
    --measure:72ch;
    --sans:${sans};
    --display:${display};
    --shadow-sm:0 1px 2px rgba(23,41,45,.05);
    --shadow-md:0 10px 28px -14px rgba(23,41,45,.22);
  }
  body{font-size:15.5px;line-height:1.7;background:var(--paper);text-rendering:optimizeLegibility;}
  ::selection{background:#D3E7DD;}
  h1,h2,h3,h4{font-family:var(--display);}
  a{color:var(--teal-deep);text-decoration-color:rgba(36,73,82,.35);}
  a:hover{text-decoration-color:currentColor;}
  .content img{max-width:100%;height:auto;border-radius:10px;}
  .content svg[viewBox]{max-width:100%;height:auto;}

  /* ── One reading column; the contents rail lives in the page ── */
  nav.toc{display:none!important;}
  .wrap{max-width:888px;padding:0 32px;}
  .shell{display:block;}
  .content{min-width:0;}

  /* ── Masthead: a compact cover ── */
  header.mast{
    background:
      radial-gradient(90% 140% at 100% 0%, rgba(74,128,115,.42), transparent 62%),
      radial-gradient(60% 90% at 0% 100%, rgba(198,152,73,.14), transparent 70%),
      linear-gradient(160deg,#244952 0%,#2A5760 100%);
    color:#D6E6E0;padding:40px 0 34px;
  }
  .mast .wrap{gap:14px;}
  .kicker{font-size:11px;letter-spacing:.22em;color:#A9D1C5;}
  .mast h1{font-size:clamp(26px,3.6vw,36px);font-weight:800;letter-spacing:-.022em;max-width:24ch;line-height:1.15;}
  .mast p.lede{font-size:15.5px;line-height:1.7;color:#D2E3DD;max-width:68ch;}
  .mast .meta{gap:8px;font-size:12.5px;margin-top:2px;color:#BFD8D0;}
  .mast .meta > span{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
    border-radius:999px;padding:4px 12px;}
  .mast .meta code{background:transparent;padding:0;border:none;color:#EEF6F3;}
  .hb-btn{border-radius:10px;padding:8px 14px;font-size:13px;background:#FFFFFF;color:#244952;
    box-shadow:0 1px 0 rgba(0,0,0,.08);}
  .hb-btn.ghost{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.28);color:#EEF6F3;box-shadow:none;}

  /* ── Sections & headings ── */
  main{padding:40px 0 80px;}
  section{margin:0;padding:6px 0 48px;scroll-margin-top:16px;}
  section + section{border-top:1px solid var(--line);padding-top:44px;}
  .eyebrow{display:inline-flex;align-items:center;font-size:10.5px;font-weight:700;letter-spacing:.16em;
    color:var(--teal);background:var(--teal-soft);border:1px solid #D4E6DC;border-radius:999px;
    padding:3px 10px;margin-bottom:12px;}
  section > h2{font-size:clamp(22px,2.8vw,28px);font-weight:800;letter-spacing:-.022em;line-height:1.2;
    border-bottom:none;padding-bottom:0;margin-bottom:12px;}
  section > h2 + p{font-size:16.5px;color:var(--ink);line-height:1.65;margin-bottom:18px;}
  section p{max-width:var(--measure);}
  h3.blockh{font-size:17.5px;font-weight:750;letter-spacing:-.01em;margin:34px 0 10px;
    padding-left:12px;border-left:3px solid var(--teal);line-height:1.3;scroll-margin-top:16px;}
  .grouphead{font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--teal-deep);margin:40px 0 14px;}
  .grouphead::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--teal);flex:0 0 auto;}

  /* ── Inline: code & on-screen controls ── */
  code{font-size:.84em;background:#EEF4F0;color:var(--teal-deep);border:1px solid var(--line-soft);
    border-radius:5px;padding:.06em .4em;}
  kbd{font-size:.86em;font-weight:600;color:var(--ink);background:linear-gradient(#FFFFFF,#F5F8F3);
    border:1px solid #C9D9D2;border-bottom-width:2px;border-radius:6px;padding:.04em .45em;
    box-shadow:0 1px 0 rgba(23,41,45,.06);}
  @media(max-width:640px){code{white-space:normal;overflow-wrap:anywhere;}}

  /* ── Cards ── */
  .cards{gap:14px;}
  .mod,.conn,.play{border-radius:14px;border-color:var(--line);box-shadow:var(--shadow-sm);
    transition:box-shadow .2s ease,border-color .2s ease;}
  .mod:hover,.conn:hover,.play:hover{box-shadow:var(--shadow-md);border-color:#C2D6CE;}
  .mod-top h3,.conn-head h3{font-size:17px;font-weight:750;letter-spacing:-.01em;}
  .mod-top .loc,.conn-head .loc{font-size:11.5px;color:var(--teal-deep);background:var(--paper);
    border:1px solid var(--line-soft);border-radius:6px;padding:1px 7px;}
  .mod h4{font-size:13.5px;margin:18px 0 8px;}
  .mod ul li::before{background:var(--teal);}
  .mod ol.steps li::before,.play ol li::before{box-shadow:0 0 0 3px #fff;}
  .legend{gap:12px;}
  .legend .rc{border-radius:12px;box-shadow:var(--shadow-sm);}
  .flowcol{border-radius:11px;}
  .hubwrap{border-radius:14px;border-color:var(--line);box-shadow:var(--shadow-sm);}

  /* ── Notes & callouts ── */
  .mod .note{border-left:3px solid var(--teal);border-radius:4px 10px 10px 4px;padding:11px 14px;
    background:var(--teal-soft);line-height:1.6;}
  .mod .note.care{border-left-color:#C9932E;background:var(--warn-bg);}
  .call{border-radius:4px 12px 12px 4px;padding:14px 18px;border:1px solid var(--line-soft);
    border-left:4px solid var(--teal);background:var(--teal-soft);line-height:1.65;}
  .call.rule{border-color:#EEDDB3;border-left-color:#C9932E;background:var(--warn-bg);}
  .call.tip{border-color:#CFE3D8;border-left-color:var(--teal);}
  .call .lbl{display:flex;align-items:center;gap:7px;font-size:10.5px;margin-bottom:6px;}
  .call .lbl::before{content:"i";flex:0 0 auto;width:16px;height:16px;border-radius:50%;display:grid;
    place-items:center;font-family:var(--sans);font-size:10px;font-weight:800;letter-spacing:0;
    text-transform:none;color:#fff;background:var(--teal);}
  .call.rule .lbl::before{content:"!";background:#C9932E;}

  /* ── Tables ── */
  .fields{border-collapse:separate;border-spacing:0;border:1px solid var(--line-soft);border-radius:10px;
    overflow:hidden;margin:8px 0 6px;}
  .fields td{padding:8px 12px;border-bottom:1px solid var(--line-soft);line-height:1.55;}
  .fields td:first-child{background:#F8FAF6;width:32%;}
  .tablewrap{border-color:var(--line);border-radius:12px;box-shadow:var(--shadow-sm);}
  table.access th{background:#244952;color:#E3EFEA;padding:10px 12px;font-size:11px;}
  table.access td{padding:9px 12px;}
  table.access tbody tr:nth-child(even) td{background:#F8FAF6;}
  table.access tbody tr:hover td{background:var(--teal-soft);}

  /* ── FAQ accordions ── */
  .faq details{border-radius:12px;margin-bottom:10px;border-color:var(--line);box-shadow:var(--shadow-sm);
    transition:box-shadow .2s ease,border-color .2s ease;}
  .faq details:hover{border-color:#C2D6CE;}
  .faq details[open]{border-color:#C2D6CE;box-shadow:var(--shadow-md);}
  .faq summary{align-items:center;padding:14px 18px;font-size:14.5px;transition:background .15s;}
  .faq summary:hover{background:#F8FAF6;}
  .faq summary:focus-visible{outline:2px solid var(--teal);outline-offset:-2px;border-radius:12px;}
  .faq summary::after,.faq details[open] summary::after{content:"";flex:0 0 auto;width:7px;height:7px;
    margin:0 4px 3px 0;border-right:2px solid var(--teal);border-bottom:2px solid var(--teal);
    transform:rotate(45deg);transition:transform .2s ease,margin .2s ease;}
  .faq details[open] summary::after{transform:rotate(-135deg);margin:3px 4px 0 0;}
  .faq .a{padding:14px 18px 16px;font-size:14.5px;line-height:1.65;}

  /* ── Word search (the document's own) ── */
  .hb-search{border-radius:14px;border-color:var(--line);box-shadow:var(--shadow-sm);}
  .hb-search input{background:#fff;border-radius:10px;padding:10px 14px;}
  .hb-search input:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(74,128,115,.18);}
  .sr-list li a{border-radius:10px;background:#fff;}

  footer{background:#fff;}

  /* ── Page-driven states (filter, jump flash) ── */
  .ohb-out{display:none!important;}
  mark.ohb-hit,mark.hit{background:#FDE68A;color:inherit;border-radius:3px;padding:0 .08em;
    box-shadow:0 0 0 1px rgba(217,163,20,.35);}
  @keyframes ohbFlash{0%{box-shadow:0 0 0 3px rgba(74,128,115,.5);}100%{box-shadow:0 0 0 3px rgba(74,128,115,0);}}
  .ohb-flash{animation:ohbFlash 1.4s ease-out;}

  @media(max-width:600px){
    .wrap{padding:0 16px;}
    header.mast{padding:30px 0 26px;}
    .mod,.conn,.play{padding:16px;}
  }
}
@media screen and (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto;}
  .ohb-flash{animation:none;}
}
@media print{
  mark.ohb-hit{background:none;box-shadow:none;}
}
`
}
