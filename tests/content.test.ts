import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from 'cheerio';
import { getHome, getPages, getPosts, parsePost, placeholderThumbnail, renderBody, resolveLiquid } from '../src/lib/content';

interface LegacyEntry { path: string; url: string; sha256: string }
const fixture = JSON.parse(await readFile(new URL('./fixtures/legacy-content.json', import.meta.url), 'utf8')) as {
  posts: LegacyEntry[]; pages: LegacyEntry[];
};
const [posts, pages, home] = await Promise.all([getPosts(), getPages(), getHome()]);

// Lock the public URL contract, while allowing new articles and ordinary edits.
test('every legacy article and content page retains its original URL', () => {
  const bySource = new Map([...posts, ...pages, home].map(page => [page.source, page.url]));
  for (const entry of [...fixture.posts, ...fixture.pages]) {
    assert.equal(bySource.get(entry.path), entry.url, entry.path);
  }
  assert.equal(new Set(posts.map(post => post.url)).size, posts.length);
});

test('legacy case-sensitive slugs and the cevent category remain intact', () => {
  assert.equal(posts.find(post => post.source.endsWith('2024-04-29-NThakodate.md'))?.url,
    '/event/2024/04/29/NThakodate.html');
  const legacy = fixture.posts.find(post => post.url.startsWith('/cevent/'))!;
  assert.ok(legacy);
  assert.equal(posts.find(post => post.source === legacy.path)?.url, legacy.url);
});

test('quoted Jekyll relative_url expressions become root-relative links', () => {
  assert.equal(resolveLiquid('![photo]({{ "/assets/photo.jpg" | relative_url }})'), '![photo](/assets/photo.jpg)');
  assert.equal(resolveLiquid("[About]({{ 'about.html' | relative_url }})"), '[About](/about.html)');
  assert.equal(resolveLiquid('{{"/"|relative_url}}'), '/');
  assert.throws(() => resolveLiquid('{{ site.url }}'), /Unsupported Liquid syntax/);
  assert.throws(() => resolveLiquid('{% include photo.html %}'), /Unsupported Liquid syntax/);
});

