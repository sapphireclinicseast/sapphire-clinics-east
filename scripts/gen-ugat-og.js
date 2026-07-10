const sharp = require('sharp')
const path = require('path')

const DEEP = '#244952', GREEN = '#4a8073', GOLD = '#c69849', CREAM = '#edf3d9'
const out = process.argv[2] || '/tmp/og.png'

// 1200x630. Left: kicker + 2-line title + subtitle. Right: living-leaf mark.
// Leaf geometry mirrors the site LeafMark (leaf above, roots below), scaled up.
const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e4148"/>
      <stop offset="1" stop-color="#356b60"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Living-leaf mark on the right -->
  <g transform="translate(995,315) scale(2.7)">
    <path d="M0 56 L0 78" fill="none" stroke="#cfe3d0" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M0 56 C -8 64 -14 66 -22 78" fill="none" stroke="#cfe3d0" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M0 56 C 8 64 14 66 22 78" fill="none" stroke="#cfe3d0" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M0 56 L0 22" fill="none" stroke="#cfe3d0" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M0 -72 C 40 -42 40 2 0 22 C -40 2 -40 -42 0 -72 Z" fill="#4a8073"/>
    <path d="M0 -72 C 40 -42 40 2 0 22 L0 -72 Z" fill="#7cc48d"/>
    <line x1="0" y1="20" x2="0" y2="-62" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>
  </g>

  <text x="80" y="238" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="31" letter-spacing="5" fill="${GOLD}">UGNAYAN PARA SA GALING, ARAL, AT TINDIG</text>
  <text x="76" y="338" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="94" fill="#ffffff">UGAT Fellowship</text>
  <text x="76" y="438" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="94" fill="#ffffff">Program</text>
  <text x="80" y="512" font-family="Helvetica, Arial, sans-serif" font-weight="400" font-size="33" fill="${CREAM}">Sapphire Clinics East, Inc.</text>
</svg>`

sharp(Buffer.from(svg)).png().toFile(out).then((info) => {
  console.log('wrote', out, info.width + 'x' + info.height, info.size + ' bytes')
}).catch((e) => { console.error(e); process.exit(1) })
