import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'gravscope-package-'));
const run = (args, cwd = process.cwd()) => execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const info = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', directory, '--cache', join(directory, 'cache')]))[0];
  if (info.name !== '@geekgravity/gravscope') throw new Error('Unexpected package name');
  if (info.files.some(file => /(?:^|\/)(?:\.env|\.npmrc|node_modules)(?:[/.]|$)/.test(file.path))) throw new Error('Unexpected private/package-manager files');
  run(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(directory, 'cache'), join(directory, info.filename)], directory);
  writeFileSync(join(directory, 'check.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { Window } from ${JSON.stringify(import.meta.resolve('happy-dom'))};
const require = createRequire(import.meta.url);
for (const name of ['@geekgravity/gravscope', '@geekgravity/gravscope/modern']) {
  const esm = await import(name);
  const cjs = require(name);
  assert.equal(esm.default, esm.GravScope);
  assert.equal(typeof esm.GravScope, 'function');
  assert.equal(typeof esm.GravScopePlugin, 'function');
  assert.equal(typeof cjs.GravScope, 'function');
}
for (const file of ['gravscope.iife.js', 'gravscope.modern.iife.js']) {
  const window = new Window({url: 'http://localhost'});
  window.eval('window.WebSocket = class extends EventTarget { static OPEN = 1; constructor(url) { super(); this.url = url; this.readyState = 1; } send(value) { this.sent = value; } };');
  const NativeSocket = window.WebSocket;
  window.eval(fs.readFileSync('./node_modules/@geekgravity/gravscope/dist/' + file, 'utf8'));
  assert.equal(typeof window.GravScope, 'function');
  let exported;
  const panel = new window.GravScope({lang: 'en', defaultPlugins: [], onExport: file => { exported = file; }});
  const socket = new window.WebSocket('wss://example.com');
  socket.send('bundle-message');
  assert.ok(socket instanceof NativeSocket);
  assert.equal(socket.sent, 'bundle-message');
  assert.ok(panel.getReport({includeBodies: true}).activity.some(item => item.detail === 'bundle-message'));
  panel.show();
  const root = window.document.querySelector('gravscope-root').shadowRoot;
  [...root.querySelectorAll('button')].find(button => button.textContent === 'Export').click();
  [...root.querySelectorAll('button')].find(button => button.textContent === 'JSON').click();
  await Promise.resolve();
  assert.equal(exported.format, 'json');
  assert.ok(exported.filename.endsWith('.json'));
  assert.ok(window.document.querySelector('gravscope-root'));
  panel.destroy();
  assert.equal(window.WebSocket, NativeSocket);
  assert.equal(window.document.querySelector('gravscope-root'), null);
  await window.happyDOM.close();
}
console.log('Packed ESM, CommonJS and IIFE entry points passed.');
`);
  process.stdout.write(execFileSync(process.execPath, ['check.mjs'], { cwd: directory, encoding: 'utf8' }));
  for (const file of info.files.filter(file => /^dist\/.*\.(?:js|cjs)$/.test(file.path))) {
    const content = readFileSync(join(directory, 'node_modules/@geekgravity/gravscope', file.path), 'utf8');
    if (/\/\/[#@]\s*sourceMappingURL=/.test(content)) throw new Error(`Automatic sourcemap reference in ${file.path}`);
    const map = JSON.parse(readFileSync(join(directory, 'node_modules/@geekgravity/gravscope', `${file.path}.map`), 'utf8'));
    if (map.version !== 3 || !map.sources.length || !map.sourcesContent?.length) throw new Error(`Invalid hidden sourcemap for ${file.path}`);
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'node_modules/@geekgravity/gravscope/package.json'), 'utf8'));
  for (const entry of Object.values(manifest.exports)) readFileSync(join(directory, 'node_modules/@geekgravity/gravscope', entry.types));
  console.log(`Package: ${info.filename}; ${info.files.length} files; ${info.size} bytes.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
