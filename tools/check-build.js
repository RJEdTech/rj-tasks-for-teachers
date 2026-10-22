/*
  Guardrail run after every build (and in CI). Fails if the built extension:
  - asks for any permission other than "storage", or any host permission
  - runs anywhere but https://rjhs.instructure.com/*, or inside iframes
  - exposes web-accessible resources or external messaging
  - has a loose extension-page CSP
  - contains eval/new Function, HTML injection (innerHTML etc.), or
    WebSocket/beacon/XHR/image beacons
  - can send anything but GET (the extension is read-only)
  - mentions any outside host other than its own homepage/feedback links
    in the popup/settings pages
  - is missing its LICENSE

  node tools/check-build.js build
*/
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || 'build');
const ORIGIN = 'https://rjhs.instructure.com';
const problems = [];
const fail = (m) => problems.push(m);

const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
if (m.manifest_version !== 3) fail('manifest_version must be 3');
if (JSON.stringify(m.permissions) !== '["storage"]') fail(`permissions must be ["storage"], got ${JSON.stringify(m.permissions)}`);
for (const k of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'web_accessible_resources'])
  if (m[k] && m[k].length) fail(`${k} must be empty`);
if (m.externally_connectable) fail('externally_connectable must not be set');
if (!m.content_scripts || m.content_scripts.length !== 1) fail('exactly one content script expected');
for (const cs of m.content_scripts || []) {
  if (JSON.stringify(cs.matches) !== JSON.stringify([`${ORIGIN}/*`])) fail(`content script must match only ${ORIGIN}/*`);
  if (cs.all_frames) fail('content script must not run in iframes');
  if (cs.match_about_blank || cs.match_origin_as_fallback) fail('content script must not run in about:blank frames');
}
const csp = (m.content_security_policy && m.content_security_policy.extension_pages) || '';
for (const need of ["script-src 'self'", "object-src 'none'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'"])
  if (!csp.includes(need)) fail(`extension CSP must include ${need}`);
if (/unsafe-(eval|inline)|wasm/.test(csp)) fail('extension CSP must not allow unsafe-eval/unsafe-inline/wasm');

const lic = path.join(dir, 'LICENSE');
if (!fs.existsSync(lic) || !/MIT License/.test(fs.readFileSync(lic, 'utf8'))) fail('LICENSE must ship in the build');

const content = fs.readFileSync(path.join(dir, 'content.js'), 'utf8');
if (!/attachShadow\(\{\s*mode:\s*"closed"/.test(content)) fail('panel must use a closed shadow root');

const OWN_LINKS = new Set(['rjedtech.github.io', 'forms.cloud.microsoft', 'forms.office.com']);
const BENIGN = new Set(['www.w3.org']);
const ALLOWED_HOST = new URL(ORIGIN).hostname;

for (const f of fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  if (/\beval\s*\(|new Function\s*\(|setTimeout\(\s*["'`]|setInterval\(\s*["'`]/.test(src)) fail(`${f}: eval-like code`);
  if (/\.innerHTML\b|\.outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser/.test(src))
    fail(`${f}: HTML injection API`);
  if (/new WebSocket|sendBeacon|EventSource\s*\(|XMLHttpRequest|new Image\s*\(|importScripts/.test(src))
    fail(`${f}: forbidden network API`);
  if (/\.js$/.test(f) && /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i.test(src)) fail(`${f}: non-GET request`);
  if (f !== 'content.js' && /\bfetch\s*\(/.test(src)) fail(`${f}: only the content script may fetch`);
  const urls = src.match(/(?:https?:)?\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'`)<]*/g) || [];
  for (const raw of urls) {
    let u;
    try {
      u = new URL(raw.startsWith('//') ? 'https:' + raw : raw);
    } catch {
      continue;
    }
    if (u.hostname === ALLOWED_HOST || BENIGN.has(u.hostname)) continue;
    if (OWN_LINKS.has(u.hostname) && f !== 'content.js' && f !== 'background.js') continue;
    fail(`${f}: unexpected URL ${raw.slice(0, 80)}`);
  }
}

if (problems.length) {
  console.error('Build check FAILED:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`Build check passed: ${m.name} ${m.version}. storage only, ${ORIGIN} only, GET only, no HTML injection.`);
