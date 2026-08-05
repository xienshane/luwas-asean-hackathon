import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'worker');
const require = createRequire(import.meta.url);

const workboxResolver = {
  name: 'workbox-resolver',
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => ({
      path: require.resolve(args.path),
    }));
    build.onResolve({ filter: /^\./ }, (args) => {
      const base = resolve(args.resolveDir, args.path);
      for (const suffix of ['', '.js', '.mjs', '.ts']) {
        const path = `${base}${suffix}`;
        if (existsSync(path)) return { path };
      }
      return { path: base };
    });
  },
};

await build({
  stdin: {
    contents: await readFile(resolve(workerDir, 'sw.ts'), 'utf8'),
    loader: 'ts',
    resolveDir: workerDir,
    sourcefile: 'sw.ts',
  },
  bundle: true,
  minify: true,
  format: 'iife',
  nodePaths: [resolve(root, 'node_modules')],
  plugins: [workboxResolver],
  outfile: resolve(root, 'public/sw.js'),
  define: { 'process.env.NODE_ENV': '"production"' }, // strips workbox dev assertions
});
console.log('built public/sw.js');
