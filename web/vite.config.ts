import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    mdx({
      providerImportSource: '@mdx-js/react',
      rehypePlugins: [rehypeHighlight],
      remarkPlugins: [remarkGfm],
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@arc-skill-eval/tokens/web-theme.css': fileURLToPath(
        new URL('../packages/tokens/dist/web-theme.css', import.meta.url),
      ),
    },
  },
});
