import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import sax from 'sax';
import { getHome, getPages, getPosts } from '../src/lib/content';
import { site } from '../src/site.config';

interface LegacyEntry { path: string; url: string; sha256: string }
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/legacy-content.json'), 'utf8')) as {
  posts: LegacyEntry[]; pages: LegacyEntry[];
};
const legacy = [...fixture.posts, ...fixture.pages];
const flags = new Set(process.argv.slice(2));
assert.ok([...flags].every(flag => flag === '--check-source-hashes'), 'Only --check-source-hashes is supported.');

// Opt in for the one-time migration audit. Normal verification allows authors
// to update existing Markdown without maintaining a snapshot of its wording.
if (flags.has('--check-source-hashes')) {
  for (const entry of legacy) {
    const hash = createHash('sha256').update(await readFile(path.join(root, entry.path))).digest('hex');
    assert.equal(hash, entry.sha256, `Original Markdown/HTML changed: ${entry.path}`);
  }
  console.log(`Source preservation: all ${legacy.length} original content files are byte-for-byte unchanged.`);
}

const [posts, pages, home] = await Promise.all([getPosts(), getPages(), getHome()]);
const content = [...posts, ...pages, home];
const contentBySource = new Map(content.map(page => [page.source, page]));
const localHosts = new Set([new URL(site.url).hostname, 'yumulab.org', 'www.yumulab.org', 'yumulab.github.io']);
const files = new Set<string>();
async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.add(path.relative(dist, full).split(path.sep).join('/'));
  }
}
await walk(dist);

function outputPath(url: string): string {
  const pathname = decodeURIComponent(new URL(url, site.url).pathname);
  return pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
}
const documents = new Map<string, ReturnType<typeof load>>();
for (const file of files) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(path.join(dist, file), 'utf8');
  assert.doesNotMatch(html, /\{[{%]/, `Unrendered Liquid in ${file}`);
  const $ = load(html);
  assert.equal($('meta[http-equiv]').filter((_, element) => ($(element).attr('http-equiv') ?? '').toLowerCase() === 'refresh').length,
    0, `Unexpected redirect page: ${file}`);
  assert.ok($('title').text(), `Missing title in ${file}`);
  documents.set(file, $);
}

for (const entry of legacy) {
  const page = contentBySource.get(entry.path);
  assert.ok(page, `Missing original source: ${entry.path}`);
  assert.equal(page.url, entry.url, `URL changed for ${entry.path}`);
  const file = outputPath(entry.url);
  assert.ok(files.has(file), `Legacy URL must be a direct HTML file: ${entry.url}`);
  const $ = documents.get(file)!;
  assert.ok($('main').text().includes(page.title) || entry.url === '/', `Missing article/page title at ${entry.url}`);
  assert.equal(new URL($('link[rel="canonical"]').attr('href')!).pathname, entry.url, `Canonical URL changed: ${entry.url}`);
}
for (const page of content) {
  const file = outputPath(page.url);
  const $ = documents.get(file);
  assert.ok($, `Missing content output: ${page.url}`);
  const rendered = load(page.html);
  for (const tag of ['iframe', 'script']) {
    assert.ok($(tag).length >= rendered(tag).length, `Embedded ${tag} lost in ${page.url}`);
  }
}

// Check generated pages, navigation, article links, images, scripts, stylesheet
// links and same-site absolute URLs. External services are intentionally not fetched.
let references = 0;
function checkReference(raw: string, from: string, element: string): void {
  if (!raw || raw.startsWith('data:')) return;
  let url: URL;
  try { url = new URL(raw, `${site.url}/${from === 'index.html' ? '' : from}`); }
  catch { assert.fail(`Invalid ${element} URL in ${from}: ${raw}`); }
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname)) return;
  const target = outputPath(url.href);
  assert.ok(files.has(target), `Missing local ${element} target in ${from}: ${raw} -> ${target}`);
  references++;
  if (url.hash && documents.has(target)) {
    const id = decodeURIComponent(url.hash.slice(1));
    if (id) {
      const $target = documents.get(target)!;
      const exists = $target('[id], a[name]').toArray().some(node =>
        $target(node).attr('id') === id || $target(node).attr('name') === id);
      assert.ok(exists, `Missing anchor in ${from}: ${raw}`);
    }
  }
}
for (const [file, $] of documents) {
  $('[href], [src], [poster]').each((_, element) => {
    for (const attribute of ['href', 'src', 'poster']) {
      const value = $(element).attr(attribute);
      if (value !== undefined) checkReference(value, file, attribute);
    }
  });
  $('[srcset]').each((_, element) => {
    for (const candidate of ($(element).attr('srcset') ?? '').split(',')) {
      checkReference(candidate.trim().split(/\s+/)[0], file, 'srcset');
    }
  });
}

