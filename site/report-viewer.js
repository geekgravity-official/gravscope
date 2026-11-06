(() => {
  'use strict';
  const english = document.documentElement.lang === 'en';
  const t = (zh, en) => english ? en : zh;
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_RECORDS = 10000;
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) throw new Error(t("报告超过 5 MB 限制", "Report exceeds the 5 MB limit"));
    const data = JSON.parse(text);
    if (!data || data.schemaVersion !== 1 || typeof data.version !== 'string' || typeof data.createdAt !== 'string'
      || !Array.isArray(data.logs) || !Array.isArray(data.network)
      || data.logs.length > MAX_RECORDS || data.network.length > MAX_RECORDS) throw new Error(t("不支持的报告格式或记录数量超限", "Unsupported report format or record limit exceeded"));
    const ids = new Set();
    for (const item of data.logs) {
      if (!item || !Number.isSafeInteger(item.id) || ids.has(item.id) || !Number.isFinite(item.time) || !Array.isArray(item.args)
        || !['log', 'info', 'warn', 'error', 'debug'].includes(item.level)
        || (item.groupIds !== undefined && (!Array.isArray(item.groupIds) || item.groupIds.length > 100 || item.groupIds.some(id => !Number.isSafeInteger(id) || id >= item.id)))) throw new Error(t("日志结构无效", "Invalid log structure"));
      ids.add(item.id);
    }
    for (const item of data.network) if (!item || typeof item.url !== 'string' || typeof item.method !== 'string' || !Number.isFinite(item.status)) throw new Error(t("请求结构无效", "Invalid request structure"));
    if (data.activity !== undefined && (!Array.isArray(data.activity) || data.activity.length > 1000)) throw new Error(t("活动记录数量无效", "Invalid activity count"));
    for (const item of data.activity || []) if (!item || !Number.isFinite(item.time) || !['navigation', 'longtask', 'websocket', 'sse'].includes(item.type) || typeof item.action !== 'string' || typeof item.url !== 'string' || item.detail === undefined) throw new Error(t("活动记录结构无效", "Invalid activity structure"));
    return data;
  }
  function mount(root) {
    const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const pretty = value => { try { return (typeof value === 'string' ? value : JSON.stringify(value, null, 2)).slice(0, 20000); } catch { return t("[内容过深，无法预览]", "[Content is too deeply nested to preview]"); } };
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
      status.textContent = t("报告已清除；文件仅在当前页面内存中读取。", "Report cleared; files are read only in this page’s memory.");
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
        const title = activity ? `${item.type} · ${item.action} · ${new Date(item.time).toLocaleString()} · ${item.url}` : network ? `${item.method} · ${item.status} · ${item.url}` : `${item.historical ? t("[历史] ", "[History] ") : ''}${item.boundary ? t("[新会话] ", "[New session] ") : ''}${item.level} · ${Number.isFinite(item.time) ? new Date(item.time).toLocaleString() : ''} · ×${item.repeat || 1} · ${item.args.map(pretty).join(' ').slice(0, 180)}`;
        row.append(el('summary', title), el('pre', pretty(item)));
        (network || activity ? output : container(item)).append(row);
      }
      more.hidden = matching.length <= limit;
      status.textContent = `${activity ? t("活动", "Activity") : mode.value === 'network' ? t("请求", "Requests") : mode.value === 'errors' ? t("异常", "Errors") : t("日志", "Logs")}${t('：显示 ', ': showing ')}${selected.length} / ${matching.length}${t(' 条匹配记录。只读回放，不重发请求。', ' matching records. Read-only replay; requests are not resent.')}`;
    }
    async function load(file) {
      const current = ++generation;
      if (!file) return;
      status.textContent = t("正在读取本地报告…", "Reading local report…");
      try {
        if (file.size > MAX_BYTES) throw new Error(t("报告超过 5 MB 限制", "Report exceeds the 5 MB limit"));
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error(t("读取文件失败", "Could not read file")));
          reader.readAsText(file);
        });
        if (current !== generation) return;
        const parsed = parse(text);
        data = parsed;
        logText = data.logs.map(item => `${item.level} ${item.args.map(pretty).join(' ')}`);
        netText = data.network.map(item => `${item.method} ${item.status} ${item.url} ${pretty(item)}`);
        limit = 100; search.value = '';
        metadata.textContent = pretty({ version: data.version, createdAt: data.createdAt, page: data.page, frame: data.frame, performance: data.performance, device: data.device, custom: data.custom, policy: data.policy });
        render();
      } catch (error) {
        if (current !== generation) return;
        data = null; logText = []; netText = []; output.replaceChildren(); metadata.textContent = ''; more.hidden = true;
        status.textContent = `${t('无法导入：', 'Import failed: ')}${error.message || error}`;
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
