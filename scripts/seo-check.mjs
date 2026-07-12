// SEO audit for the built site. Runs in CI after `astro build` and fails
// the deploy on hard errors (missing/duplicated metadata, broken internal
// links, pages missing from the sitemap). Softer signals (length
// guidelines, missing alt text) are reported as warnings and don't fail
// the build. No dependencies: frontmatter and HTML are scanned with
// regexes, which is fine for lint-level checks on Astro's generated
// output.
//
// Usage: node scripts/seo-check.mjs
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CONTENT = join(ROOT, 'src', 'content', 'posts');
const SITE = 'https://nazet.jp';

const errors = [];
const warnings = [];
const error = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------
// 1. Frontmatter lint on source posts (skips drafts — not published)
// ---------------------------------------------------------------
const slugsByLang = new Map();
if (existsSync(CONTENT)) {
  for (const file of walk(CONTENT).filter((f) => /\.(md|mdx)$/.test(f))) {
    const rel = posix.join(...file.slice(ROOT.length + 1).split(/[\\/]/));
    const text = readFileSync(file, 'utf8');
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      error(rel, 'frontmatter block not found');
      continue;
    }
    const fm = fmMatch[1];
    const get = (key) => {
      const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      if (!m) return undefined;
      return m[1].trim().replace(/^["']|["']$/g, '');
    };

    if (/^draft:\s*true/m.test(fm)) continue;

    const title = get('title');
    const description = get('description');
    const lang = get('lang') ?? 'ja';

    if (!title) error(rel, 'title is missing or empty');
    else if (title.length > 45)
      warn(rel, `title is ${title.length} chars; aim for ≤45 so it isn't truncated in SERPs`);

    if (!description) error(rel, 'description is missing or empty');
    else {
      if (description.length < 30)
        warn(rel, `description is only ${description.length} chars; aim for 30–160`);
      if (description.length > 160)
        warn(rel, `description is ${description.length} chars; aim for 30–160 (Google truncates ~120 for ja)`);
    }

    const tagsLine = get('tags');
    if (!tagsLine || tagsLine === '[]') warn(rel, 'no tags set');

    // Slug = filename without extension; URLs promise stable ascii kebab-case.
    const slug = rel.split('/').pop().replace(/\.(md|mdx)$/, '');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      error(rel, `slug "${slug}" is not ascii kebab-case`);

    const key = `${lang}/${slug}`;
    if (slugsByLang.has(key)) error(rel, `duplicate slug for lang ${lang}: also in ${slugsByLang.get(key)}`);
    else slugsByLang.set(key, rel);
  }
}

// ---------------------------------------------------------------
// 2. Per-page metadata checks on built HTML
// ---------------------------------------------------------------
if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
const distPaths = new Set(
  walk(DIST).map((f) => '/' + posix.join(...f.slice(DIST.length + 1).split(/[\\/]/)))
);

// dist/foo/index.html -> /foo/ (the canonical URL path Astro generates)
function urlPathOf(file) {
  const rel = '/' + posix.join(...file.slice(DIST.length + 1).split(/[\\/]/));
  if (rel.endsWith('/index.html')) return rel.slice(0, -'index.html'.length);
  return rel;
}

const count = (html, re) => (html.match(re) ?? []).length;

for (const file of htmlFiles) {
  const rel = urlPathOf(file);
  if (rel === '/404.html') continue;
  const html = readFileSync(file, 'utf8');

  const titles = count(html, /<title[\s>]/g);
  if (titles !== 1) error(rel, `expected exactly 1 <title>, found ${titles}`);

  if (!/<meta name="description" content="[^"]/.test(html))
    error(rel, 'meta description missing or empty');

  // Astro emits percent-encoded URLs for non-ascii paths (e.g. Japanese
  // tag pages), while `rel` comes from the filesystem, so encode before
  // comparing.
  const expectedUrl = SITE + encodeURI(rel);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical) error(rel, 'canonical link missing');
  else if (canonical !== expectedUrl)
    error(rel, `canonical "${canonical}" does not match expected "${expectedUrl}"`);

  if (!/<html[^>]* lang="[^"]/.test(html)) error(rel, '<html lang> missing');

  const h1s = count(html, /<h1[\s>]/g);
  if (h1s !== 1) warn(rel, `expected exactly 1 <h1>, found ${h1s}`);

  for (const prop of ['og:title', 'og:description', 'og:image', 'og:url']) {
    if (!html.includes(`property="${prop}"`)) error(rel, `${prop} meta missing`);
  }

  // og:image points at our own origin, so the referenced image must
  // actually exist in the build output (catches a broken per-post OG
  // image pipeline before crawlers see 404s).
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (ogImage?.startsWith(SITE)) {
    const imgPath = decodeURIComponent(ogImage.slice(SITE.length));
    if (!distPaths.has(imgPath)) error(rel, `og:image ${ogImage} not found in dist/`);
  }

  const imgsWithoutAlt = count(html, /<img(?![^>]*\balt=)[^>]*>/g);
  if (imgsWithoutAlt > 0) warn(rel, `${imgsWithoutAlt} <img> without alt attribute`);

  // Internal link check: every root-relative or page-relative href/src
  // must resolve to a file in dist/.
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let url = m[1];
    if (/^(https?:)?\/\//.test(url) || url.startsWith('mailto:') || url.startsWith('#')) continue;
    if (url.startsWith(SITE)) url = url.slice(SITE.length);
    url = decodeURIComponent(url.split('#')[0].split('?')[0]);
    if (!url) continue;
    const target = url.startsWith('/')
      ? url
      : posix.normalize(posix.join(posix.dirname(rel), url));
    const candidates = target.endsWith('/')
      ? [target + 'index.html']
      : [target, target + '/index.html'];
    if (!candidates.some((c) => distPaths.has(c)))
      error(rel, `broken internal link: ${m[1]}`);
  }
}

