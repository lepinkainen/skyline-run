import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works from any subpath (GitHub Pages, itch.io).
  base: './',
  // main.ts waits for web fonts with top-level await.
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 }, // Phaser alone is ~1.3 MB.
  esbuild: { target: 'es2022' },
});
