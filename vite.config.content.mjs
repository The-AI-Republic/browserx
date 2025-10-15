import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Separate build config for content script
// Must be IIFE format with all dependencies bundled inline
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.ts'),
      name: 'CodexContentScript',
      formats: ['iife'],
      fileName: () => 'content.js'
    },
    rollupOptions: {
      output: {
        extend: true,
        // Ensure no external dependencies - bundle everything
        inlineDynamicImports: true,
        sourcemap: true,  // NEW: Ensure Rollup generates source map
        sourcemapExcludeSources: false  // NEW: Include sources in map
      }
    },
    outDir: 'dist',
    emptyOutDir: false,  // Don't clear dist (main build runs first)
    sourcemap: true,  //
    minify: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
