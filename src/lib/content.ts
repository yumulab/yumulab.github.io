import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { parse } from 'yaml';

export interface Heading { depth: number; id: string; text: string }
export interface Page {
  source: string;
  url: string;
  title: string;
  html: string;
  description: string;
  banner?: string;
  headings: Heading[];
}
export interface Post extends Page { date: string; categories: string[]; tags: string[] }

// Content stays in its original location. Read at build time (and on dev reload).
const root = process.cwd();
const markdown = new MarkdownIt({ html: true, linkify: true });

export function parseSource(raw: string, source: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing YAML front matter: ${source}`);
  const data = parse(match[1]) as Record<string, unknown>;
  if (!data || typeof data.title !== 'string') throw new Error(`Missing title: ${source}`);
  return { data, body: raw.slice(match[0].length) };
}

export function resolveLiquid(body: string): string {
  const resolved = body.replace(/\{\{\s*(['"])(.*?)\1\s*\|\s*relative_url\s*\}\}/g,
    (_, _quote: string, value: string) => `/${value.replace(/^\/+/, '')}`);
  // Fail visibly if newly authored content needs another Liquid feature.
  if (/\{[{%]/.test(resolved)) throw new Error('Unsupported Liquid syntax; use a normal Markdown URL or a quoted relative_url expression.');
  return resolved;
}

function plainText(html: string): string {
  return markdown.utils.unescapeAll(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function renderBody(body: string, isHtml = false) {
  const resolved = resolveLiquid(body);
  const headings: Heading[] = [];
  if (isHtml) return { html: resolved, headings, description: plainText(resolved).slice(0, 160) };
  const tokens = markdown.parse(resolved, {});
  const used = new Map<string, number>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'heading_open') continue;
    const inline = tokens[index + 1];
    const text = inline.children?.map((child) => child.type === 'html_inline' ? '' : child.content).join('') ?? inline.content;
    // Kramdown's GFM heading IDs retain Unicode and suffix duplicate headings.
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count ? `${base}-${count}` : base;
    token.attrSet('id', id);
    headings.push({ depth: Number(token.tag.slice(1)), id, text });
  }
  let html = markdown.renderer.render(tokens, markdown.options, {});
  // Fix this existing broken image in memory; the article Markdown stays intact.
  html = html.replaceAll('src="/assets/images/2021/WISS2021.png"', 'src="/assets/images/2021/WISS2021.jpg"');
  html = html.replace(/<img /g, '<img loading="lazy" decoding="async" ');
  return { html, headings, description: plainText(html).slice(0, 160) };
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}

export function parsePost(raw: string, source: string): Post | null {
  const { data, body } = parseSource(raw, source);
  const match = path.basename(source).match(/^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/);
  if (!match) throw new Error(`Use YYYY-MM-DD-slug.md for posts: ${source}`);
  const date = typeof data.date === 'string' ? data.date.slice(0, 10) : `${match[1]}-${match[2]}-${match[3]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid post date: ${source}`);
  }
  if (data.published === false || date > new Date().toISOString().slice(0, 10)) return null;
  const categories = [...new Set(list(data.categories ?? data.category))];
  const slug = typeof data.slug === 'string' ? data.slug : match[4];
  // Jekyll's default `date` permalink, including original filename case.
  const url = typeof data.permalink === 'string' ? data.permalink : `/${[...categories, ...date.split('-'), slug].join('/')}.html`;
  if (!url.startsWith('/') || !url.endsWith('.html') || url.includes('..') || /[?#]/.test(url)) {
    throw new Error(`Posts must use an absolute .html permalink: ${source}`);
  }
  const rendered = renderBody(body);
  return {
    source, url, title: String(data.title), date, categories, tags: list(data.tags), ...rendered,
    description: typeof data.description === 'string' && data.description.trim() ? data.description : rendered.description,
  };
}

export async function getPosts(): Promise<Post[]> {
  const files = (await readdir(path.join(root, '_posts'))).filter((file) => file.endsWith('.md')).sort();
  const posts = (await Promise.all(files.map(async (file) => {
    const source = `_posts/${file}`;
    return parsePost(await readFile(path.join(root, source), 'utf8'), source);
  }))).filter((post): post is Post => post !== null);
  const urls = new Set<string>();
  for (const post of posts) {
    if (urls.has(post.url)) throw new Error(`Duplicate article URL: ${post.url}`);
    urls.add(post.url);
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || b.source.localeCompare(a.source));
}

async function readPage(source: string): Promise<Page> {
  const { data, body } = parseSource(await readFile(path.join(root, source), 'utf8'), source);
  const rendered = renderBody(body, source.endsWith('.html'));
  return {
    source, url: source === 'index.md' ? '/' : `/${source.replace(/\.md$/, '.html')}`,
    title: String(data.title), banner: typeof data.banner === 'string' ? data.banner : undefined,
    ...rendered,
    description: typeof data.description === 'string' && data.description.trim() ? data.description : rendered.description,
  };
}

export const getHome = () => readPage('index.md');
export async function getPages(): Promise<Page[]> {
  const files = (await readdir(root)).filter((file) => /\.(md|html)$/.test(file) && !['index.md', 'README.md', '404.html', 'AGENTS.md'].includes(file));
  return Promise.all(files.sort().map(readPage));
}
