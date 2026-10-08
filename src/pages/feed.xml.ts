import { getPosts } from '../lib/content';
import { xml } from '../lib/xml';
import { site } from '../site.config';

export async function GET() {
  const posts = (await getPosts()).slice(0, 10);
  // Keep Atom IDs from jekyll-feed so subscribers do not see old posts as new.
  const legacyOrigin = 'https://yumulab.org';
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
<generator uri="https://astro.build/">Astro</generator>
<id>${legacyOrigin}/feed.xml</id><title>${xml(site.title)}</title>
<subtitle>${xml(site.description)}</subtitle>
<link href="${site.url}/feed.xml" rel="self" type="application/atom+xml"/>
<link href="${site.url}/" rel="alternate" type="text/html"/>
<updated>${posts[0]?.date ?? '2021-04-01'}T00:00:00Z</updated>
<author><name>${xml(site.author)}</name></author>
${posts.map((post) => `<entry>
<id>${legacyOrigin}${xml(post.url.replace(/\.html$/, ''))}</id>
<title>${xml(post.title)}</title><link href="${site.url}${xml(post.url)}" rel="alternate" type="text/html"/>
<published>${post.date}T00:00:00Z</published><updated>${post.date}T00:00:00Z</updated>
<summary>${xml(post.description)}</summary>
<content type="html" xml:base="${site.url}${xml(post.url)}">${xml(post.html)}</content>
${post.categories.map((category) => `<category term="${xml(category)}"/>`).join('')}
</entry>`).join('\n')}
</feed>`;
  return new Response(feed, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}
