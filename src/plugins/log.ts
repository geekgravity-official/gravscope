import type { LogHistory } from '../core/log-history';
import type { LogItem, LogStore } from '../core/store';
import { GravScopePlugin } from '../core/plugin';
import { formatCopy } from '../format/value';
import { formatTime } from '../format/text';
import { t } from '../i18n';
import type { GravScopeLang, LogLevel } from '../types';
import { bindCopy, copyText, el } from '../ui/dom';
import { renderMessage } from '../ui/value-view';

type FilterLevel = 'all' | LogLevel;
const PAGE_SIZE = 200;
const MAX_CONTEXT = 100;

export function createLogPlugin(store: LogStore, lang: GravScopeLang, runCommand: (code: string) => void, persistence?: LogHistory): GravScopePlugin {
  const plugin = new GravScopePlugin('log', t(lang, 'log'));
  let list: HTMLElement | null = null;
  let empty: HTMLElement | null = null;
  let toast: HTMLElement | null = null;
  let level: FilterLevel = 'all';
  let query = '';
  let follow = true;
  let paused = false;
  let unseen = 0;
  let anchor: number | null = null;
  let firstShown: number | null = null;
  let renderTimer = 0;
  let pageStart = 0;
  let eligible: LogItem[] = [];
  let pages: HTMLElement | null = null;
  let pageLabel: HTMLElement | null = null;
  let older: HTMLButtonElement | null = null;
  let newer: HTMLButtonElement | null = null;
  let resume: HTMLButtonElement | null = null;
  const syncUnseen = () => { if (resume) { resume.hidden = !paused && unseen === 0; resume.textContent = lang === 'zh' ? `新增 ${unseen} 条 · 回到底部` : `${unseen} new · Resume`; } };
  const resumeFollow = () => { paused = false; follow = true; anchor = null; unseen = 0; syncUnseen(); syncEmpty(); if (list) list.scrollTop = list.scrollHeight; };
  let toastTimer = 0;
  let commandForm: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  const rows = new Map<number, { item: LogItem; row: HTMLElement }>();
  const textById = new Map<number, string>();
  const collapsed = new Set<number>();

  const passes = (item: LogItem) => {
    if (level !== 'all' && item.level !== level) return false;
    if (!query) return true;
    if (!textById.has(item.id)) remember(item);
    return (textById.get(item.id) ?? '').toLowerCase().includes(query);
  };

  const syncEmpty = () => {
    if (!empty) return;
    window.clearTimeout(renderTimer); renderTimer = 0;
    if (store.items.length > PAGE_SIZE) { renderWindow(); return; }
    if (pages) pages.hidden = true;
    for (const item of store.items) if (!rows.has(item.id)) appendRow(item);
    // A filtered large window may retain later rows before older rows are restored.
    const ordered = store.items.map(item => rows.get(item.id)!);
    for (let index = 0; index < ordered.length; index++) {
      const next = index === 0 ? empty.nextSibling : ordered[index - 1].row.nextSibling;
      if (next !== ordered[index].row) list?.insertBefore(ordered[index].row, next);
    }
    const filtering = Boolean(query) || level !== 'all';
    const matching = new Set<number>();
    if (filtering) {
      for (const { item } of rows.values()) {
        if (!passes(item)) continue;
        matching.add(item.id);
        for (const id of item.groupIds) matching.add(id);
      }
    }
    for (const { item, row } of rows.values()) {
      row.hidden = filtering ? !matching.has(item.id) : item.groupIds.some(id => collapsed.has(id) && rows.has(id));
      const toggle = row.querySelector<HTMLButtonElement>('.gc-group-toggle');
      if (toggle) {
        const open = filtering || !collapsed.has(item.id);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? '▾' : '▸';
        toggle.disabled = filtering;
      }
    }
    const visibleRows = ordered.filter(({ row }) => !row.hidden);
    for (const { row } of rows.values()) row.classList.remove('gc-group-start', 'gc-group-end');
    visibleRows.forEach(({ row }, index) => {
      const region = row.dataset.groupRegion;
      if (!region) return;
      if (visibleRows[index - 1]?.row.dataset.groupRegion !== region) row.classList.add('gc-group-start');
      if (visibleRows[index + 1]?.row.dataset.groupRegion !== region) row.classList.add('gc-group-end');
    });
    const visible = visibleRows.length;
    empty.hidden = visible > 0;
    empty.textContent = t(lang, query || level !== 'all' ? 'noMatches' : 'emptyLog');
    if (count) count.textContent = `${visible} / ${rows.size}`;
    firstShown = store.items[0]?.id ?? null;
    if (follow && list) list.scrollTop = list.scrollHeight;
  };

  const matchingItems = (): LogItem[] => {
    const retained = new Set(store.items.map(item => item.id));
    for (const item of store.items) if (item.kind === 'group' && item.collapsed) collapsed.add(item.id);
    if (query || level !== 'all') {
      const ids = new Set<number>();
      for (const item of store.items) if (passes(item)) { ids.add(item.id); for (const id of item.groupIds) ids.add(id); }
      return store.items.filter(item => ids.has(item.id));
    }
    return store.items.filter(item => !item.groupIds.some(id => collapsed.has(id) && retained.has(id)));
  };

  const renderWindow = () => {
    if (!list || !empty) return;
    const scrollTop = list.scrollTop;
    eligible = matchingItems();
    pageStart = anchor === null ? Math.max(0, eligible.length - PAGE_SIZE) : eligible.findIndex(item => item.id >= anchor!);
    if (pageStart < 0) pageStart = Math.max(0, eligible.length - PAGE_SIZE);
    const selected = eligible.slice(pageStart, pageStart + PAGE_SIZE);
    firstShown = selected[0]?.id ?? null;
    const ids = new Set(selected.map(item => item.id));
    let context = 0;
    for (const item of selected) for (const id of item.groupIds) {
      if (!ids.has(id) && context < MAX_CONTEXT) { ids.add(id); context++; }
    }
    const shown = eligible.filter(item => ids.has(item.id));
    const shownIds = new Set(shown.map(item => item.id));
    for (const [id, entry] of rows) if (!shownIds.has(id)) { entry.row.remove(); rows.delete(id); }
    const fragment = document.createDocumentFragment();
    const filtering = Boolean(query) || level !== 'all';
    for (const item of shown) {
      if (!rows.has(item.id)) appendRow(item);
      const row = rows.get(item.id)!.row;
      row.hidden = false;
      const toggle = row.querySelector<HTMLButtonElement>('.gc-group-toggle');
      if (toggle) { const open = filtering || !collapsed.has(item.id); toggle.disabled = filtering; toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? '▾' : '▸'; }
      row.classList.remove('gc-group-start', 'gc-group-end');
      fragment.append(row);
    }
    shown.forEach((item, index) => {
      const row = rows.get(item.id)!.row;
      const region = row.dataset.groupRegion;
      if (!region) return;
      if (rows.get(shown[index - 1]?.id)?.row.dataset.groupRegion !== region) row.classList.add('gc-group-start');
      if (rows.get(shown[index + 1]?.id)?.row.dataset.groupRegion !== region) row.classList.add('gc-group-end');
    });
    list.append(fragment);
    empty.hidden = eligible.length > 0;
    empty.textContent = t(lang, query || level !== 'all' ? 'noMatches' : 'emptyLog');
    if (count) count.textContent = `${eligible.length} / ${store.items.length}`;
    if (pages) pages.hidden = eligible.length <= PAGE_SIZE;
    if (pageLabel) pageLabel.textContent = `${eligible.length ? pageStart + 1 : 0}–${Math.min(eligible.length, pageStart + PAGE_SIZE)} / ${eligible.length}`;
    if (older) older.disabled = pageStart === 0;
    if (newer) newer.disabled = pageStart + PAGE_SIZE >= eligible.length;
    list.scrollTop = follow ? list.scrollHeight : scrollTop;
  };

  const scheduleRender = () => {
    if (store.items.length <= PAGE_SIZE) syncEmpty();
    else if (!renderTimer) renderTimer = window.setTimeout(syncEmpty, 16);
  };

  const apply = (item: LogItem, row: HTMLElement) => {
    row.hidden = !passes(item) || (!query && level === 'all' && item.groupIds.some(id => collapsed.has(id) && rows.has(id)));
  };

  const remember = (item: LogItem) => {
    const body = item.args
      .map((arg) => formatCopy(arg))
      .join(' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\n+|\n+$/g, '');
    const command = item.command ?? '';
    textById.set(item.id, [command, body].filter(Boolean).join('\n'));
  };

  const appendRow = (item: LogItem) => {
    if (!list) return;
    if (!textById.has(item.id)) remember(item);
    if (item.kind === 'group' && item.collapsed) collapsed.add(item.id);
    const row = el('div', { class: `gc-row gc-lvl-${item.level}` });
    row.dataset.id = String(item.id);
    if (item.boundary) row.classList.add('gc-session-boundary');
    const region = item.groupIds[0] ?? (item.kind === 'group' ? item.id : undefined);
    if (region !== undefined) {
      row.dataset.groupRegion = String(region);
      row.classList.add('gc-group-region');
      const colors = ['75, 118, 255', '139, 104, 218', '38, 151, 139'];
      row.style.setProperty('--group-rgb', colors[region % colors.length]);
      const layer = Math.min(4, item.groupIds.length + (item.kind === 'group' ? 1 : 0));
      row.style.setProperty('--group-opacity', String(0.08 + Math.max(0, layer - 1) * 0.045));
    }
    row.style.paddingLeft = `${Math.min(item.depth, 12) * 12}px`;
    const line = el('div', { class: 'gc-line' });
    const head = el('div', { class: 'gc-line-head' });
    const message = el('div', { class: 'gc-msg' });
    const details = el('div', { class: 'gc-details' });
    renderMessage(message, details, item);
    head.append(
      el('time', { class: 'gc-time', text: formatTime(item.time) }),
      el('i', { class: `gc-lvl gc-lvl-${item.level}`, text: item.level }),
    );
    if (item.historical) head.append(el('span', { class: 'gc-history-badge', text: lang === 'zh' ? '历史' : 'History' }));
    if (item.repeat > 1) head.append(el('em', { class: 'gc-repeat', text: String(item.repeat) }));
    line.append(head, message);
    const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
    copy.setAttribute('aria-label', t(lang, 'copy'));
    bindCopy(copy, () => textById.get(item.id) ?? '', lang);
    const main = el('div', { class: 'gc-row-main' });
    if (item.kind === 'group') {
      row.classList.add('gc-group');
      const toggle = el('button', { class: 'gc-group-toggle', type: 'button', 'aria-label': textById.get(item.id) || 'console.group', 'aria-expanded': String(!collapsed.has(item.id)), text: collapsed.has(item.id) ? '▸' : '▾' });
      toggle.addEventListener('click', () => {
        if (collapsed.has(item.id)) collapsed.delete(item.id);
        else collapsed.add(item.id);
        item.collapsed = collapsed.has(item.id);
        persistence?.flush();
        syncEmpty();
      });
      main.append(toggle);
    }
    main.append(line, copy);
    row.append(main, details);
    list.append(row);
    rows.set(item.id, { item, row });
    apply(item, row);

  };

  const updateRow = (item: LogItem) => {
    const found = rows.get(item.id);
    if (!found) return;
    remember(item);
    const head = found.row.querySelector('.gc-line-head');
    let badge = found.row.querySelector('.gc-repeat');
    if (!badge && head) {
      badge = el('em', { class: 'gc-repeat' });
      head.append(badge);
    }
    if (badge) badge.textContent = String(item.repeat);
    apply(item, found.row);
  };

  const showToast = (text: string) => {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 1200);
  };

  plugin.on('render', (pane) => {
    const filters = el('div', { class: 'gc-filters gc-log-filters' });
    const levels: FilterLevel[] = ['all', 'log', 'info', 'warn', 'error', 'debug'];
    const select = el('select', { class: 'gc-level-select', 'aria-label': t(lang, 'levels') }) as HTMLSelectElement;
    for (const name of levels) select.append(el('option', { value: name, text: t(lang, name) }));
    select.addEventListener('change', () => {
      level = select.value as FilterLevel; anchor = null;
      for (const { item, row } of rows.values()) apply(item, row);
      syncEmpty();
    });
    const search = el('input', { class: 'gc-search', type: 'search', placeholder: t(lang, 'search') }) as HTMLInputElement;
    search.setAttribute('aria-label', t(lang, 'search'));
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase(); anchor = null;
      for (const { item, row } of rows.values()) apply(item, row);
      syncEmpty();
    });
    count = el('span', { class: 'gc-result-count' });
    filters.append(search, select, count);
    if (persistence) {
      const checkbox = el('input', { type: 'checkbox', class: 'gc-preserve-logs' });
      checkbox.checked = persistence.enabled;
      checkbox.addEventListener('change', () => persistence.setEnabled(checkbox.checked));
      const label = el('label', { title: lang === 'zh' ? '在当前标签页会话内保存脱敏日志，最多 200 条；关闭后删除保存记录' : 'Save up to 200 sanitized logs in this tab session; disabling deletes saved records' }, [checkbox, lang === 'zh' ? '保留日志' : 'Preserve logs']);
      filters.append(label);
      const stop = persistence.subscribe(() => { checkbox.checked = persistence.enabled; });
      plugin.on('remove', stop);
    }

    list = el('div', { class: 'gc-list' });
    empty = el('div', { class: 'gc-empty', text: t(lang, 'emptyLog') });
    list.append(empty);
    list.addEventListener('scroll', () => {
      if (!list) return;
      if (paused) return;
      follow = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
      if (follow) { unseen = 0; anchor = null; }
      else if (anchor === null) anchor = firstShown;
      syncUnseen();
    });
    toast = el('div', { class: 'gc-toast' });
    toast.hidden = true;

    const form = el('form', { class: 'gc-cmd' });
    commandForm = form;
    form.hidden = true;
    const input = el('input', { class: 'gc-cmd-input', type: 'text', placeholder: t(lang, 'command') }) as HTMLInputElement;
    input.setAttribute('aria-label', t(lang, 'command'));
    input.autocomplete = 'off';
    input.spellcheck = false;
    const history: string[] = [];
    let cursor = 0;
    form.append(input, el('button', { type: 'submit', text: t(lang, 'run') }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim();
      if (!code) return;
      history.push(code);
      if (history.length > 50) history.shift();
      cursor = history.length;
      runCommand(code);
      input.value = '';
      resumeFollow();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!history.length) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') cursor = Math.max(0, cursor - 1);
      else cursor = Math.min(history.length, cursor + 1);
      input.value = cursor >= history.length ? '' : history[cursor] ?? '';
    });

    resume = el('button', { class: 'gc-resume-logs gc-tool', type: 'button' });
    resume.hidden = true;
    resume.addEventListener('click', resumeFollow);
    older = el('button', { class: 'gc-tool gc-log-older', type: 'button', text: lang === 'zh' ? '更早记录' : 'Earlier' });
    newer = el('button', { class: 'gc-tool gc-log-newer', type: 'button', text: lang === 'zh' ? '更新记录' : 'Newer' });
    pageLabel = el('span', { 'aria-live': 'polite' });
    pages = el('div', { class: 'gc-log-pages' }, [older, pageLabel, newer]);
    pages.hidden = true;
    older.addEventListener('click', () => { paused = true; follow = false; anchor = eligible[Math.max(0, pageStart - PAGE_SIZE)]?.id ?? null; syncEmpty(); syncUnseen(); if (list) list.scrollTop = 0; });
    newer.addEventListener('click', () => { paused = true; follow = false; anchor = eligible[Math.min(Math.max(0, eligible.length - PAGE_SIZE), pageStart + PAGE_SIZE)]?.id ?? null; syncEmpty(); syncUnseen(); if (list) list.scrollTop = 0; });
    const referenceNote = el('p', { class: 'gc-meta gc-log-reference-note', text: lang === 'zh' ? '对象保留引用：展开或导出时的值可能已变化。' : 'Objects are retained by reference; values may change before expansion or export.' });
    pane.append(filters, referenceNote, resume, pages, list, toast, form);
    syncEmpty();

    const unsubscribe = store.subscribe((event) => {
      if ((event.type === 'add' || event.type === 'update') && !follow) { unseen += 1; syncUnseen(); }
      if (event.type === 'add') {
        if (store.items.length <= PAGE_SIZE && !rows.has(event.item.id)) appendRow(event.item);
        scheduleRender();
      } else if (event.type === 'update') {
        textById.delete(event.item.id);
        updateRow(event.item);
        scheduleRender();
      } else if (event.type === 'trim') {
        for (const id of event.ids) {
          rows.get(id)?.row.remove();
          rows.delete(id);
          textById.delete(id);
          collapsed.delete(id);
        }
        scheduleRender();
      } else if (event.type === 'clear') {
        unseen = 0; anchor = null; syncUnseen();
        rows.clear();
        collapsed.clear();
        textById.clear();
        list?.replaceChildren();
        if (empty && list) list.append(empty);
        syncEmpty();
      }
    });
    plugin.on('remove', () => {
      unsubscribe();
      window.clearTimeout(toastTimer);
      window.clearTimeout(renderTimer);
      rows.clear(); textById.clear(); collapsed.clear();
    });
  });

  plugin.on('show', () => {
    syncEmpty();
    if (list && follow) list.scrollTop = list.scrollHeight;
  });

  plugin.addTool(t(lang, 'clear'), () => store.clear());
  plugin.addTool(t(lang, 'copy'), () => {
    const text = matchingItems().filter(passes).map(item => {
      if (!textById.has(item.id)) remember(item);
      return textById.get(item.id) ?? '';
    }).filter(Boolean).join('\n');
    void copyText(text).then((ok) => showToast(ok ? t(lang, 'copied') : t(lang, 'copyFailed')));
  }, { placement: 'more' });
  plugin.addTool(t(lang, 'console'), () => {
    if (!commandForm) return;
    commandForm.hidden = !commandForm.hidden;
    if (!commandForm.hidden) commandForm.querySelector('input')?.focus();
  }, { placement: 'more' });
  plugin.addTool(lang === 'zh' ? '暂停滚动' : 'Pause scrolling', () => { paused = true; follow = false; anchor = firstShown; syncUnseen(); });
  plugin.addTool(t(lang, 'latest'), resumeFollow);

  return plugin;
}
