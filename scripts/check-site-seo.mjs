import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = 'https://geekgravity-official.github.io/gravscope/';
const files = ['index.html', 'index-en.html'];
for (const [index, file] of files.entries()) {
  const window = new Window({ url: base + file, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  try {
    const doc = window.document;
    doc.write(readFileSync('site-dist/' + file, 'utf8'));
    const canonical = base + (index ? file : '');
    assert.equal(doc.querySelector('link[rel=canonical]').href, canonical);
    assert.equal(doc.querySelector('meta[property="og:url"]').content, canonical);
    assert.equal(doc.querySelector('meta[property="og:title"]').content, doc.title);
    assert.ok(doc.querySelector('meta[name=robots]').content.startsWith('index,follow'));
    for (const lang of ['zh-CN', 'en', 'x-default']) assert.ok(doc.querySelector(`link[hreflang="${lang}"]`));
    const image = doc.querySelector('meta[property="og:image"]').content;
    assert.ok(existsSync('site-dist/' + image.slice(base.length)));
    assert.equal(doc.querySelector('meta[name="twitter:card"]').content, 'summary_large_image');
    const schema = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
    assert.equal(schema.codeRepository, 'https://github.com/geekgravity-official/gravscope');
    assert.equal(schema.url, canonical);
    assert.ok(doc.querySelector('main').textContent.length > 5000, 'Content must exist without JavaScript');
    for (const name of ['language.js','app.js','report-viewer.js']) assert.ok(doc.querySelector(`script[src^="./${name}?v="]`));
    const xml = new window.DOMParser().parseFromString(readFileSync('site-dist/sitemap.xml', 'utf8'), 'application/xml');
    assert.equal(xml.querySelectorAll('url').length, 2);
    assert.deepEqual([...xml.querySelectorAll('loc')].map(node => node.textContent), [base, base + 'index-en.html']);
    assert.equal(xml.getElementsByTagName('xhtml:link').length, 6);
  } finally { await window.happyDOM.close(); }
}
console.log('SEO checks passed: static bilingual content, canonical/hreflang, metadata, schema, images, sitemap and versioned scripts.');
