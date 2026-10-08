import { getPages, getPosts } from '../lib/content';
import { xml } from '../lib/xml';
import { site } from '../site.config';

export async function GET() {
  const pages = await getPages();
  const posts = await getPosts();
  const urls = ['/', ...pages.map((page) => page.url), ...posts.map((post) => post.url)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `<url><loc>${xml(site.url + url)}</loc></url>`).join('\n')}
</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
