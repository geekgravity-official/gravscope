import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync('site/language.js', 'utf8');
function visit(path, language = 'en-US', saved, blocked = false) {
  let redirected; const values = new Map(saved ? [['gravscope-site-language', saved]] : []);
  runInNewContext(source, {
    URL, location: { href: 'https://example.com/gravscope/' + path, replace: url => { redirected = url; } },
    navigator: { language, languages: [language] },
    localStorage: { getItem: key => { if (blocked) throw Error(); return values.get(key); }, setItem: (key, value) => { if (blocked) throw Error(); values.set(key, value); } },
  });
  return { redirected, saved: values.get('gravscope-site-language') };
}
assert.equal(visit('').redirected, 'https://example.com/gravscope/index-en.html');
assert.equal(visit('', 'zh-TW').redirected, undefined);
assert.equal(visit('index.html', 'fr-FR').redirected, 'https://example.com/gravscope/index-en.html');
assert.equal(visit('index-en.html', 'zh-CN', 'zh').redirected, undefined);
assert.equal(visit('', 'en-US', 'zh').redirected, undefined);
assert.equal(visit('', 'zh-CN', 'en').redirected, 'https://example.com/gravscope/index-en.html');
assert.deepEqual(visit('index.html?lang=zh#api', 'en-US', 'en', true), { redirected: undefined, saved: 'en' });
assert.deepEqual(visit('index-en.html?lang=zh&shot=1#options', 'en-US'), { redirected: 'https://example.com/gravscope/index.html?lang=zh&shot=1#options', saved: 'zh' });
assert.deepEqual(visit('?lang=en#api', 'zh-CN'), { redirected: 'https://example.com/gravscope/index-en.html?lang=en#api', saved: 'en' });
assert.equal(visit('?lang=invalid', 'zh-CN', 'invalid').redirected, undefined);
assert.equal(visit('', 'en-US', undefined, true).redirected, 'https://example.com/gravscope/index-en.html');
console.log('11 language routing checks passed: browser preference, explicit links, saved choice, blocked storage and preserved anchors.');
