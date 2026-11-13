import { Window } from 'happy-dom';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

export async function buildSiteSeo(directory) {
  const base = 'https://geekgravity-official.github.io/gravscope/';
  const locales = [
    { file: 'index.html', path: '', lang: 'zh-CN', locale: 'zh_CN', other: 'en_US', title: 'GravScope — 开源移动网页调试工具 | 日志、网络与错误诊断', image: 'website-0.2.1.jpg' },
    { file: 'index-en.html', path: 'index-en.html', lang: 'en', locale: 'en_US', other: 'zh_CN', title: 'GravScope — Open-source Mobile Web Debugging Tool', image: 'website-en-0.2.2.jpg' },
  ];
  await mkdir(`${directory}/social`, { recursive: true });
  for (const locale of locales) {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    try {
      const document = window.document;
      document.write(await readFile(`${directory}/${locale.file}`, 'utf8'));
      document.title = locale.title;
      const description = document.querySelector('meta[name="description"]').content;
      const meta = (key, content, property = false) => {
        const node = document.createElement('meta'); node.setAttribute(property ? 'property' : 'name', key); node.content = content; document.head.append(node);
      };
      meta('robots', 'index,follow,max-image-preview:large');
      for (const [key, value] of Object.entries({ type: 'website', site_name: 'GravScope', title: locale.title, description, url: base + locale.path, locale: locale.locale, 'locale:alternate': locale.other, image: base + 'social/' + locale.image, 'image:alt': 'GravScope mobile web debugging website' })) meta('og:' + key, value, true);
      meta('twitter:card', 'summary_large_image'); meta('twitter:title', locale.title); meta('twitter:description', description); meta('twitter:image', base + 'social/' + locale.image);
      const alternate = document.createElement('link'); alternate.rel = 'alternate'; alternate.hreflang = 'x-default'; alternate.href = base; document.head.append(alternate);
      const sitemap = document.createElement('link'); sitemap.rel = 'sitemap'; sitemap.type = 'application/xml'; sitemap.href = base + 'sitemap.xml'; document.head.append(sitemap);
      const structured = document.createElement('script'); structured.type = 'application/ld+json';
      structured.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', '@id': base + '#software', name: 'GravScope', description, url: base + locale.path, codeRepository: 'https://github.com/geekgravity-official/gravscope', programmingLanguage: 'JavaScript', runtimePlatform: 'Web browser', license: 'https://opensource.org/license/mit', inLanguage: locale.lang, author: { '@type': 'Organization', name: 'GeekGravity', url: 'https://geekgravity.dev/' } }).replace(/</g, '\\u003c');
      document.head.append(structured);
      await writeFile(`${directory}/${locale.file}`, '<!doctype html>\n' + document.documentElement.outerHTML + '\n');
      await copyFile(`docs/images/${locale.image}`, `${directory}/social/${locale.image}`);
    } finally { await window.happyDOM.close(); }
  }
  const alternates = locales.map(locale => `<xhtml:link rel="alternate" hreflang="${locale.lang}" href="${base}${locale.path}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${base}"/>`;
  await writeFile(`${directory}/sitemap.xml`, '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + locales.map(locale => `<url><loc>${base}${locale.path}</loc>${alternates}</url>`).join('\n') + '\n</urlset>\n');
}
