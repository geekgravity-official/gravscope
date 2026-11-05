(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const status = document.querySelector('#demo-status');
  const copyStatus = document.querySelector('#copy-status');
  let panel;
  let pending;
  let dark = true;
  function load() {
    if (panel) return Promise.resolve(panel);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const start = () => {
        try {
          panel = new window.GravScope({ lang: 'zh', theme: dark ? 'dark' : 'light' });
          panel.setSystemInfo('Demo', 'GravScope 0.2.2 playground');
          pending = null;
          resolve(panel);
        } catch (error) { pending = null; reject(error); }
      };
      if (window.GravScope) { start(); return; }
      const script = document.createElement('script');
      script.src = new URL('vendor/gravscope.modern.iife.js', base).href;
      script.onload = start;
      script.onerror = () => { script.remove(); pending = null; reject(new Error('工具加载失败，请检查网络后重试。')); };
      document.head.append(script);
    }).finally(() => { pending = null; });
    return pending;
  }
  document.querySelectorAll('[data-demo]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = '正在准备演示…';
      try {
        const gc = await load();
        switch (button.dataset.demo) {
          case 'log':
            console.info('GravScope 演示', { route: '/checkout', cart: [{ id: 1, name: 'Demo item', quantity: 2 }], tags: new Set(['mobile', 'debug']) });
            console.warn('示例警告：缓存未命中');
            console.error(new Error('示例错误：Payment request failed'));
            gc.showTab('log'); break;
          case 'network': {
            gc.showTab('network');
            const response = await fetch(new URL('mock.json', base));
            if (!response.ok) throw new Error(`示例请求返回 ${response.status}`);
            console.info('示例响应', await response.json());
            break;
          }
          case 'storage':
            localStorage.setItem('gravscope-demo-note', JSON.stringify({ example: true, theme: 'dark' }));
            gc.showTab('storage'); break;
          case 'element': gc.showTab('element'); break;
          case 'export':
            console.info('报告示例', { build: 'demo-0.2.2', access_token: 'demo-token-not-a-real-credential' });
            gc.showTab('log'); break;
          case 'theme': dark = !dark; gc.setOption('theme', dark ? 'dark' : 'light'); gc.show(); break;
        }
        status.textContent = button.dataset.demo === 'export' ? '请点击面板底部「导出」，预览后保存报告。' : button.dataset.demo === 'element' ? '请点击元素面板底部「选取」，再点页面上的元素。' : '演示已就绪，关闭面板后可以尝试其他场景。';
      } catch (error) { status.textContent = `无法完成演示：${error.message || error}`; }
      finally { button.disabled = false; }
    });
  });
  document.querySelector('#reset').addEventListener('click', () => {
    if (pending) { status.textContent = '工具正在加载，请稍后再清理。'; return; }
    panel?.destroy(); panel = null;
    try { localStorage.removeItem('gravscope-demo-note'); status.textContent = '演示存储已清理，工具已关闭。'; }
    catch { status.textContent = '工具已关闭；浏览器不允许清理本地存储。'; }
  });
  const cdn = document.querySelector('#cdn');
  function updateSnippet() {
    const origin = cdn.value === 'unpkg' ? 'https://unpkg.com/' : 'https://cdn.jsdelivr.net/npm/';
    document.querySelector('#cdn-code').textContent = `<script src="${origin}@geekgravity/gravscope@0.2.2/dist/gravscope.modern.iife.js"><` + `/script>\n<script>\n  const panel = new GravScope();\n<` + `/script>`;
  }
  cdn.addEventListener('change', updateSnippet); updateSnippet();
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const area = document.createElement('textarea');
      area.value = text; area.style.cssText = 'position:fixed;left:-9999px';
      document.body.append(area); area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
      area.remove(); return ok;
    }
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const ok = await copy(document.getElementById(button.dataset.copy).textContent);
    copyStatus.textContent = ok ? '已复制接入代码。' : '复制未成功，请手动选中代码复制。';
    button.textContent = ok ? '已复制' : '请手动复制';
    setTimeout(() => { button.textContent = '复制'; }, 1800);
  }));
  document.querySelector('[data-copy-url]').addEventListener('click', async event => {
    const button = event.currentTarget;
    const url = new URL('./#playground', base).href;
    const ok = await copy(url);
    button.textContent = ok ? '链接已复制' : url;
  });
})();
