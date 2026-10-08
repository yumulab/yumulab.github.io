import { load } from 'cheerio';

export interface HomeLink {
  href: string;
  label: string;
}

// Keep link destinations and labels authored in the original homepage Markdown.
export function getHomeLinks(html: string): { navigation: HomeLink[]; social: HomeLink[] } {
  const $ = load(html, null, false);
  const readList = (index: number): HomeLink[] => $('ul').eq(index).find('a[href]').toArray().map(element => ({
    href: $(element).attr('href')!,
    label: $(element).text().replace(/^[A-Za-z ]+:\s*/, '').replace(/^Twitter\b/, 'X'),
  }));
  return { navigation: readList(0), social: readList(1) };
}
