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
  const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  const language = explicit || (saved === 'en' || saved === 'zh' ? saved : /^zh(?:-|$)/i.test(preferred) ? 'zh' : 'en');
  // Only an explicit URL choice navigates. Browser/saved preferences suggest, never redirect.
  if (explicit && (explicit === 'en') !== englishPage) {
    const target = new URL(explicit === 'en' ? './index-en.html' : './index.html', url);
    target.search = url.search; target.hash = url.hash;
    location.replace(target.href);
    return;
  }
  if (explicit || (language === 'en') === englishPage) return;
  function suggest() {
    const holder = document.querySelector('[data-language-suggestion]');
    if (!holder) return;
    const link = holder.querySelector('a'); const close = holder.querySelector('button');
    link.textContent = language === 'en' ? 'Prefer English? View this page in English →' : '切换到简体中文 →';
    close.setAttribute('aria-label', language === 'en' ? 'Dismiss language suggestion' : '关闭语言提示');
    const update = () => {
      const target = new URL(language === 'en' ? './index-en.html' : './index.html', location.href);
      target.search = location.search; target.searchParams.set('lang', language); target.hash = location.hash; link.href = target.href;
    };
    update(); window.addEventListener('hashchange', update);
    close.addEventListener('click', () => {
      holder.hidden = true;
      try { localStorage.setItem(key, englishPage ? 'en' : 'zh'); } catch { /* Optional preference. */ }
    });
    holder.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suggest, { once: true });
  else suggest();
})();
