import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = file => readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const source = read('src/version.ts').match(/VERSION\s*=\s*['"]([^'"]+)/)?.[1];
assert.equal(lock.version, pkg.version, 'Lockfile version differs');
assert.equal(lock.packages[''].version, pkg.version, 'Root lock package differs');
assert.equal(source, pkg.version, 'Runtime version differs');
const siteVersion = read('scripts/build-site.mjs').match(/gravscope@([^/]+)\/dist/)?.[1];
assert.ok(siteVersion && /^\d+\.\d+\.\d+$/.test(siteVersion), 'Website must pin a published version');
assert.match(read('scripts/build-site.mjs'), /expected\s*=\s*["'][a-f0-9]{64}["']/, 'CDN bundle checksum is missing');
for (const file of ['site/index.html', 'site/app.js', 'README.md', 'README.zh-CN.md']) {
  for (const match of read(file).matchAll(/(?:cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/)@geekgravity\/gravscope@([^/]+)\//g)) assert.equal(match[1], siteVersion, `${file}: CDN version differs from the website build`);
}
const changelog = read('CHANGELOG.md');
const unreleased = changelog.match(/## Unreleased\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';
if (process.argv.includes('--publish')) {
  assert.ok(!unreleased, 'Promote pending changes into a versioned changelog before publishing');
  assert.equal(pkg.version, siteVersion, 'Release package and website must target the same version');
  assert.ok(changelog.includes(`## ${pkg.version} `), 'Missing candidate release notes');
}
console.log(`Consistent package/lock/runtime: ${pkg.version}; website/CDN pinned: ${siteVersion}; pending release notes: ${unreleased ? 'yes' : 'no'}.`);
if (unreleased) console.log('Pending features are not a published release. Publish-mode checks require a new candidate version and promoted release notes.');
