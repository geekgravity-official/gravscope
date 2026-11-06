import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
for (const language of ['zh-CN', 'en']) {
const page = language === 'en' ? 'index-en.html' : 'index.html';
const window = new Window({ url: 'https://geekgravity-official.github.io/gravscope/' + page + '#api', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
try {
  const document = window.document;
  document.write(readFileSync('site-dist/' + page, 'utf8'));
  assert.equal(document.documentElement.lang, language);
  if (language === 'en') assert.ok(!/[\u3400-\u9fff]/.test(document.body.textContent.replace('中文', '')));
  for (const node of document.querySelectorAll('[src], [href]')) {
    const path = node.getAttribute('src') || node.getAttribute('href');
    if (path.startsWith('./') && path !== './') assert.ok(existsSync('site-dist/' + path.slice(2)), path);
    if (path.startsWith('#')) assert.ok(document.getElementById(path.slice(1)), path);
  }
  const script = document.createElement('script');
  script.src = 'https://geekgravity-official.github.io/gravscope/app.js';
  Object.defineProperty(document, 'currentScript', { configurable: true, value: script });
  const append = document.head.append.bind(document.head);
  document.head.append = (...nodes) => {
    const injected = nodes.find(node => node.tagName === 'SCRIPT');
    if (!injected) return append(...nodes);
    assert.equal(injected.src, 'https://geekgravity-official.github.io/gravscope/vendor/gravscope.modern.iife.js');
    window.eval(readFileSync('site-dist/vendor/gravscope.modern.iife.js', 'utf8'));
    queueMicrotask(() => injected.dispatchEvent(new window.Event('load')));
  };
  window.fetch = async url => {
    assert.equal(String(url), 'https://geekgravity-official.github.io/gravscope/mock.json');
    return new window.Response(readFileSync('site-dist/mock.json', 'utf8'), { headers: {'Content-Type': 'application/json'} });
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  window.eval(readFileSync('site-dist/app.js', 'utf8'));
  assert.equal(document.querySelector('[data-language-switch]').hash, '#api');
  assert.ok(document.querySelector('#cdn-code').textContent.includes('cdn.jsdelivr.net'));
  document.querySelector('#cdn').value = 'unpkg';
  document.querySelector('#cdn').dispatchEvent(new window.Event('change'));
  assert.ok(document.querySelector('#cdn-code').textContent.includes('unpkg.com'));
  for (const name of ['log', 'network', 'storage', 'element', 'export', 'theme']) {
    document.querySelector(`[data-demo="${name}"]`).click();
    await settle();
    assert.ok(document.querySelector('gravscope-root'));
    assert.ok(!/^(无法|Demo failed)/.test(document.querySelector('#demo-status').textContent), name);
    const root = document.querySelector('gravscope-root').shadowRoot;
    assert.ok(root.textContent.includes(language === 'en' ? 'Network' : '网络'));
    if (language === 'en') assert.ok(!/[\u3400-\u9fff]/.test(document.querySelector('#demo-status').textContent));
  }
  assert.ok(window.localStorage.getItem('gravscope-demo-note'));
  document.querySelector('#reset').click();
  assert.equal(document.querySelector('gravscope-root'), null);
  assert.equal(window.localStorage.getItem('gravscope-demo-note'), null);
  document.querySelector('[data-demo="storage"]').click();
  await settle();
  document.querySelector('#reset').click();
  assert.equal(document.querySelector('gravscope-root'), null);
  console.log('Site relative assets, CDN switch, six demo actions and repeated cleanup passed (DOM simulation).');
} finally { await window.happyDOM.close(); }

}
