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

/** Parse YAML-style frontmatter from a markdown file.
 *  Handles single-line key:value pairs and folded multi-line values where
 *  the CMS wraps long titles/summaries onto indented continuation lines. */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const data = {};
  let lastKey = null;
  match[1].split(/\r?\n/).forEach(line => {
    if (!line.trim()) { lastKey = null; return; }

    // Indented line with no preceding key → ignore.
    // Indented line right after a key:value → treat as folded continuation
    // (YAML's default behavior: newline replaced by single space).
    const isContinuation = /^\s/.test(line) && lastKey !== null;
    if (isContinuation) {
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim();
      return;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { lastKey = null; return; }
    const key = line.slice(0, colonIdx).trim();
    let   val = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    val = val.replace(/^["']|["']$/g, '');
    if (key) {
      data[key] = val;
      lastKey = key;
    }
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
