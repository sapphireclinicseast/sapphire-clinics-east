import path from 'path'
import fs from 'fs/promises'

// Brand colors from SCEI brand guide
export const BRAND = {
  teal: '#2E5E5A',
  deepTeal: '#1E3E3A',
  brightTeal: '#6B9E8F',
  paleTeal: '#E8F0EE',
  gold: '#ED6823',
  goldLight: '#FFA235',
  white: '#FFFFFF',
  charcoal: '#1C2B30',
  nearBlack: '#0A1012',
} as const

export type BirthdayTemplateStyle = 'classic' | 'elegant' | 'bold' | 'sandbox' | 'verdana'

export const BIRTHDAY_TEMPLATES: { id: BirthdayTemplateStyle; label: string; description: string }[] = [
  { id: 'classic', label: 'Classic Dark', description: 'Dark teal gradient with gold accents' },
  { id: 'elegant', label: 'Light Elegant', description: 'Clean split layout, white & teal' },
  { id: 'bold', label: 'Bold Teal', description: 'Full teal background, modern layout' },
  { id: 'sandbox', label: 'Sandbox Brand Guide', description: 'Sandbox Clinic orange brand style' },
  { id: 'verdana', label: 'Verdana Brand Guide', description: 'Verdana Store green brand style' },
]

export const BRANCHES = [
  { id: 'east', label: 'East Branch', greeting: 'From your Family in Sandbox Clinic — East Branch' },
  { id: 'greenhills', label: 'Greenhills Branch', greeting: 'From your Family in Sandbox Clinic — Greenhills Branch' },
  { id: 'verdana', label: 'Verdana Store', greeting: 'With Love from the Team at Verdana Store' },
]

// Inline SVG logo mark (matches SCEI diamond logo)
const LOGO_SVG_WHITE = `<svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="50,5 95,50 50,95 5,50" stroke="white" stroke-width="3.5" fill="none"/><polygon points="50,18 82,50 50,82 18,50" stroke="white" stroke-width="2.5" fill="none"/><polygon points="50,30 70,50 50,70 30,50" stroke="white" stroke-width="2" fill="rgba(255,255,255,0.15)"/><polygon points="50,38 62,50 50,62 38,50" stroke="white" stroke-width="1.5" fill="rgba(255,255,255,0.25)"/><polygon points="50,44 56,50 50,56 44,50" fill="white"/></svg>`

const LOGO_SVG_TEAL = `<svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="50,5 95,50 50,95 5,50" stroke="#2E5E5A" stroke-width="3.5" fill="none"/><polygon points="50,18 82,50 50,82 18,50" stroke="#2E5E5A" stroke-width="2.5" fill="none"/><polygon points="50,30 70,50 50,70 30,50" stroke="#6B9E8F" stroke-width="2" fill="rgba(46,94,90,0.1)"/><polygon points="50,38 62,50 50,62 38,50" stroke="#6B9E8F" stroke-width="1.5" fill="rgba(46,94,90,0.15)"/><polygon points="50,44 56,50 50,56 44,50" fill="#2E5E5A"/></svg>`

// ─────────────────────────────────────────────────────────────
// HOLIDAY THEMES
// ─────────────────────────────────────────────────────────────

export type HolidayTheme = {
  bgGradient: string
  accent: string
  textColor: string
  emoji: string
  decorEmoji: string
}

