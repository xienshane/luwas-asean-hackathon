import { build } from 'esbuild';

await build({
  entryPoints: ['worker/sw.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'public/sw.js',
  define: { 'process.env.NODE_ENV': '"production"' }, // strips workbox dev assertions
});
console.log('built public/sw.js');
