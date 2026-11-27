import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const fake = (f) => fileURLToPath(new URL(`./e2e/fake/${f}`, import.meta.url));

// Plain static site: `npm run build` -> dist/ (deployed to Cloudflare Pages).
// `vite --mode e2e` swaps Firebase for an in-browser fake, for the UI test scripts in e2e/.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173 },
  resolve: mode === 'e2e' ? {
    alias: [
      { find: /^firebase\/firestore(\/lite)?$/, replacement: fake('firestore.js') },
      { find: /^firebase\/auth$/, replacement: fake('auth.js') }
    ]
  } : {},
  build: { chunkSizeWarningLimit: 1500 }
}));