test('all authored embedded iframes and scripts survive Markdown conversion', async () => {
  let iframeCount = 0;
  let scriptCount = 0;
  for (const post of posts) {
    const source = await readFile(post.source, 'utf8');
    const $ = load(post.html);
    for (const tag of ['iframe', 'script']) {
      const expected = (source.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;
      assert.equal($(tag).length, expected, `${post.source}: ${tag}`);
    }
    iframeCount += $('iframe').length;
    scriptCount += $('script').length;
    assert.doesNotMatch(post.html, /\{[{%]/, post.source);
  }
  // Assert that this actually exercised both kinds of embedded content.
  assert.ok(iframeCount > 0);
  assert.ok(scriptCount > 0);
});

test('Markdown nesting, Unicode headings, duplicate anchors and inline markup work', () => {
  const rendered = renderBody('## 研究テーマ\n\n- parent\n  - child\n\n### 感想\n\n**重要**です。\n\n### 感想\n');
  const $ = load(rendered.html);
  assert.equal($('ul > li > ul > li').text(), 'child');
  assert.equal($('strong').text(), '重要');
  assert.deepEqual(rendered.headings.map(heading => heading.id), ['研究テーマ', '感想', '感想-1']);
  assert.ok($('#研究テーマ').length);
  assert.ok($('#感想-1').length);
});

test('raw HTML and Speaker Deck markup remain HTML', () => {
  const html = '<div><iframe src="https://speakerdeck.com/player/example" allowfullscreen></iframe></div>';
  assert.equal(renderBody(html, true).html, html);
  const script = '<script defer class="speakerdeck-embed" data-id="example" src="//speakerdeck.com/assets/embed.js"></script>';
  assert.equal(load(renderBody(script).html)('script.speakerdeck-embed').attr('data-id'), 'example');
  assert.ok(!home.html.includes('relative_url'));
});

test('the existing WISS image typo is repaired while leaving Markdown input unchanged', () => {
  const markdown = '![WISS2021]({{ \"/assets/images/2021/WISS2021.png\" | relative_url }})';
  const rendered = renderBody(markdown);
  assert.match(markdown, /WISS2021\.png/);
  assert.equal(load(rendered.html)('img').first().attr('src'), '/assets/images/2021/WISS2021.jpg');
});

const example = (metadata = '', body = 'Article body') => `---\nlayout: post\ntitle: Example\ncategories: research events\ntags: [demo]\n${metadata}---\n${body}\n`;

test('new article metadata supports categories, publication flags and explicit URLs', () => {
  const post = parsePost(example(), '_posts/2020-01-02-CamelCase.md')!;
  assert.equal(post.url, '/research/events/2020/01/02/CamelCase.html');
  assert.deepEqual(post.tags, ['demo']);
  assert.equal(parsePost(example('published: false\n'), '_posts/2020-01-02-draft.md'), null);
  assert.equal(parsePost(example(), '_posts/9999-01-02-future.md'), null);
  assert.equal(parsePost(example('date: 2020-02-03\nslug: revised\n'), '_posts/2020-01-02-original.md')?.url,
    '/research/events/2020/02/03/revised.html');
  assert.equal(parsePost(example('permalink: /existing/custom.html\n'), '_posts/2020-01-02-original.md')?.url,
    '/existing/custom.html');
});

test('invalid dates and unsafe or incompatible article URLs fail the build', () => {
  assert.throws(() => parsePost(example(), '_posts/2020-02-30-bad.md'), /Invalid post date/);
  assert.throws(() => parsePost(example(), '_posts/undated.md'), /YYYY-MM-DD-slug/);
  for (const permalink of ['https://example.com/post.html', '/post/', '/../post.html', '/post.html?x=1']) {
    assert.throws(() => parsePost(example(`permalink: ${permalink}\n`), '_posts/2020-01-02-bad.md'), /absolute .html permalink/);
  }
});

test('an authored description takes precedence over the generated excerpt', () => {
  assert.equal(parsePost(example('description: Authored summary\n', 'Different article content'), '_posts/2020-01-02-described.md')?.description, 'Authored summary');
  assert.equal(parsePost(example('description: \"\"\n', 'Generated fallback'), '_posts/2020-01-02-described.md')?.description, 'Generated fallback');
});

test('thumbnails use the first rendered article image and retain legacy image fixes', () => {
  const post = parsePost(example('', '![First]({{ "/assets/images/2021/WISS2021.png" | relative_url }})\n\n![Second](/assets/images/second.jpg)'), '_posts/2020-01-02-photos.md')!;
  assert.equal(post.thumbnail, '/assets/images/2021/WISS2021.jpg');
  assert.ok(post.html.includes('/assets/images/second.jpg'));
});

test('an optional thumbnail overrides the article image and image-free posts get a placeholder', () => {
  const body = '![Article photo](/assets/images/body.jpg)';
  assert.equal(parsePost(example('thumbnail: /assets/images/cover.jpg\n', body), '_posts/2020-01-02-cover.md')?.thumbnail, '/assets/images/cover.jpg');
  assert.equal(parsePost(example(), '_posts/2020-01-02-no-photo.md')?.thumbnail, placeholderThumbnail);
  assert.equal(parsePost(example('thumbnail: \"\"\n', body), '_posts/2020-01-02-empty.md')?.thumbnail, '/assets/images/body.jpg');
});

test('HTML and relative thumbnail URLs resolve correctly and unsupported schemes are ignored', () => {
  const post = parsePost(example('', '<img src="../photo.jpg?size=small&amp;v=2" alt="Photo">'), '_posts/2020-01-02-html.md')!;
  assert.equal(post.thumbnail, '/research/events/2020/01/photo.jpg?size=small&v=2');
  assert.equal(parsePost(example('thumbnail: https://example.com/cover.jpg\n'), '_posts/2020-01-02-external.md')?.thumbnail, 'https://example.com/cover.jpg');
  assert.equal(parsePost(example('thumbnail: javascript:alert(1)\n'), '_posts/2020-01-02-invalid.md')?.thumbnail, placeholderThumbnail);
});
