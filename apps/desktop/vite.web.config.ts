import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Amber Flow web: the same React app the desktop (Electron) window shows,
// built as a plain static website — so the web has every desktop feature.
// The only Electron-only call (alarm focusWindow) is optional-chained and
// does nothing in a browser. HashRouter keeps routes working on any static
// host without server rewrites. Supabase keeps the login session in
// localStorage, so refreshing or reopening the tab stays signed in.
//
//   npm run dev:web      → local dev server
//   npm run build:web    → static site in apps/desktop/dist-web
//   npm run preview:web  → serve the built site locally
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  },
  server: { port: 5180 },
  preview: { port: 5181 },
});
