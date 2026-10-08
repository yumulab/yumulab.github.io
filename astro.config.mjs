import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import { site } from './src/site.config.ts';

export default defineConfig({
  site: site.url,
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  vite: {
    server: { watch: { ignored: ['**/tests/fixtures/**'] } },
    plugins: [{
      name: 'watch-original-content',
      configureServer(server) {
        // The content loader reads the original files directly from disk.
        const root = fileURLToPath(new URL('.', import.meta.url));
        server.watcher.on('all', (event, file) => {
          if (!['add', 'change', 'unlink'].includes(event) || !file.startsWith(root)) return;
          const relative = file.slice(root.length);
          if (/^_posts\/.*\.md$/.test(relative) || /^[^/]+\.(md|html)$/.test(relative)) {
            server.moduleGraph.invalidateAll();
            server.ws.send({ type: 'full-reload' });
          }
        });
      },
    }],
  },
});
