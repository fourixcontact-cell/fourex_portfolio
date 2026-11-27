// Bundles the CRM business logic (/core, CommonJS) into one browser module that the React app
// imports lazily: src/generated/core.js. Run automatically by `npm run dev` and `npm run build`.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('src/generated', { recursive: true });
await build({
  entryPoints: ['core/app.js'],
  outfile: 'src/generated/core.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  inject: ['scripts/buffer-shim.js'],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.FIRESTORE_CACHE': 'undefined' },
  legalComments: 'none',
  minify: false,
  logLevel: 'warning'
});
// Built-in website content, used until an admin has opened the CRM once (which publishes it).
await build({
  stdin: { contents: "export { default } from './core/config/siteContentDefaults.js';", resolveDir: '.', loader: 'js' },
  outfile: 'src/generated/siteDefaults.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  logLevel: 'warning'
});
console.log('core bundled -> src/generated/core.js');
