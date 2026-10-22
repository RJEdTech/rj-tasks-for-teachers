/*
  Builds the extension into build/:  node tools/build.js
  One bundled, minified-but-readable file per entry point; no source maps,
  no remote code. The version comes from package.json.
*/
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const E2E = process.env.E2E === '1';
const out = path.join(root, E2E ? 'build-e2e' : 'build');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

const pkg = require(path.join(root, 'package.json'));

esbuild.buildSync({
  entryPoints: {
    content: 'src/content.ts',
    background: 'src/background.ts',
    popup: 'src/pages/popup.ts',
    options: 'src/pages/options.ts',
  },
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  target: ['chrome111'],
  outdir: out,
  minifySyntax: true,
  minifyWhitespace: false,
  minifyIdentifiers: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
  define: { SHADOW_MODE: JSON.stringify(E2E ? 'open' : 'closed') },
});

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
manifest.version = pkg.version;
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

for (const f of ['popup.html', 'options.html', 'page.css'])
  fs.copyFileSync(path.join(root, 'src/pages', f), path.join(out, f));
for (const n of [16, 32, 48, 128])
  fs.copyFileSync(path.join(root, 'src/icons', `icon-${n}.png`), path.join(out, `icon-${n}.png`));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));

console.log(`Built ${manifest.name} ${manifest.version} -> ${path.basename(out)}/`);
