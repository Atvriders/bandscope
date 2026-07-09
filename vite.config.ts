import { defineConfig } from 'vite';

// base: './' so built asset URLs are relative — required for the Capacitor
// Android WebView (which serves from https://localhost/) and for static hosting.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
});
