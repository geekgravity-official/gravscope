import { pagePerformanceRows } from '../core/page-performance';
import { GravScopePlugin } from '../core/plugin';
import type { ActivityStore } from '../core/activity';
import type { LogStore, NetStore } from '../core/store';
import type { GravScopeLang } from '../types';
import { formatCopy } from '../format/value';
import { bindCopy, el } from '../ui/dom';

interface Entry { key: string; time: number; title: string; text: string; }
export function createDiagnosticsPlugin(id: 'timeline' | 'performance' | 'streams', logs: LogStore, net: NetStore, activity: ActivityStore, lang: GravScopeLang) {
  const titles = { timeline: ['时间线', 'Timeline'], performance: ['性能', 'Performance'], streams: ['实时连接', 'Streams'] };
  const plugin = new GravScopePlugin(id, titles[id][lang === 'zh' ? 0 : 1]) as GravScopePlugin & { focus(time: number): void };
  let query = '', page = 0, focus: number | null = null, timer = 0;
  let list: HTMLElement, label: HTMLElement, previous: HTMLButtonElement, next: HTMLButtonElement, hint: HTMLElement;
  const cards = new Map<string, HTMLDetailsElement>();
  const collect = (): Entry[] => {
    let entries: Entry[] = [];
    if (id === 'timeline') {
      entries = logs.items.map(item => ({ key: `log-${item.id}`, time: item.time, title: `${item.level} ×${item.repeat}`, text: item.args.map(arg => formatCopy(arg)).join('\n') }));
      entries.push(...net.items.map(item => ({ key: `net-${item.id}`, time: item.startTime, title: `${item.method} ${item.status || (item.pending ? 'pending' : item.statusText)} · ${item.duration} ms`, text: `${item.url}\n${item.error}\n${item.extra}` })));
    }
    if (id === 'performance') {
      entries.push(...pagePerformanceRows(lang).map(([title, text], index) => ({ key: 'page-' + index, time: Date.now(), title, text })));
      const slow = net.items.filter(item => !item.pending && item.duration >= 1000).sort((a, b) => b.duration - a.duration).slice(0, 50);
      const large = net.items.filter(item => item.size > 0).sort((a, b) => b.size - a.size).slice(0, 50);
      entries.push(...slow.map(item => ({ key: `slow-${item.id}`, time: item.startTime, title: `Slow · ${Math.round(item.duration)} ms`, text: item.url })));
      entries.push(...large.map(item => ({ key: `size-${item.id}`, time: item.startTime, title: `Size · ${item.size} bytes`, text: item.url })));
    }
    entries.push(...activity.items.filter(item => id === 'timeline' || (id === 'performance' ? item.type === 'longtask' : item.type === 'websocket' || item.type === 'sse')).map(item => ({ key: `activity-${item.id}`, time: item.time, title: `${item.type} ${item.connection ? '#' + item.connection : ''} · ${item.action}${item.duration ? ' · ' + Math.round(item.duration) + ' ms' : ''}`, text: `${item.url}\n${item.detail}` })));
    if (id !== 'performance') entries.sort((a, b) => b.time - a.time);
    return entries.filter(item => (focus === null || Math.abs(item.time - focus) <= 30000) && `${item.title} ${item.text}`.toLowerCase().includes(query));
  };
  const paint = () => {
    window.clearTimeout(timer); timer = 0;
    if (!list) return;
    const entries = collect();
    page = Math.min(page, Math.max(0, Math.ceil(entries.length / 100) - 1));
    const selected = entries.slice(page * 100, (page + 1) * 100);
    const keys = new Set(selected.map(item => item.key));
    for (const key of cards.keys()) if (!keys.has(key)) cards.delete(key);
    const fragment = document.createDocumentFragment();
    const offset = list.scrollTop;
    for (const entry of selected) {
      let card = cards.get(entry.key);
      if (!card) { card = el('details', { class: 'gc-error-item' }); card.append(el('summary'), el('pre', { class: 'gc-pre' })); cards.set(entry.key, card); }
      card.querySelector('summary')!.textContent = `${entry.key.startsWith('page-') ? '' : new Date(entry.time).toLocaleTimeString() + ' · '}${entry.title} · ${entry.text.split('\n')[0].slice(0, 160)}`;
      card.querySelector('pre')!.textContent = entry.text;
      fragment.append(card);
    }
    if (!entries.length) fragment.append(el('div', { class: 'gc-empty', text: lang === 'zh' ? '暂无匹配记录' : 'No matching records' }));
    list.replaceChildren(fragment); list.scrollTop = offset;
    label.textContent = `${entries.length ? page * 100 + 1 : 0}–${Math.min(entries.length, (page + 1) * 100)} / ${entries.length}`;
    previous.disabled = page === 0; next.disabled = (page + 1) * 100 >= entries.length;
    hint.textContent = focus === null ? (id === 'performance' ? (lang === 'zh' ? '页面指标为当前文档快照，Load 不代表业务就绪；不含标准 LCP/CLS/INP 评分。0 可能来自缓存或连接复用。慢请求 ≥ 1000 ms；体积取浏览器可观测值。长任务仅在浏览器支持时记录，包含调试面板自身开销。' : 'Current-document snapshot; Load is not application readiness. No standard LCP/CLS/INP scores. Zero may reflect cache or connection reuse. Slow requests ≥ 1000 ms; sizes depend on browser visibility. Long tasks require browser support and include debugger overhead.') : (lang === 'zh' ? '仅包含已保留记录；时间接近不代表因果关系。' : 'Retained records only; temporal proximity does not imply causation.')) : (lang === 'zh' ? '异常前后各 30 秒；清除时间范围可查看全部' : '30 seconds before/after the error; reset range to view all');
  };
  const schedule = () => { if (!timer) timer = window.setTimeout(paint, 32); };
  plugin.focus = time => { focus = time; page = 0; paint(); };
  plugin.on('render', pane => {
    const search = el('input', { class: 'gc-search', type: 'search', 'aria-label': lang === 'zh' ? '搜索记录' : 'Search records', placeholder: lang === 'zh' ? '搜索记录' : 'Search records' });
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); page = 0; paint(); });
    previous = el('button', { class: 'gc-tool', text: lang === 'zh' ? '上一页' : 'Previous' });
    next = el('button', { class: 'gc-tool', text: lang === 'zh' ? '下一页' : 'Next' });
    previous.onclick = () => { page--; paint(); list.scrollTop = 0; }; next.onclick = () => { page++; paint(); list.scrollTop = 0; };
    label = el('span'); hint = el('p', { class: 'gc-meta gc-diagnostics-hint' }); list = el('div', { class: 'gc-list' });
    const copy = el('button', { class: 'gc-tool', text: lang === 'zh' ? '复制当前筛选' : 'Copy matches' });
    bindCopy(copy, () => collect().map(item => `${new Date(item.time).toISOString()} ${item.title}\n${item.text}`).join('\n\n'), lang);
    pane.append(el('div', { class: 'gc-filters' }, [search, copy]), hint, el('div', { class: 'gc-log-pages' }, [previous, label, next]), list);
    const stops = [logs.subscribe(schedule), net.subscribe(schedule), activity.subscribe(schedule)];
    const loaded = () => schedule();
    window.addEventListener('load', loaded);
    window.addEventListener('pageshow', loaded);
    plugin.on('remove', () => { window.removeEventListener('load', loaded); window.removeEventListener('pageshow', loaded); stops.forEach(stop => stop()); window.clearTimeout(timer); cards.clear(); });
    paint();
  });
  plugin.on('show', paint);
  plugin.addTool(lang === 'zh' ? '刷新' : 'Refresh', paint);
  if (id === 'timeline') plugin.addTool(lang === 'zh' ? '清除时间范围' : 'Reset range', () => { focus = null; page = 0; paint(); });
  return plugin;
}
