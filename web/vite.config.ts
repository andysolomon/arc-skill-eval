import { foldkit } from '@foldkit/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [foldkit()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@arc-skill-eval/tokens/web-theme.css': fileURLToPath(
        new URL('../packages/tokens/dist/web-theme.css', import.meta.url),
      ),
    },
  },
});
