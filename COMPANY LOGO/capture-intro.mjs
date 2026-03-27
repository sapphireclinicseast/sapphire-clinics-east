/**
 * capture-intro.mjs
 * Captures scei-logo-intro.html animation as:
 *   - scei-logo-intro.mp4  (H.264, suitable for embedding / social)
 *   - scei-logo-intro.gif  (looping, via ffmpeg palette trick)
 *
 * Usage: node capture-intro.mjs
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILE = path.join(__dirname, 'scei-logo-intro.html');
const OUT_DIR   = __dirname;

// Animation total: replay btn appears at ~5s; give extra 1.5s hold on final frame
const ANIM_DURATION_MS = 6500;

// Output resolution — 800×800 gives a crisp 1:1 crop around the logo
const WIDTH  = 800;
const HEIGHT = 800;

(async () => {
  console.log('▶  Launching Chromium…');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  const page = await context.newPage();

  // Navigate to local file
  await page.goto(`file://${HTML_FILE}`);

  // Hide the replay button so it doesn't appear in the output
  await page.addStyleTag({ content: '.replay-btn, .embed-note { display: none !important; }' });

  console.log(`⏳  Recording animation (${ANIM_DURATION_MS / 1000}s)…`);
  await page.waitForTimeout(ANIM_DURATION_MS);

  // Close context — Playwright finalises the .webm on context close
  await context.close();
  await browser.close();

  // Playwright saves as a random-named .webm inside OUT_DIR; find it
  const webms = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.webm'));
  if (!webms.length) throw new Error('No .webm recording found.');
  const latestWebm = webms
    .map(f => ({ f, t: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f;
  const webmPath = path.join(OUT_DIR, latestWebm);
  console.log(`✔  Raw recording: ${latestWebm}`);

  // ── MP4 ─────────────────────────────────────────────────────────────────
  const mp4Path = path.join(OUT_DIR, 'scei-logo-intro.mp4');
  console.log('🎬  Encoding MP4…');
  execSync(
    `ffmpeg -y -i "${webmPath}" ` +
    `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ` +
    `-movflags +faststart "${mp4Path}"`,
    { stdio: 'inherit' }
  );
  console.log(`✔  MP4 saved → ${mp4Path}`);

  // ── GIF (two-pass palette trick for high quality) ────────────────────────
  const gifPath     = path.join(OUT_DIR, 'scei-logo-intro.gif');
  const palettePath = path.join(OUT_DIR, '_palette.png');
  console.log('🎨  Building GIF palette…');
  execSync(
    `ffmpeg -y -i "${webmPath}" ` +
    `-vf "fps=20,scale=600:-1:flags=lanczos,palettegen=stats_mode=diff" ` +
    `"${palettePath}"`,
    { stdio: 'inherit' }
  );
  console.log('🎞   Encoding GIF…');
  execSync(
    `ffmpeg -y -i "${webmPath}" -i "${palettePath}" ` +
    `-filter_complex "fps=20,scale=600:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ` +
    `-loop 0 "${gifPath}"`,
    { stdio: 'inherit' }
  );
  fs.unlinkSync(palettePath);
  console.log(`✔  GIF saved  → ${gifPath}`);

  // Clean up raw webm
  fs.unlinkSync(webmPath);
  console.log('🧹  Cleaned up raw .webm');
  console.log('\n✅  Done!');
})();
