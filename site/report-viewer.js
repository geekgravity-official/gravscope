(() => {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_RECORDS = 10000;
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error('报告超过 5 MB 限制');
    const data = JSON.parse(text);
    if (!data || data.schemaVersion !== 1 || typeof data.version !== 'string' || typeof data.createdAt !== 'string'
      || !Array.isArray(data.logs) || !Array.isArray(data.network)
      || data.logs.length > MAX_RECORDS || data.network.length > MAX_RECORDS) throw new Error('不支持的报告格式或记录数量超限');
    const ids = new Set();
    for (const item of data.logs) {
      if (!item || !Number.isSafeInteger(item.id) || ids.has(item.id) || !Number.isFinite(item.time) || !Array.isArray(item.args)
        || !['log', 'info', 'warn', 'error', 'debug'].includes(item.level)
        || (item.groupIds !== undefined && (!Array.isArray(item.groupIds) || item.groupIds.length > 100 || item.groupIds.some(id => !Number.isSafeInteger(id) || id >= item.id)))) throw new Error('日志结构无效');
      ids.add(item.id);
    }
    for (const item of data.network) if (!item || typeof item.url !== 'string' || typeof item.method !== 'string' || !Number.isFinite(item.status)) throw new Error('请求结构无效');
    if (data.activity !== undefined && (!Array.isArray(data.activity) || data.activity.length > 1000)) throw new Error('活动记录数量无效');
    for (const item of data.activity || []) if (!item || !Number.isFinite(item.time) || !['navigation', 'longtask', 'websocket', 'sse'].includes(item.type) || typeof item.action !== 'string' || typeof item.url !== 'string' || item.detail === undefined) throw new Error('活动记录结构无效');
    return data;
  }
  function mount(root) {
    const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const pretty = value => { try { return (typeof value === 'string' ? value : JSON.stringify(value, null, 2)).slice(0, 20000); } catch { return '[内容过深，无法预览]'; } };
    const input = root.querySelector('[data-report-file]');
    const status = root.querySelector('[data-report-status]');
    const output = root.querySelector('[data-report-output]');
    const search = root.querySelector('[data-report-search]');
    const mode = root.querySelector('[data-report-mode]');
    const more = root.querySelector('[data-report-more]');
    const metadata = root.querySelector('[data-report-meta]');
    let data = null;
    let limit = 100;
    let generation = 0;
    let logText = [];
    let netText = [];
    function clear() {
      generation++;
      data = null; logText = []; netText = []; input.value = ''; search.value = ''; output.replaceChildren(); metadata.textContent = ''; more.hidden = true;
      status.textContent = '报告已清除；文件仅在当前页面内存中读取。';
    }
    function render() {
      output.replaceChildren(); more.hidden = true;
      if (!data) return;
      const query = search.value.trim().toLowerCase();
      const network = mode.value === 'network';
      const activity = mode.value === 'activity';
      const items = activity ? (data.activity || []) : network ? data.network : data.logs;
      const texts = activity ? items.map(pretty) : network ? netText : logText;
      const matching = items.filter((item, index) => (mode.value !== 'errors' || item.level === 'error') && (!query || texts[index].toLowerCase().includes(query)));
      const selected = matching.slice(0, limit);
      const allLogs = new Map(data.logs.map(item => [item.id, item]));
      const groups = new Map();
      function container(item, depth = 0) {
        const parentId = (item.groupIds || []).slice(-1)[0];
        if (parentId === undefined || depth >= 20) return output;
        const parent = allLogs.get(parentId);
        if (!parent || parent.kind !== 'group') return output;
        return group(parent, depth + 1);
      }
      function group(item, depth = 0) {
        if (groups.has(item.id)) return groups.get(item.id);
        const box = el('details'); box.className = 'report-group';
        box.open = Boolean(query) || !item.collapsed;
        box.append(el('summary', item.args.map(pretty).join(' ')));
        groups.set(item.id, box);
        container(item, depth).append(box);
        return box;
      }
      for (const item of selected) {
        if (!activity && !network && item.kind === 'group') { group(item); continue; }
        const row = el('details'); row.className = 'report-record';
        const title = activity ? `${item.type} · ${item.action} · ${new Date(item.time).toLocaleString()} · ${item.url}` : network ? `${item.method} · ${item.status} · ${item.url}` : `${item.historical ? '[历史] ' : ''}${item.boundary ? '[新会话] ' : ''}${item.level} · ${Number.isFinite(item.time) ? new Date(item.time).toLocaleString() : ''} · ×${item.repeat || 1} · ${item.args.map(pretty).join(' ').slice(0, 180)}`;
        row.append(el('summary', title), el('pre', pretty(item)));
        (network || activity ? output : container(item)).append(row);
      }
      more.hidden = matching.length <= limit;
      status.textContent = `${activity ? '活动' : mode.value === 'network' ? '请求' : mode.value === 'errors' ? '异常' : '日志'}：显示 ${selected.length} / ${matching.length} 条匹配记录。只读回放，不重发请求。`;
    }
    async function load(file) {
      const current = ++generation;
      if (!file) return;
      status.textContent = '正在读取本地报告…';
      try {
        if (file.size > MAX_BYTES) throw new Error('报告超过 5 MB 限制');
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('读取文件失败'));
          reader.readAsText(file);
        });
        if (current !== generation) return;
        const parsed = parse(text);
        data = parsed;
        logText = data.logs.map(item => `${item.level} ${item.args.map(pretty).join(' ')}`);
        netText = data.network.map(item => `${item.method} ${item.status} ${item.url} ${pretty(item)}`);
        limit = 100; search.value = '';
        metadata.textContent = pretty({ version: data.version, createdAt: data.createdAt, page: data.page, device: data.device, custom: data.custom, policy: data.policy });
        render();
      } catch (error) {
        if (current !== generation) return;
        data = null; logText = []; netText = []; output.replaceChildren(); metadata.textContent = ''; more.hidden = true;
        status.textContent = `无法导入：${error.message || error}`;
      }
    }
    input.addEventListener('change', () => { void load(input.files[0]); });
    root.addEventListener('dragover', event => { event.preventDefault(); });
    root.addEventListener('drop', event => { event.preventDefault(); void load(event.dataTransfer?.files[0]); });
    search.addEventListener('input', () => { limit = 100; render(); });
    mode.addEventListener('change', () => { limit = 100; render(); });
    more.addEventListener('click', () => { limit += 100; render(); });
    root.querySelector('[data-report-clear]').addEventListener('click', clear);
    return { load, clear };
  }
  window.GravScopeReportViewer = { parse, mount };
  const root = document.querySelector('#report-viewer');
  if (root) window.GravScopeReportViewer.current = mount(root);
})();
