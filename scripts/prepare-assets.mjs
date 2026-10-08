import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'public');
await mkdir(target, { recursive: true });
await rm(path.join(target, 'assets'), { recursive: true, force: true });
await cp(path.join(root, 'assets'), path.join(target, 'assets'), {
  recursive: true,
  filter: (source) => !path.basename(source).startsWith('.') && !source.endsWith('.scss'),
});
// The existing deployment uses www (the apex redirects to it).
await cp(path.join(root, 'CNAME'), path.join(target, 'CNAME'));
await writeFile(path.join(target, '.nojekyll'), '');
console.log('Prepared public assets without moving the source files.');
