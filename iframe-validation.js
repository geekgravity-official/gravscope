// Manual WKWebView harness. Messages below belong to this fixture, not GravScope.
(async () => {
  const role = new URLSearchParams(location.search).get('role') || 'top';
  const output = document.querySelector('#results');
  document.querySelector('#label').textContent = '框架：' + role;
  const panel = new GravScope({ lang: 'zh', entryButton: false, preserveLogs: true, capture: { network: false, navigation: false, performance: false, realtime: false } });
  const markers = () => panel.getReport().logs.flatMap(item => item.args || []).filter(value => typeof value === 'string' && value.startsWith('iframe-check:'));
  const snapshot = () => ({ frame: panel.getReport().frame, markers: markers(), userAgent: navigator.userAgent, nativeWebView: !!window.ReactNativeWebView });
  window.fixture = { panel, snapshot, seed: value => { console.log('iframe-check:' + value); window.dispatchEvent(new Event('pagehide')); } };
  document.querySelector('#open').onclick = () => panel.show();
  output.textContent = JSON.stringify(snapshot(), null, 2);
  const add = (label, sandbox) => {
    const frame = document.createElement('iframe');
    frame.title = label;
    if (sandbox) frame.setAttribute('sandbox', 'allow-scripts');
    frame.src = '/iframe-validation.html?role=' + label;
    document.querySelector('#children').append(frame);
    return frame;
  };
  if (role === 'a') add('nested');
  if (role === 'sandbox') {
    window.fixture.seed('sandbox-live');
    let denied = false;
    try { sessionStorage.getItem('gravscope:log-history:v1'); } catch { denied = true; }
    top.postMessage({ fixture: 'gravscope-frame-validation', ...snapshot(), storageDenied: denied }, '*');
  }
  if (role !== 'top') return;
  const a = add('a'), b = add('b'), restricted = add('sandbox', true);
  let sandboxResult;
  window.addEventListener('message', event => {
    if (event.source === restricted.contentWindow && event.origin === 'null' && event.data?.fixture === 'gravscope-frame-validation') sandboxResult = event.data;
  });
  const waitFor = async callback => {
    const until = Date.now() + 15000;
    while (Date.now() < until) { try { const value = callback(); if (value) return value; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
    throw Error('等待框架加载超时');
  };
  const run = document.querySelector('#run'); run.hidden = false;
  run.onclick = async () => {
    run.disabled = true;
    const results = [];
    const check = (name, condition) => { if (!condition) throw Error(name); results.push('PASS ' + name); output.textContent = results.join('\n'); };
    try {
      let af = await waitFor(() => a.contentWindow.fixture);
      const bf = await waitFor(() => b.contentWindow.fixture);
      let nf = await waitFor(() => a.contentWindow.frames[0].fixture);
      await waitFor(() => sandboxResult);
      for (const f of [window.fixture, af, bf, nf]) { f.panel.setOption('preserveLogs', true); f.panel.clearAll(); }
      window.fixture.seed('top'); af.seed('a'); bf.seed('b'); nf.seed('nested');
      const equal = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      check('各框架只采集自身日志', [window.fixture, af, bf, nf].every((f, i) => equal(f.snapshot().markers, ['iframe-check:' + ['top', 'a', 'b', 'nested'][i]])));
      check('报告标明 top / [0] / [1] / [0,0]', equal([window.fixture, af, bf, nf].map(f => f.snapshot().frame.path), [[], [0], [1], [0, 0]]) && panel.getReport().frame.type === 'top');
      const key = 'gravscope:log-history:v1';
      check('同源历史分成四个键', ['', ':frame:0', ':frame:1', ':frame:0.0'].every((suffix, i) => JSON.parse(sessionStorage.getItem(key + suffix)).records.some(r => r.args.includes('iframe-check:' + ['top', 'a', 'b', 'nested'][i]))));
      const loaded = new Promise(resolve => a.addEventListener('load', resolve, { once: true }));
      a.contentWindow.location.reload(); await loaded;
      af = await waitFor(() => a.contentWindow.fixture);
      nf = await waitFor(() => a.contentWindow.frames[0].fixture);
      check('子页面与嵌套页刷新恢复各自历史', equal(af.snapshot().markers, ['iframe-check:a']) && equal(nf.snapshot().markers, ['iframe-check:nested']));
      const preserved = [key, key + ':frame:1', key + ':frame:0.0'].map(k => sessionStorage.getItem(k));
      af.panel.clearAll();
      check('清空子页不动父页/兄弟/嵌套历史', af.snapshot().markers.length === 0 && [key, key + ':frame:1', key + ':frame:0.0'].every((k, i) => sessionStorage.getItem(k) === preserved[i]));
      af.panel.setOption('preserveLogs', false);
      check('关闭子页保留只删除子页键', sessionStorage.getItem(key + ':frame:0') === null && [key, key + ':frame:1', key + ':frame:0.0'].every((k, i) => sessionStorage.getItem(k) === preserved[i]));
      check('sandbox 禁止存储仍能采集和导出', sandboxResult.storageDenied === true && sandboxResult.frame.type === 'iframe' && equal(sandboxResult.markers, ['iframe-check:sandbox-live']));
      results.push('完成：7 项通过。真实 WKWebView；不代表动态重排或跨框架聚合已支持。');
      output.textContent = results.join('\n');
    } catch (error) { output.textContent = results.join('\n') + '\nFAIL ' + error.message; }
    finally { run.disabled = false; }
  };
})();
