(() => {
  'use strict';
  const url = new URL(location.href);
  const choice = url.searchParams.get('lang');
  const explicit = choice === 'zh' || choice === 'en' ? choice : null;
  const key = 'gravscope-site-language';
  let saved;
  try {
    saved = localStorage.getItem(key);
    if (explicit) localStorage.setItem(key, explicit);
  } catch { /* Explicit links still work when storage is unavailable. */ }
  const englishPage = /\/index-en\.html$/.test(url.pathname);
  // A shared English URL is intentional. Only the default entry auto-detects.
  if (englishPage && !explicit) return;
  const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  const language = explicit || (saved === 'en' || saved === 'zh' ? saved : /^zh(?:-|$)/i.test(preferred) ? 'zh' : 'en');
  if ((language === 'en') === englishPage) return;
  const target = new URL(language === 'en' ? './index-en.html' : './index.html', url);
  target.search = url.search;
  target.hash = url.hash;
  location.replace(target.href);
})();
