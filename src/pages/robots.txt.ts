import { site } from '../site.config';

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
