import { Window } from 'happy-dom';
import { readFile, writeFile } from 'node:fs/promises';

// Exact source-text keys deliberately fail the build when Chinese copy changes
// without a corresponding translation. Both pages share structure and assets.
export async function localizeSite(directory) {
  const translations = JSON.parse(await readFile(new URL('./site-en.json', import.meta.url), 'utf8'));
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  try {
    const document = window.document;
    document.write(await readFile(`${directory}/index.html`, 'utf8'));
    function translate(text) {
      if (!/[\u3400-\u9fff]/.test(text)) return text;
      if (text === '中文') return text; // Language selector's endonym.
      if (!(text in translations)) throw new Error(`Missing English translation: ${text}`);
      return translations[text];
    }
    function walk(node) {
      if (node.nodeType === 3) node.textContent = translate(node.textContent);
      if (node.attributes) for (const attr of [...node.attributes]) node.setAttribute(attr.name, translate(attr.value));
      for (const child of node.childNodes) walk(child);
    }
    walk(document.documentElement);
    document.documentElement.lang = 'en';
    for (const pre of document.querySelectorAll('pre')) pre.textContent = pre.textContent.replace("lang: 'zh'", "lang: 'en'");
    document.querySelector('img[src="./qr.svg"]').setAttribute('src', './qr-en.svg');
    for (const link of document.querySelectorAll('a[href*="README.zh-CN.md"]')) link.href = link.getAttribute('href').replace('README.zh-CN.md', 'README.md');
    const chinese = document.querySelector('[data-language="zh"]');
    const english = document.querySelector('[data-language="en"]');
    chinese.removeAttribute('aria-current'); chinese.setAttribute('data-language-switch', '');
    english.setAttribute('aria-current', 'page'); english.removeAttribute('data-language-switch');
    document.querySelector('.wordmark').setAttribute('href', './index-en.html');
    document.querySelector('link[rel="canonical"]').href = 'https://geekgravity-official.github.io/gravscope/index-en.html';
    await writeFile(`${directory}/index-en.html`, '<!doctype html>\n' + document.documentElement.outerHTML + '\n');
  } finally { await window.happyDOM.close(); }
}
