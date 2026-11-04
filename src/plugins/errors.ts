import { GravScopePlugin } from '../core/plugin';
import type { LogStore, LogItem } from '../core/store';
import type { GravScopeLang } from '../types';
import { formatCopy } from '../format/value';
import { bindCopy, el } from '../ui/dom';

export function createErrorsPlugin(store: LogStore, lang: GravScopeLang, context?: (time: number) => void): GravScopePlugin {
  const plugin = new GravScopePlugin('errors', lang === 'zh' ? '异常' : 'Errors');
  let query = '';
  let source = '';
  let list: HTMLElement;
  let page = 0;
  let timer = 0;
  let navigation: HTMLElement;
  let label: HTMLElement;
  let previous: HTMLButtonElement;
  let next: HTMLButtonElement;
  const pageSize = 100;
  const rows = new Map<string, HTMLDetailsElement>();
  const body = (item: LogItem) => item.args.map(arg => formatCopy(arg)).join('\n');
  const paint = () => {
    if (!list) return;
    window.clearTimeout(timer); timer = 0;
    const scrollTop = list.scrollTop;
    const groups = new Map<string, { item: LogItem; count: number; text: string }>();
    for (const item of store.items) {
      if (item.level !== 'error') continue;
      const kind = item.errorSource || 'console';
      const text = body(item);
      if ((source && kind !== source) || (query && !text.toLowerCase().includes(query))) continue;
      const key = kind + '\n' + text;
      const previous = groups.get(key);
      groups.set(key, { item, text, count: (previous?.count || 0) + item.repeat });
    }
    const entries = [...groups.entries()].reverse();
    page = Math.min(page, Math.max(0, Math.ceil(entries.length / pageSize) - 1));
    const selected = entries.slice(page * pageSize, (page + 1) * pageSize);
    const keys = new Set(selected.map(([key]) => key));
    for (const key of rows.keys()) if (!keys.has(key)) rows.delete(key);
    const fragment = document.createDocumentFragment();
    for (const [key, { item, count, text }] of selected) {
      let row = rows.get(key);
      if (!row) {
        row = el('details', { class: 'gc-error-item' });
        const copy = el('button', { class: 'gc-tool', type: 'button', text: lang === 'zh' ? '复制堆栈' : 'Copy stack' });
        bindCopy(copy, () => text, lang);
        row.append(el('summary'), el('time'), copy, el('pre', { class: 'gc-pre', text }));
        rows.set(key, row);
      }
      if (context) {
        let button = row.querySelector<HTMLButtonElement>('.gc-error-context');
        if (!button) { button = el('button', { class: 'gc-tool gc-error-context', text: lang === 'zh' ? '查看前后记录' : 'View context' }); row.append(button); }
        button.onclick = () => context(item.time);
      }
      row.querySelector('summary')!.textContent = `${item.errorSource || 'console'} · ×${count} · ${text.split('\n')[0]}`;
      row.querySelector('time')!.textContent = new Date(item.time).toISOString();
      fragment.append(row);
    }
    if (!groups.size) fragment.append(el('div', { class: 'gc-empty', text: lang === 'zh' ? '暂无匹配异常' : 'No matching errors' }));
    list.replaceChildren(fragment);
    list.scrollTop = scrollTop;
    navigation.hidden = entries.length <= pageSize;
    label.textContent = `${entries.length ? page * pageSize + 1 : 0}–${Math.min(entries.length, (page + 1) * pageSize)} / ${entries.length}`;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * pageSize >= entries.length;
  };
  plugin.on('render', pane => {
    const search = el('input', { class: 'gc-search', type: 'search', placeholder: lang === 'zh' ? '搜索异常与堆栈' : 'Search errors and stacks', 'aria-label': 'Search errors' });
    const select = el('select', { class: 'gc-level-select', 'aria-label': 'Error source' });
    for (const value of ['', 'runtime', 'promise', 'resource', 'console']) select.append(el('option', { value, text: value || (lang === 'zh' ? '全部来源' : 'All sources') }));
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); page = 0; paint(); });
    select.addEventListener('change', () => { source = select.value; page = 0; paint(); });
    list = el('div', { class: 'gc-list' });
    previous = el('button', { class: 'gc-tool gc-errors-previous', type: 'button', text: lang === 'zh' ? '上一页' : 'Previous' });
    next = el('button', { class: 'gc-tool gc-errors-next', type: 'button', text: lang === 'zh' ? '下一页' : 'Next' });
    label = el('span', { 'aria-live': 'polite' });
    navigation = el('div', { class: 'gc-log-pages' }, [previous, label, next]);
    previous.addEventListener('click', () => { page = Math.max(0, page - 1); paint(); list.scrollTop = 0; });
    next.addEventListener('click', () => { page++; paint(); list.scrollTop = 0; });
    pane.append(el('div', { class: 'gc-filters' }, [search, select]), navigation, list);
    const stop = store.subscribe(event => {
      if (event.type !== 'clear' && event.type !== 'trim' && event.item.level !== 'error') return;
      if (event.type === 'clear') { page = 0; rows.clear(); }
      if (event.type === 'clear' || store.items.length <= 200) paint();
      else if (!timer) timer = window.setTimeout(paint, 16);
    });
    plugin.on('remove', () => { stop(); window.clearTimeout(timer); rows.clear(); });
    plugin.on('show', paint);
    paint();
  });
  plugin.addTool(lang === 'zh' ? '清空异常' : 'Clear errors', () => store.clearErrors());
  return plugin;
}
