import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'service-worker': path.resolve(__dirname, 'src/service-worker.ts'),
        'sidepanel/index':  path.resolve(__dirname, 'src/sidepanel/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // sidepanel/index entry should output to sidepanel/index.js
          if (chunkInfo.name === 'sidepanel/index') return 'sidepanel/index.js';
          return '[name].js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          // CSS from sidepanel should go to sidepanel directory
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'sidepanel.css';
          }
          return '[name].[ext]';
        },
      },
    },
    minify: false, // Easier debugging
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../../src'),
      '@tools': path.resolve(__dirname, '../../../src/tools'),
      '@config': path.resolve(__dirname, '../../../src/config'),
    },
  },
  plugins: [
    {
      name: 'copy-manifest',
      writeBundle() {
        const manifestPath = path.resolve(__dirname, 'manifest.json');
        const distPath = path.resolve(__dirname, 'dist/manifest.json');
        fs.copyFileSync(manifestPath, distPath);
      },
    },
    {
      name: 'fix-html-output',
      writeBundle() {
        // Move HTML from nested path to correct location
        const wrongPath = path.resolve(__dirname, 'dist/tests/tools/e2e/src/sidepanel/index.html');
        const correctPath = path.resolve(__dirname, 'dist/sidepanel/index.html');

        if (fs.existsSync(wrongPath)) {
          // Ensure sidepanel directory exists
          const sidepanelDir = path.dirname(correctPath);
          if (!fs.existsSync(sidepanelDir)) {
            fs.mkdirSync(sidepanelDir, { recursive: true });
          }

          // Move file to correct location
          fs.copyFileSync(wrongPath, correctPath);

          // Clean up wrong directory structure
          const wrongBaseDir = path.resolve(__dirname, 'dist/tests');
          if (fs.existsSync(wrongBaseDir)) {
            fs.rmSync(wrongBaseDir, { recursive: true, force: true });
          }
        }
      },
    },
  ],
});