export const HOLIDAY_THEMES: Record<string, HolidayTheme> = {
  christmas:        { bgGradient: 'linear-gradient(135deg,#0d2b0d 0%,#1a4a1a 100%)', accent: '#C41E3A', textColor: '#FFFFFF', emoji: '🎄', decorEmoji: '⭐' },
  pasko:            { bgGradient: 'linear-gradient(135deg,#0d2b0d 0%,#1a4a1a 100%)', accent: '#C41E3A', textColor: '#FFFFFF', emoji: '🎄', decorEmoji: '⭐' },
  'new year':       { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#0a1012 100%)',  accent: '#ED6823', textColor: '#FFFFFF', emoji: '🎆', decorEmoji: '✨' },
  'bagong taon':    { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#0a1012 100%)',  accent: '#ED6823', textColor: '#FFFFFF', emoji: '🎆', decorEmoji: '✨' },
  valentine:        { bgGradient: 'linear-gradient(135deg,#2d0a18 0%,#4a1a2a 100%)',  accent: '#E91E8C', textColor: '#FFFFFF', emoji: '❤️', decorEmoji: '💕' },
  easter:           { bgGradient: 'linear-gradient(135deg,#E8F0EE 0%,#d0eef2 100%)',  accent: '#2E5E5A', textColor: '#1C2B30', emoji: '🐣', decorEmoji: '🌸' },
  'holy week':      { bgGradient: 'linear-gradient(135deg,#1a0a2e 0%,#2e1a0a 100%)',  accent: '#ED6823', textColor: '#FFFFFF', emoji: '✝️', decorEmoji: '🙏' },
  'semana santa':   { bgGradient: 'linear-gradient(135deg,#1a0a2e 0%,#2e1a0a 100%)',  accent: '#ED6823', textColor: '#FFFFFF', emoji: '✝️', decorEmoji: '🙏' },
  halloween:        { bgGradient: 'linear-gradient(135deg,#120800 0%,#2a1200 100%)',   accent: '#FF6B00', textColor: '#FFFFFF', emoji: '🎃', decorEmoji: '🕷️' },
  thanksgiving:     { bgGradient: 'linear-gradient(135deg,#2a1200 0%,#3a1a00 100%)',   accent: '#ED6823', textColor: '#FFFFFF', emoji: '🦃', decorEmoji: '🍂' },
  'independence day': { bgGradient: 'linear-gradient(135deg,#00205B 0%,#CE1126 100%)',accent: '#FCD116', textColor: '#FFFFFF', emoji: '🇵🇭', decorEmoji: '⭐' },
  'araw ng kalayaan': { bgGradient: 'linear-gradient(135deg,#00205B 0%,#CE1126 100%)',accent: '#FCD116', textColor: '#FFFFFF', emoji: '🇵🇭', decorEmoji: '⭐' },
  'labor day':        { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#2E5E5A 100%)',accent: '#ED6823', textColor: '#FFFFFF', emoji: '💪', decorEmoji: '🌟' },
  'national heroes':  { bgGradient: 'linear-gradient(135deg,#00205B 0%,#1a3a6b 100%)',accent: '#FCD116', textColor: '#FFFFFF', emoji: '🌟', decorEmoji: '🏅' },
  'buwan ng wika':    { bgGradient: 'linear-gradient(135deg,#00205B 0%,#CE1126 100%)',accent: '#FCD116', textColor: '#FFFFFF', emoji: '🇵🇭', decorEmoji: '📚' },
  undas:              { bgGradient: 'linear-gradient(135deg,#1a0a2e 0%,#0d0818 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '🕯️', decorEmoji: '🌸' },
  'all saints':       { bgGradient: 'linear-gradient(135deg,#1a0a2e 0%,#0d0818 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '🕯️', decorEmoji: '🌸' },
  'all souls':        { bgGradient: 'linear-gradient(135deg,#1a0a2e 0%,#0d0818 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '🕯️', decorEmoji: '🌸' },
  bonifacio:          { bgGradient: 'linear-gradient(135deg,#00205B 0%,#CE1126 100%)', accent: '#FCD116', textColor: '#FFFFFF', emoji: '🇵🇭', decorEmoji: '⚔️' },
  rizal:              { bgGradient: 'linear-gradient(135deg,#00205B 0%,#1a3a6b 100%)', accent: '#FCD116', textColor: '#FFFFFF', emoji: '📖', decorEmoji: '🌺' },
  eid:                { bgGradient: 'linear-gradient(135deg,#1a3a0d 0%,#0d2206 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '🌙', decorEmoji: '⭐' },
  "mother's day":     { bgGradient: 'linear-gradient(135deg,#2d0a18 0%,#4a1832 100%)', accent: '#E91E8C', textColor: '#FFFFFF', emoji: '💐', decorEmoji: '🌸' },
  'mothers day':      { bgGradient: 'linear-gradient(135deg,#2d0a18 0%,#4a1832 100%)', accent: '#E91E8C', textColor: '#FFFFFF', emoji: '💐', decorEmoji: '🌸' },
  "father's day":     { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#0a1012 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '👔', decorEmoji: '⭐' },
  'fathers day':      { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#0a1012 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '👔', decorEmoji: '⭐' },
  default:            { bgGradient: 'linear-gradient(135deg,#1E3E3A 0%,#0a1012 100%)', accent: '#ED6823', textColor: '#FFFFFF', emoji: '🎉', decorEmoji: '✨' },
}

export function getHolidayTheme(holiday: string): HolidayTheme {
  const lower = holiday.toLowerCase()
  const key = Object.keys(HOLIDAY_THEMES).find((k) => lower.includes(k))
  return key ? HOLIDAY_THEMES[key] : HOLIDAY_THEMES.default
}

// ─────────────────────────────────────────────────────────────
// BIRTHDAY CARD TEMPLATES
// ─────────────────────────────────────────────────────────────

function birthdayClassic(staffName: string, photoUrl: string, greeting: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1350px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1350px;background:linear-gradient(150deg,#0A1012 0%,#1E3E3A 55%,#0A1012 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}
    .glow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 40%,rgba(42,170,187,0.18) 0%,transparent 70%);pointer-events:none;}
    .corner-decor{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:40px;font-size:36px;opacity:0.22;}
    .photo-wrap{position:relative;z-index:2;margin-bottom:32px;}
    .photo-ring{width:320px;height:320px;border-radius:50%;background:#1E3E3A;
      box-shadow:0 0 0 6px #ED6823,0 0 0 12px rgba(201,162,39,0.2),0 20px 60px rgba(0,0,0,0.5);overflow:hidden;}
    .photo-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
    .bday-tag{font-family:'Comfortaa',sans-serif;font-size:15px;font-weight:700;letter-spacing:0.35em;
      text-transform:uppercase;color:#ED6823;margin-bottom:14px;position:relative;z-index:2;}
    .name{font-family:'Comfortaa',sans-serif;font-size:66px;font-weight:900;color:#fff;
      letter-spacing:-0.02em;line-height:1.05;text-align:center;position:relative;z-index:2;margin-bottom:16px;}
    .divider{width:60px;height:3px;background:#ED6823;border-radius:2px;margin:0 auto 18px;position:relative;z-index:2;}
    .greeting{font-size:20px;color:rgba(255,255,255,0.72);text-align:center;max-width:680px;
      line-height:1.65;position:relative;z-index:2;}
    .footer{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;
      gap:14px;padding:26px;border-top:1px solid rgba(201,162,39,0.2);z-index:2;}
    .footer-text{font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;
      letter-spacing:0.2em;text-transform:uppercase;color:#2E5E5A;}
  </style>
</head><body>
  <div class="card">
    <div class="glow"></div>
    <div class="corner-decor"><span>🎂</span><span>🎊</span></div>
    <div class="photo-wrap"><div class="photo-ring"><img src="${photoUrl}" alt="${staffName}"/></div></div>
    <div class="bday-tag">✨ Happy Birthday ✨</div>
    <div class="name">${staffName}</div>
    <div class="divider"></div>
    <div class="greeting">${greeting}</div>
    <div class="footer">${LOGO_SVG_WHITE}<span class="footer-text">Sapphire Clinics East, Inc.</span></div>
  </div>
</body></html>`
}

function birthdayElegant(staffName: string, photoUrl: string, greeting: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1350px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1350px;background:#f7fbfc;display:flex;flex-direction:row;position:relative;overflow:hidden;}
    .left{width:430px;height:100%;background:linear-gradient(180deg,#1E3E3A 0%,#2E5E5A 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;gap:28px;position:relative;}
    .photo-ring{width:290px;height:290px;border-radius:50%;border:6px solid #ED6823;
      box-shadow:0 8px 40px rgba(0,0,0,0.3);overflow:hidden;}
    .photo-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
    .left-brand{display:flex;align-items:center;gap:10px;}
    .left-brand-text{font-family:'Comfortaa',sans-serif;font-size:11px;font-weight:700;
      letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.65);}
    .right{flex:1;display:flex;flex-direction:column;justify-content:center;padding:70px 60px 70px 70px;position:relative;}
    .corner-accent{position:absolute;top:0;right:0;width:160px;height:160px;
      background:radial-gradient(circle at top right,rgba(201,162,39,0.09),transparent 70%);}
    .corner-accent-br{position:absolute;bottom:0;left:0;width:180px;height:180px;
      background:radial-gradient(circle at bottom left,rgba(46,94,90,0.06),transparent 70%);}
    .emoji-row{font-size:32px;letter-spacing:8px;margin-bottom:20px;}
    .tag{font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.4em;
      text-transform:uppercase;color:#ED6823;margin-bottom:18px;}
    .name{font-family:'Comfortaa',sans-serif;font-size:60px;font-weight:900;color:#1C2B30;
      letter-spacing:-0.02em;line-height:1.05;margin-bottom:22px;}
    .bar{width:50px;height:4px;background:#2E5E5A;border-radius:2px;margin-bottom:22px;}
    .greeting{font-size:19px;color:#4a5a60;line-height:1.7;}
  </style>
</head><body>
  <div class="card">
    <div class="left">
      <div class="photo-ring"><img src="${photoUrl}" alt="${staffName}"/></div>
      <div class="left-brand">${LOGO_SVG_WHITE}<span class="left-brand-text">SCEI</span></div>
    </div>
    <div class="right">
      <div class="corner-accent"></div>
      <div class="corner-accent-br"></div>
      <div class="emoji-row">🎂 🎊 🎁</div>
      <div class="tag">Happy Birthday</div>
      <div class="name">${staffName}</div>
      <div class="bar"></div>
      <div class="greeting">${greeting}</div>
    </div>
  </div>
</body></html>`
}

function birthdayBold(staffName: string, photoUrl: string, greeting: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1350px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1350px;background:#2E5E5A;
      display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden;}
    .bg-c1{position:absolute;width:700px;height:700px;border-radius:50%;
      background:rgba(255,255,255,0.06);top:-200px;right:-200px;}
    .bg-c2{position:absolute;width:500px;height:500px;border-radius:50%;
      background:rgba(13,91,104,0.4);bottom:-100px;left:-100px;}
    .top-tag{width:100%;text-align:center;padding-top:36px;position:relative;z-index:2;
      font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.5em;
      text-transform:uppercase;color:rgba(255,255,255,0.55);}
    .photo-frame{position:relative;z-index:2;margin-top:30px;margin-bottom:28px;}
    .outer-ring{width:316px;height:316px;border-radius:50%;background:#ED6823;
      display:flex;align-items:center;justify-content:center;}
    .inner-ring{width:300px;height:300px;border-radius:50%;overflow:hidden;}
    .inner-ring img{width:100%;height:100%;object-fit:cover;}
    .name{font-family:'Comfortaa',sans-serif;font-size:70px;font-weight:900;color:#fff;
      letter-spacing:-0.02em;line-height:1;text-align:center;position:relative;z-index:2;}
    .divider-row{display:flex;align-items:center;gap:16px;margin:18px 0;position:relative;z-index:2;}
    .div-line{width:80px;height:2px;background:rgba(255,255,255,0.3);}
    .div-emoji{font-size:24px;}
    .greeting{font-size:20px;color:rgba(255,255,255,0.82);text-align:center;max-width:700px;
      line-height:1.6;position:relative;z-index:2;padding:0 40px;}
    .footer{position:absolute;bottom:28px;display:flex;align-items:center;gap:14px;z-index:2;}
    .footer-text{font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;
      letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.55);}
  </style>
</head><body>
  <div class="card">
    <div class="bg-c1"></div><div class="bg-c2"></div>
    <div class="top-tag">✨ Birthday Celebration ✨</div>
    <div class="photo-frame">
      <div class="outer-ring"><div class="inner-ring"><img src="${photoUrl}" alt="${staffName}"/></div></div>
    </div>
    <div class="name">${staffName}</div>
    <div class="divider-row"><div class="div-line"></div><span class="div-emoji">🎂</span><div class="div-line"></div></div>
    <div class="greeting">${greeting}</div>
    <div class="footer">${LOGO_SVG_WHITE}<span class="footer-text">Sapphire Clinics East, Inc.</span></div>
  </div>
</body></html>`
}

function birthdaySandbox(staffName: string, photoUrl: string, greeting: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1350px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1350px;background:linear-gradient(150deg,#1a0800 0%,#5c1e00 50%,#1a0800 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}
    .glow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 40%,rgba(244,116,39,0.22) 0%,transparent 70%);pointer-events:none;}
    .ring-outer{position:absolute;width:600px;height:600px;border-radius:50%;border:1px solid rgba(244,116,39,0.08);top:50%;left:50%;transform:translate(-50%,-58%);}
    .ring-inner{position:absolute;width:440px;height:440px;border-radius:50%;border:1px solid rgba(244,116,39,0.05);top:50%;left:50%;transform:translate(-50%,-58%);}
    .corner-decor{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:40px;font-size:36px;opacity:0.18;}
    .photo-wrap{position:relative;z-index:2;margin-bottom:32px;}
    .photo-ring{width:320px;height:320px;border-radius:50%;background:#3a1200;
      box-shadow:0 0 0 6px #F47427,0 0 0 12px rgba(244,116,39,0.18),0 24px 64px rgba(0,0,0,0.55);overflow:hidden;}
    .photo-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
    .bday-tag{font-family:'Comfortaa',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4em;
      text-transform:uppercase;color:#F47427;margin-bottom:14px;position:relative;z-index:2;}
    .name{font-family:'Comfortaa',sans-serif;font-size:64px;font-weight:900;color:#fff;
      letter-spacing:-0.02em;line-height:1.05;text-align:center;position:relative;z-index:2;margin-bottom:16px;}
    .divider{width:56px;height:3px;background:#F47427;border-radius:2px;margin:0 auto 18px;position:relative;z-index:2;}
    .greeting{font-size:19px;color:rgba(255,255,255,0.68);text-align:center;max-width:700px;
      line-height:1.65;position:relative;z-index:2;padding:0 40px;}
    .footer{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;
      gap:14px;padding:26px;border-top:1px solid rgba(244,116,39,0.15);z-index:2;}
    .footer-text{font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;
      letter-spacing:0.22em;text-transform:uppercase;color:#F47427;}
    .footer-icon{font-size:22px;}
  </style>
</head><body>
  <div class="card">
    <div class="glow"></div>
    <div class="ring-outer"></div>
    <div class="ring-inner"></div>
    <div class="corner-decor"><span>🎂</span><span>🎊</span></div>
    <div class="photo-wrap"><div class="photo-ring"><img src="${photoUrl}" alt="${staffName}"/></div></div>
    <div class="bday-tag">✨ Happy Birthday ✨</div>
    <div class="name">${staffName}</div>
    <div class="divider"></div>
    <div class="greeting">${greeting}</div>
    <div class="footer"><span class="footer-icon">🌿</span><span class="footer-text">Sandbox Clinic</span></div>
  </div>
</body></html>`
}

function birthdayVerdana(staffName: string, photoUrl: string, greeting: string): string {
  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1350px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1350px;background:linear-gradient(150deg,#061409 0%,#1a3d22 50%,#061409 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}
    .glow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 40%,rgba(45,106,79,0.28) 0%,transparent 70%);pointer-events:none;}
    .leaf-tl{position:absolute;top:-30px;left:-30px;font-size:180px;opacity:0.05;line-height:1;transform:rotate(-20deg);}
    .leaf-br{position:absolute;bottom:-30px;right:-30px;font-size:180px;opacity:0.05;line-height:1;transform:rotate(160deg);}
    .corner-decor{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:40px;font-size:36px;opacity:0.2;}
    .photo-wrap{position:relative;z-index:2;margin-bottom:32px;}
    .photo-ring{width:320px;height:320px;border-radius:50%;background:#1a3d22;
      box-shadow:0 0 0 6px #52B788,0 0 0 12px rgba(82,183,136,0.18),0 24px 64px rgba(0,0,0,0.55);overflow:hidden;}
    .photo-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;}
    .bday-tag{font-family:'Comfortaa',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4em;
      text-transform:uppercase;color:#52B788;margin-bottom:14px;position:relative;z-index:2;}
    .name{font-family:'Comfortaa',sans-serif;font-size:64px;font-weight:900;color:#fff;
      letter-spacing:-0.02em;line-height:1.05;text-align:center;position:relative;z-index:2;margin-bottom:16px;}
    .divider{width:56px;height:3px;background:#52B788;border-radius:2px;margin:0 auto 18px;position:relative;z-index:2;}
    .greeting{font-size:19px;color:rgba(255,255,255,0.68);text-align:center;max-width:700px;
      line-height:1.65;position:relative;z-index:2;padding:0 40px;}
    .footer{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;
      gap:14px;padding:26px;border-top:1px solid rgba(82,183,136,0.15);z-index:2;}
    .footer-text{font-family:'Comfortaa',sans-serif;font-size:13px;font-weight:700;
      letter-spacing:0.22em;text-transform:uppercase;color:#52B788;}
    .footer-icon{font-size:22px;}
  </style>
</head><body>
  <div class="card">
    <div class="glow"></div>
    <div class="leaf-tl">🌿</div>
    <div class="leaf-br">🌿</div>
    <div class="corner-decor"><span>🌱</span><span>🎊</span></div>
    <div class="photo-wrap"><div class="photo-ring"><img src="${photoUrl}" alt="${staffName}"/></div></div>
    <div class="bday-tag">✨ Happy Birthday ✨</div>
    <div class="name">${staffName}</div>
    <div class="divider"></div>
    <div class="greeting">${greeting}</div>
    <div class="footer"><span class="footer-icon">🌿</span><span class="footer-text">Verdana Store</span></div>
  </div>
</body></html>`
}

export function generateBirthdayCardHTML(params: {
  staffName: string
  photoUrl: string
  caption: string
  branch?: string
  template?: BirthdayTemplateStyle
}): string {
  const { staffName, photoUrl, branch = 'east', template = 'classic' } = params
  const branchData = BRANCHES.find((b) => b.id === branch) ?? BRANCHES[0]
  const greeting = branchData.greeting
  if (template === 'elegant') return birthdayElegant(staffName, photoUrl, greeting)
  if (template === 'bold') return birthdayBold(staffName, photoUrl, greeting)
  if (template === 'sandbox') return birthdaySandbox(staffName, photoUrl, greeting)
  if (template === 'verdana') return birthdayVerdana(staffName, photoUrl, greeting)
  return birthdayClassic(staffName, photoUrl, greeting)
}

// ─────────────────────────────────────────────────────────────
// HOLIDAY CARD TEMPLATE
// ─────────────────────────────────────────────────────────────

export function generateHolidayCardHTML(params: {
  holiday: string
  date: string
  caption: string
  branch?: string
}): string {
  const { holiday, date, caption, branch = 'east' } = params
  const theme = getHolidayTheme(holiday)
  const branchData = BRANCHES.find((b) => b.id === branch) ?? BRANCHES[0]
  const isLight = theme.textColor === '#1C2B30'
  const logo = isLight ? LOGO_SVG_TEAL : LOGO_SVG_WHITE
  const captionColor = isLight ? 'rgba(28,43,48,0.75)' : 'rgba(255,255,255,0.82)'

  return `<!DOCTYPE html><html><head>
  <meta charset="UTF-8"/>
  <link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{width:1080px;height:1080px;overflow:hidden;font-family:'DM Sans',sans-serif;}
    .card{width:1080px;height:1080px;background:${theme.bgGradient};
      display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}
    .glow{position:absolute;inset:0;background:radial-gradient(ellipse 65% 50% at 50% 40%,rgba(255,255,255,0.07) 0%,transparent 70%);}
    .decor-tl{position:absolute;top:28px;left:28px;font-size:72px;opacity:0.1;line-height:1;}
    .decor-tr{position:absolute;top:28px;right:28px;font-size:48px;opacity:0.1;line-height:1;}
    .decor-br{position:absolute;bottom:70px;right:28px;font-size:72px;opacity:0.1;line-height:1;}
    .main-emoji{font-size:108px;margin-bottom:24px;position:relative;z-index:2;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.25));}
    .pre-label{font-family:'Comfortaa',sans-serif;font-size:14px;font-weight:700;
      letter-spacing:0.4em;text-transform:uppercase;color:${theme.accent};margin-bottom:14px;position:relative;z-index:2;}
    .holiday-name{font-family:'Comfortaa',sans-serif;font-size:78px;font-weight:900;
      color:${theme.textColor};letter-spacing:-0.02em;line-height:1.0;text-align:center;
      position:relative;z-index:2;margin-bottom:16px;text-shadow:0 4px 24px rgba(0,0,0,0.2);}
    .divider{width:70px;height:4px;background:${theme.accent};border-radius:2px;margin:0 auto 26px;position:relative;z-index:2;}
    .caption{font-size:22px;color:${captionColor};text-align:center;max-width:750px;
      line-height:1.65;position:relative;z-index:2;padding:0 40px;}
    .footer{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;
      justify-content:center;gap:14px;padding:24px;border-top:1px solid rgba(255,255,255,0.1);z-index:2;}
    .footer-text{font-family:'Comfortaa',sans-serif;font-size:12px;font-weight:700;
      letter-spacing:0.22em;text-transform:uppercase;color:${theme.accent};}
  </style>
</head><body>
  <div class="card">
    <div class="glow"></div>
    <div class="decor-tl">${theme.emoji}</div>
    <div class="decor-tr">${theme.decorEmoji}</div>
    <div class="decor-br">${theme.decorEmoji}</div>
    <div class="main-emoji">${theme.emoji}</div>
    <div class="pre-label">${branchData.label} Wishes You</div>
    <div class="holiday-name">${holiday}</div>
    <div class="divider"></div>
    <div class="caption">${caption}</div>
    <div class="footer">${logo}<span class="footer-text">Sapphire Clinics East, Inc. · ${date}</span></div>
  </div>
</body></html>`
}

export async function ensureUploadDir(subdir = '') {
  const dir = path.join(process.cwd(), 'uploads', subdir)
  await fs.mkdir(dir, { recursive: true })
  return dir
}
