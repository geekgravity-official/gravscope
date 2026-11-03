import GravScope, { GravScopePlugin } from '../src/index';
import { runSelfCheck } from './selfcheck';

const params = new URLSearchParams(location.search);
const previous = (window as Window & { __gravscope?: { destroy: () => void } }).__gravscope;
try {
  previous?.destroy();
} catch {
  document.querySelectorAll('gravscope-root').forEach((node) => node.remove());
}

if (params.has('autotest')) localStorage.setItem('gravscope-demo', 'yes');

const gc = new GravScope({
  lang: params.has('autotest') ? 'en' : 'zh',
  theme: 'dark',
});
(window as Window & { __gravscope?: GravScope }).__gravscope = gc;

let pluginAdded = false;
const themeButton = document.querySelector<HTMLButtonElement>('#theme');
let dark = true;
themeButton?.addEventListener('click', () => {
  dark = !dark;
  gc.setOption('theme', dark ? 'dark' : 'light');
});

document.body.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const act = target.dataset.act;
  if (!act) return;
  runAction(act);
});

if (params.has('shot')) {
  console.log('GravScope ready', { version: GravScope.version, theme: 'dark' });
  console.info('network panel is watching fetch');
  console.warn('cache miss', { key: 'session' });
  console.error(new Error('sample failure'));
  console.log('%cGravScope', 'color:#3b82f6;font-weight:700', 'mobile console');
  console.table([{ id: 1, name: 'field note', ok: true }]);
  void fetch('/mock.json');
  const broken = document.createElement('img');
  broken.alt = 'missing-shot';
  broken.src = '/missing-gravscope-asset.png';
  broken.hidden = true;
  document.body.append(broken);
  gc.show();
}

if (params.has('autotest')) void runSelfCheck(gc);

function runAction(act: string): void {
  if (act === 'group' || act === 'group-collapsed') {
    if (act === 'group-collapsed') console.groupCollapsed('订单诊断（默认折叠）');
    else console.group('订单诊断（默认展开）');
    console.info('进入结账', { orderId: 'demo-001' });
    console.groupCollapsed('支付请求（嵌套折叠）');
    console.log({ method: 'POST', amount: 99 });
    console.error(new Error('示例支付失败'));
    console.groupEnd();
    console.warn('返回订单页');
    console.groupEnd();
    console.log('分组结束，回到顶层');
    gc.showTab('log');
  }
  if (act === 'log') console.log('hello from GravScope', { time: Date.now() });
  if (act === 'info') console.info('sync finished', ['a', 'b']);
  if (act === 'warn') console.warn('cache miss', { key: 'session' });
  if (act === 'error') console.error(new Error('sample failure'));
  if (act === 'object') {
    const box: { name: string; self?: unknown } = { name: 'circular' };
    box.self = box;
    console.log(box);
  }
  if (act === 'table') console.table([{ id: 1, name: 'field note' }, { id: 2, name: 'debug' }]);
  if (act === 'styled') console.log('%cGravScope', 'color:#3b82f6;font-weight:700', 'panel ready');
  if (act === 'fetch') void fetch('/mock.json').then((response) => response.json()).then((data) => console.log('fetch result', data));
  if (act === 'fetch-404') void fetch('/missing-endpoint').catch((error) => console.error(error));
  if (act === 'xhr') {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/mock.json');
    xhr.send();
  }
  if (act === 'beacon') navigator.sendBeacon('/mock.json', JSON.stringify({ ping: true }));
  if (act === 'asset') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/demo/style.css?gravscope=${Date.now()}`;
    document.head.append(link);
    gc.showTab('network');
  }
  if (act === 'asset-fail') {
    const image = document.createElement('img');
    image.alt = 'missing-gravscope-asset';
    image.src = `/missing-gravscope-asset.png?gravscope=${Date.now()}`;
    image.hidden = true;
    document.body.append(image);
    gc.showTab('network');
  }
  if (act === 'storage') {
    localStorage.setItem('gravscope-note', `saved ${new Date().toLocaleTimeString()}`);
    gc.showTab('storage');
  }
  if (act === 'cookie') document.cookie = `gravscope_demo=1; path=/`;
  if (act === 'reject') void Promise.reject(new Error('rejected on purpose'));
  if (act === 'system') {
    gc.setSystemInfo('User', 'ada');
    gc.showTab('system');
  }
  if (act === 'plugin' && !pluginAdded) {
    pluginAdded = true;
    const plugin = new GravScopePlugin('custom', '自定义');
    plugin.on('render', (element) => {
      element.style.padding = '16px';
      element.textContent = '这是一个自定义插件面板。';
    });
    plugin.addTool('Ping', () => console.log('plugin ping', Date.now()));
    gc.addPlugin(plugin);
    gc.showTab('custom');
  }
}
