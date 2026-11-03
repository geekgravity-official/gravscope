import type { LogItem, LogStore } from '../core/store';
import { GravScopePlugin } from '../core/plugin';
import { formatCopy } from '../format/value';
import { formatTime } from '../format/text';
import { t } from '../i18n';
import type { GravScopeLang, LogLevel } from '../types';
import { bindCopy, copyText, el } from '../ui/dom';
import { renderMessage } from '../ui/value-view';

type FilterLevel = 'all' | LogLevel;

export function createLogPlugin(store: LogStore, lang: GravScopeLang, runCommand: (code: string) => void): GravScopePlugin {
  const plugin = new GravScopePlugin('log', t(lang, 'log'));
  let list: HTMLElement | null = null;
  let empty: HTMLElement | null = null;
  let toast: HTMLElement | null = null;
  let level: FilterLevel = 'all';
  let query = '';
  let follow = true;
  let toastTimer = 0;
  let commandForm: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  const rows = new Map<number, { item: LogItem; row: HTMLElement }>();
  const textById = new Map<number, string>();

  const passes = (item: LogItem) => {
    if (level !== 'all' && item.level !== level) return false;
    if (!query) return true;
    return (textById.get(item.id) ?? '').toLowerCase().includes(query);
  };

  const syncEmpty = () => {
    if (!empty) return;
    const visible = [...rows.values()].filter(({ row }) => !row.hidden).length;
    empty.hidden = visible > 0;
    empty.textContent = t(lang, query || level !== 'all' ? 'noMatches' : 'emptyLog');
    if (count) count.textContent = `${visible} / ${rows.size}`;
  };

  const apply = (item: LogItem, row: HTMLElement) => {
    row.hidden = !passes(item);
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
    remember(item);
    const row = el('div', { class: `gc-row gc-lvl-${item.level}` });
    row.dataset.id = String(item.id);
    row.style.paddingLeft = `${item.depth * 12}px`;
    const line = el('div', { class: 'gc-line' });
    const head = el('div', { class: 'gc-line-head' });
    const message = el('div', { class: 'gc-msg' });
    const details = el('div', { class: 'gc-details' });
    renderMessage(message, details, item);
    head.append(
      el('time', { class: 'gc-time', text: formatTime(item.time) }),
      el('i', { class: `gc-lvl gc-lvl-${item.level}`, text: item.level }),
    );
    if (item.repeat > 1) head.append(el('em', { class: 'gc-repeat', text: String(item.repeat) }));
    line.append(head, message);
    const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
    copy.setAttribute('aria-label', t(lang, 'copy'));
    bindCopy(copy, () => textById.get(item.id) ?? '', lang);
    const main = el('div', { class: 'gc-row-main' });
    main.append(line, copy);
    row.append(main, details);
    list.append(row);
    rows.set(item.id, { item, row });
    apply(item, row);
    if (follow && !row.hidden) list.scrollTop = list.scrollHeight;
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
      level = select.value as FilterLevel;
      for (const { item, row } of rows.values()) apply(item, row);
      syncEmpty();
    });
    const search = el('input', { class: 'gc-search', type: 'search', placeholder: t(lang, 'search') }) as HTMLInputElement;
    search.setAttribute('aria-label', t(lang, 'search'));
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      for (const { item, row } of rows.values()) apply(item, row);
      syncEmpty();
    });
    count = el('span', { class: 'gc-result-count' });
    filters.append(search, select, count);

    list = el('div', { class: 'gc-list' });
    empty = el('div', { class: 'gc-empty', text: t(lang, 'emptyLog') });
    list.append(empty);
    list.addEventListener('scroll', () => {
      if (!list) return;
      follow = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
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
      follow = true;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!history.length) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') cursor = Math.max(0, cursor - 1);
      else cursor = Math.min(history.length, cursor + 1);
      input.value = cursor >= history.length ? '' : history[cursor] ?? '';
    });

    pane.append(filters, list, toast, form);
    for (const item of store.items) appendRow(item);
    syncEmpty();

    const unsubscribe = store.subscribe((event) => {
      if (event.type === 'add') {
        appendRow(event.item);
        syncEmpty();
      } else if (event.type === 'update') {
        updateRow(event.item);
        syncEmpty();
      } else if (event.type === 'trim') {
        for (const id of event.ids) {
          rows.get(id)?.row.remove();
          rows.delete(id);
          textById.delete(id);
        }
        syncEmpty();
      } else if (event.type === 'clear') {
        rows.clear();
        textById.clear();
        list?.replaceChildren();
        if (empty && list) list.append(empty);
        syncEmpty();
      }
    });
    plugin.on('remove', () => {
      unsubscribe();
      window.clearTimeout(toastTimer);
    });
  });

  plugin.on('show', () => {
    if (list && follow) list.scrollTop = list.scrollHeight;
  });

  plugin.addTool(t(lang, 'clear'), () => console.clear());
  plugin.addTool(t(lang, 'copy'), () => {
    const text = [...rows.values()]
      .filter(({ item, row }) => !row.hidden && passes(item))
      .map(({ item }) => textById.get(item.id) ?? '')
      .filter(Boolean)
      .join('\n');
    void copyText(text).then((ok) => showToast(ok ? t(lang, 'copied') : t(lang, 'copyFailed')));
  });
  plugin.addTool(t(lang, 'console'), () => {
    if (!commandForm) return;
    commandForm.hidden = !commandForm.hidden;
    if (!commandForm.hidden) commandForm.querySelector('input')?.focus();
  });
  plugin.addTool(t(lang, 'latest'), () => {
    follow = true;
    if (list) list.scrollTop = list.scrollHeight;
  });

  return plugin;
}
