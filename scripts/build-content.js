/**
 * build-content.js
 * Runs automatically on Netlify before each deploy.
 * Reads all markdown (.md) files from content/blog, content/events,
 * and content/announcements, then generates JSON index files that
 * the website reads to display posts sorted by date (newest first).
 *
 * No external dependencies — runs with plain Node.js.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Parse YAML-style frontmatter from a markdown file */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const data = {};
  match[1].split(/\r?\n/).forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    let   val = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    val = val.replace(/^["']|["']$/g, '');
    if (key) data[key] = val;
  });

  return { ...data, body: match[2].trim() };
}

const sections = ['blog', 'events', 'announcements'];

sections.forEach(section => {
  const dir = path.join(ROOT, 'content', section);

  // Create folder if it doesn't exist yet
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created content/${section}/`);
  }

  // Read all markdown files
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  const posts = files
    .map(filename => {
      const raw    = fs.readFileSync(path.join(dir, filename), 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) {
        console.warn(`  ⚠️  Skipped ${filename} — could not parse frontmatter`);
        return null;
      }
      return { ...parsed, slug: filename.replace('.md', '') };
    })
    .filter(Boolean);

  // Sort newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write index JSON
  const outPath = path.join(ROOT, 'content', `${section}-index.json`);
  fs.writeFileSync(outPath, JSON.stringify(posts, null, 2), 'utf-8');
  console.log(`✅  content/${section}-index.json  →  ${posts.length} post(s)`);
});

console.log('\n🚀 Content build complete.');