// ---------------------------------------------------------------
// 3. Sitemap / RSS / robots coverage
// ---------------------------------------------------------------
if (!distPaths.has('/sitemap-index.xml')) {
  error('/sitemap-index.xml', 'sitemap index missing from build output');
} else {
  const sitemapUrls = new Set();
  for (const f of walk(DIST).filter((f) => /sitemap-\d+\.xml$/.test(f))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      sitemapUrls.add(m[1]);
    }
  }
  for (const file of htmlFiles) {
    const rel = urlPathOf(file);
    if (rel === '/404.html') continue;
    if (!sitemapUrls.has(SITE + encodeURI(rel)))
      error(rel, 'page not listed in sitemap');
  }
  for (const url of sitemapUrls) {
    if (!url.startsWith(SITE)) {
      error('sitemap', `unexpected origin in sitemap: ${url}`);
      continue;
    }
    const rel = decodeURIComponent(url.slice(SITE.length));
    const candidates = rel.endsWith('/') ? [rel + 'index.html'] : [rel, rel + '/index.html'];
    if (!candidates.some((c) => distPaths.has(c)))
      error('sitemap', `sitemap lists ${url} but no such page in dist/`);
  }
}

if (!distPaths.has('/blog/rss.xml')) error('/blog/rss.xml', 'RSS feed missing from build output');
if (!distPaths.has('/robots.txt')) error('/robots.txt', 'robots.txt missing from build output');
else if (!readFileSync(join(DIST, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/`))
  error('/robots.txt', `robots.txt must reference the sitemap by absolute URL (Sitemap: ${SITE}/...)`);
if (!distPaths.has('/og-default.png')) error('/og-default.png', 'default OG image missing from build output');

// ---------------------------------------------------------------
// Report
// ---------------------------------------------------------------
console.log(`Checked ${htmlFiles.length} HTML pages in dist/.`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length > 0) process.exit(1);
