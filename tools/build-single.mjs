// Bundles the whole game (code, three.js, CSS) into one self-contained HTML file.
// Usage: node tools/build-single.mjs [esbuild module path]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = await import(process.argv[2] ?? 'esbuild');

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2022',
  legalComments: 'none',
  alias: { three: path.join(root, 'vendor/three/three.module.js') },
  plugins: [{
    name: 'three-addons',
    setup(b) {
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(root, 'vendor/three/addons', a.path.slice('three/addons/'.length)) }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', () => `<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/aquaria.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