const $home = documents.get('index.html')!;
const homeLinks = new Set($home('a[href]').toArray().map(link => $home(link).attr('href')));
for (const post of posts) assert.ok(homeLinks.has(post.url), `Homepage omits ${post.url}`);
assert.ok(homeLinks.has('/collaboration.html'), 'Homepage navigation must use the published collaboration URL.');
assert.ok(!homeLinks.has('/collaboration.md'), 'Homepage still links to unpublished collaboration Markdown.');

function parseXml(source: string, name: string) {
  const parser = sax.parser(true, { xmlns: true });
  parser.onerror = error => { throw new Error(`Invalid ${name}: ${error.message}`); };
  parser.write(source).close();
  return load(source, { xml: true });
}
const $sitemap = parseXml(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'), 'sitemap.xml');
assert.equal($sitemap('urlset').attr('xmlns'), 'http://www.sitemaps.org/schemas/sitemap/0.9');
const sitemapLocations = $sitemap('url > loc').toArray().map(node => $sitemap(node).text());
assert.equal(new Set(sitemapLocations).size, sitemapLocations.length, 'Duplicate sitemap entries.');
const sitemapPaths = new Set(sitemapLocations.map(url => new URL(url).pathname));
for (const page of content) assert.ok(sitemapPaths.has(page.url), `Sitemap omits ${page.url}`);
for (const url of sitemapLocations) checkReference(url, 'sitemap.xml', 'sitemap');

const $feed = parseXml(await readFile(path.join(dist, 'feed.xml'), 'utf8'), 'feed.xml');
assert.equal($feed('feed').attr('xmlns'), 'http://www.w3.org/2005/Atom');
assert.equal($feed('feed > id').text(), 'https://yumulab.org/feed.xml', 'Existing feed identity must remain stable.');
const entries = $feed('entry').toArray();
assert.equal(entries.length, Math.min(posts.length, 10));
for (const [index, node] of entries.entries()) {
  const entry = $feed(node);
  const post = posts[index];
  const href = entry.find('link[rel="alternate"]').attr('href')!;
  assert.equal(new URL(href).pathname, post.url, `Feed order/URL differs for entry ${index}.`);
  assert.equal(entry.find('id').text(), `https://yumulab.org${post.url.replace(/\.html$/, '')}`,
    `Existing Atom identity changed for ${post.url}`);
  assert.equal(entry.find('title').text(), post.title);
  assert.equal(entry.find('content').text(), post.html, `Feed HTML did not round-trip XML escaping: ${post.url}`);
  assert.ok(Number.isFinite(Date.parse(entry.find('published').text())), `Invalid feed date: ${post.url}`);
  checkReference(href, 'feed.xml', 'feed');
}

assert.equal((await readFile(path.join(dist, 'CNAME'), 'utf8')).trim(), 'www.yumulab.org');
assert.ok(files.has('.nojekyll'), 'Missing .nojekyll.');
assert.equal((await stat(path.join(dist, '.nojekyll'))).size, 0);
assert.match(await readFile(path.join(dist, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/www\.yumulab\.org\/sitemap\.xml/);
assert.ok(files.has('404.html'), 'Missing GitHub Pages 404 page.');

let assetCount = 0;
async function verifyAssets(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyAssets(source);
    else if (!entry.name.endsWith('.scss')) {
      const relative = path.relative(root, source);
      assert.deepEqual(await readFile(path.join(dist, relative)), await readFile(source), `Asset changed or missing: ${relative}`);
      assetCount++;
    }
  }
}
await verifyAssets(path.join(root, 'assets'));
console.log(`Verified ${fixture.posts.length} legacy article URLs, ${fixture.pages.length} content-page URLs, ${posts.length} listed articles, ${documents.size} HTML pages, ${references} local references and ${assetCount} unchanged assets.`);
console.log('Atom feed and sitemap are valid XML; CNAME, robots.txt, 404.html and .nojekyll are present.');
