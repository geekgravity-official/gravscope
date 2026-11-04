import type { NetStore, NetworkRecord } from '../core/store';
import { GravScopePlugin } from '../core/plugin';
import { formatBytes, formatDuration, formatTime, resourceLabel, softWrapUrl } from '../format/text';
import { t } from '../i18n';
import type { GravScopeLang } from '../types';
import { expectOwnResource } from '../capture/network';
import { canPreviewImage, describePayload, payloadLabel } from '../format/payload';
import { requestCurl } from '../format/curl';
import { bindCopy, el } from '../ui/dom';
import { imageThumb } from '../ui/value-view';

type NetFilter = 'all' | 'request' | 'static' | 'failed';

export function createNetworkPlugin(store: NetStore, lang: GravScopeLang): GravScopePlugin {
  const plugin = new GravScopePlugin('network', t(lang, 'network'));
  let list: HTMLElement | null = null;
  let detail: HTMLElement | null = null;
  let filters: HTMLElement | null = null;
  let empty: HTMLElement | null = null;
  let detailId: number | null = null;
  let detailDirty = false;
  let filter: NetFilter = 'all';
  let query = '';
  let methodFilter = '';
  let statusFilter = '';
  let searchBar: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  const rows = new Map<number, HTMLElement>();
  let anchor: number | null = null, start = 0, timer = 0;
  let eligible: NetworkRecord[] = [];
  let pager: HTMLElement, pageLabel: HTMLElement, older: HTMLButtonElement, newer: HTMLButtonElement;

  const passes = (item: NetworkRecord) => {
    if (methodFilter && item.method.toUpperCase() !== methodFilter) return false;
    if (statusFilter) {
      if (statusFilter === 'pending' ? !item.pending : item.pending || (statusFilter.endsWith('xx') ? Math.floor(item.status / 100) !== Number(statusFilter[0]) : String(item.status) !== statusFilter)) return false;
    }
    if (query && !`${item.url} ${item.method} ${item.status} ${item.error}`.toLowerCase().includes(query)) return false;
    if (filter === 'request') return item.kind === 'xhr' || item.kind === 'fetch' || item.kind === 'beacon';
    if (filter === 'static') return item.kind === 'resource' || item.kind === 'navigation';
    if (filter === 'failed') return isFailed(item);
    return true;
  };

  const syncEmpty = () => {
    if (!empty) return;
    window.clearTimeout(timer); timer = 0;
    eligible = store.items.filter(passes);
    start = anchor === null ? Math.max(0, eligible.length - 100) : eligible.findIndex(item => item.id >= anchor!);
    if (start < 0) start = Math.max(0, eligible.length - 100);
    const selected = store.items.length <= 100 ? store.items : eligible.slice(start, start + 100);
    const ids = new Set(selected.map(item => item.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
    const offset = list?.scrollTop ?? 0;
    for (const item of selected) { if (!rows.has(item.id)) appendRow(item); paint(rows.get(item.id)!, item); list?.append(rows.get(item.id)!); }
    if (list) list.scrollTop = offset;
    empty.hidden = eligible.length > 0;
    empty.textContent = t(lang, query || methodFilter || statusFilter || filter !== 'all' ? 'noMatches' : 'emptyNet');
    if (count) count.textContent = `${eligible.length} / ${store.items.length}`;
    if (pager) {
      pager.hidden = detailId !== null || eligible.length <= 100;
      pageLabel.textContent = `${eligible.length ? start + 1 : 0}–${Math.min(eligible.length, start + 100)} / ${eligible.length}`;
      older.disabled = start === 0; newer.disabled = start + 100 >= eligible.length;
    }
    if (detailId !== null && detailDirty) { const item = store.items.find(item => item.id === detailId); if (item) { const offset = detail?.scrollTop ?? 0; showDetail(item); if (detail) detail.scrollTop = offset; } }

  };

  const showList = () => {
    detailId = null;
    if (detail) detail.hidden = true;
    if (list) list.hidden = false;
    if (filters) filters.hidden = false;
    if (searchBar) searchBar.hidden = false;
    if (pager) pager.hidden = eligible.length <= 100;
  };

  const showDetail = (item: NetworkRecord) => {
    if (!detail || !list) return;
    detailId = item.id; detailDirty = false;
    if (pager) pager.hidden = true;
    list.hidden = true;
    if (filters) filters.hidden = true;
    if (searchBar) searchBar.hidden = true;
    detail.hidden = false;
    detail.replaceChildren();
    const back = el('button', { class: 'gc-back', type: 'button', text: t(lang, 'back') });
    back.addEventListener('click', showList);
    const copy = el('button', { class: 'gc-back', type: 'button', text: t(lang, 'copy') });
    bindCopy(copy, () => detailText(item, lang), lang);
    const actions = el('div', { class: 'gc-detail-bar' });
    actions.append(back, copy);
    const copyUrl = el('button', { class: 'gc-back', type: 'button', text: 'URL' });
    bindCopy(copyUrl, () => item.url, lang);
    actions.append(copyUrl);
    try {
      requestCurl(item);
      const curl = el('button', { class: 'gc-back gc-copy-curl', type: 'button', text: 'cURL' });
      bindCopy(curl, () => requestCurl(item), lang);
      actions.append(curl);
    } catch { /* Non-HTTP records cannot be replayed with cURL. */ }
    const shownUrl = payloadLabel(item.url);
    const title = el('h3', { text: `${methodLabel(item)} ${shownUrl === item.url ? softWrapUrl(item.url) : shownUrl}` });
    const thumb = imageThumb(item.url);
    detail.append(actions);
    detail.append(el('p', { class: 'gc-meta', text: lang === 'zh' ? 'cURL 使用已采集的请求信息，可能含凭证；二进制、流或截断内容不能完整重放。' : 'cURL uses captured request data and may contain credentials; binary, streamed or truncated bodies cannot be fully replayed.' }));
    if (thumb) detail.append(thumb);
    detail.append(title);
    detail.append(block(t(lang, 'general'), generalText(item, lang), lang));
    if (item.extra) detail.append(block(t(lang, 'diagnostics'), item.extra, lang));
    if (hasHeaders(item.requestHeaders)) detail.append(block(t(lang, 'reqHeaders'), headerText(item.requestHeaders), lang));
    if (item.requestBody) detail.append(block(t(lang, 'payload'), pretty(item.requestBody), lang));
    if (hasHeaders(item.responseHeaders)) detail.append(block(t(lang, 'resHeaders'), headerText(item.responseHeaders), lang));
    const response = pretty(item.responseBody);
    if (response || item.truncated) {
      detail.append(block(t(lang, 'response'), item.truncated ? `${response}\n\n… ${t(lang, 'truncated')}` : response || t(lang, 'noBody'), lang));
    }
  };

  const paint = (row: HTMLElement, item: NetworkRecord) => {
    const method = row.querySelector('.gc-method');
    const status = row.querySelector('.gc-status');
    const meta = row.querySelector('.gc-meta');
    if (method) method.textContent = methodLabel(item);
    if (status instanceof HTMLElement) paintStatus(status, item, lang);
    if (meta) meta.textContent = rowMeta(item, lang);
    row.classList.toggle('failed', isFailed(item));
    row.hidden = !passes(item);
  };

  const appendRow = (item: NetworkRecord) => {
    if (!list) return;
    const row = el('div', { class: 'gc-net', role: 'button', tabindex: '0' });
    row.dataset.id = String(item.id);
    const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
    copy.setAttribute('aria-label', t(lang, 'copy'));
    bindCopy(copy, () => item.url, lang);
    const label = methodLabel(item);
    const shown = payloadLabel(item.url);
    let path = shown;
    let host = '';
    try {
      const parsed = new URL(item.url, location.href);
      if (/^https?:$/.test(parsed.protocol)) {
        path = parsed.pathname + parsed.search;
        host = parsed.host;
      }
    } catch { /* Keep the original label for non-URL records. */ }
    const url = el('span', { class: 'gc-url', text: path, title: item.url });
    const main = el('div', { class: 'gc-net-main' });
    main.append(url, el('span', { class: 'gc-chevron', 'aria-hidden': 'true', text: '›' }));
    const sub = el('div', { class: 'gc-net-sub' });
    sub.append(
      el('span', { class: 'gc-method', text: label }),
      el('span', { class: `gc-status ${statusClass(item)}`, text: statusText(item, lang), hidden: statusLabel(item, lang) === '—' ? 'true' : undefined }),
      el('span', { class: 'gc-meta', text: rowMeta(item, lang) }),
      copy,
    );
    const body = el('div', { class: 'gc-net-body' });
    body.append(main, sub);
    if (host) body.append(el('span', { class: 'gc-net-host', text: host }));
    const preview = rowPreview(item.url, label, item.size);
    if (preview) {
      const mark = el('div', { class: 'gc-mark' });
      row.classList.add('has-preview');
      preview.addEventListener('error', () => {
        mark.remove();
        row.classList.remove('has-preview');
      });
      mark.append(preview);
      row.append(mark);
    }
    row.append(body);
    row.classList.toggle('failed', isFailed(item));
    const open = () => showDetail(item);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        open();
      }
    });
    row.hidden = !passes(item);
    list.append(row);
    rows.set(item.id, row);
  };

  plugin.on('render', (pane) => {
    searchBar = el('div', { class: 'gc-filters gc-net-search' });
    const search = el('input', { class: 'gc-search', type: 'search', placeholder: t(lang, 'searchNet'), 'aria-label': t(lang, 'searchNet') }) as HTMLInputElement;
    count = el('span', { class: 'gc-result-count' });
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase(); anchor = null;
      for (const item of store.items) {
        const row = rows.get(item.id);
        if (row) row.hidden = !passes(item);
      }
      syncEmpty();
    });
    const applyFilters = () => {
      anchor = null;
      for (const item of store.items) { const row = rows.get(item.id); if (row) row.hidden = !passes(item); }
      syncEmpty();
    };
    const method = el('select', { class: 'gc-level-select gc-net-method', 'aria-label': lang === 'zh' ? '请求方法' : 'Request method' });
    for (const value of ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']) method.append(el('option', { value, text: value || (lang === 'zh' ? '全部方法' : 'All methods') }));
    method.addEventListener('change', () => { methodFilter = method.value; applyFilters(); });
    const status = el('input', { class: 'gc-search gc-net-status', placeholder: lang === 'zh' ? '状态：500 / 5xx / pending' : 'Status: 500 / 5xx / pending', 'aria-label': lang === 'zh' ? '状态码筛选' : 'Status filter' });
    status.addEventListener('input', () => { statusFilter = status.value.trim().toLowerCase(); applyFilters(); });
    searchBar.append(search, method, status, count);
    filters = el('div', { class: 'gc-filters gc-net-filters' });
    const names: NetFilter[] = ['all', 'request', 'static', 'failed'];
    for (const name of names) {
      const label = name === 'all' ? t(lang, 'all') : name === 'request' ? t(lang, 'requests') : name === 'static' ? t(lang, 'staticRes') : t(lang, 'failed');
      const button = el('button', {
        class: name === 'all' ? 'gc-filter active' : 'gc-filter',
        type: 'button',
        text: label,
      });
      button.dataset.net = name;
      button.addEventListener('click', () => {
        filter = name; anchor = null;
        const nodes = filters?.querySelectorAll('.gc-filter') ?? [];
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index] as HTMLElement;
          node.classList.toggle('active', node.dataset.net === name);
        }
        for (const [id, row] of rows) {
          const item = store.items.find((entry) => entry.id === id);
          if (item) row.hidden = !passes(item);
        }
        syncEmpty();
      });
      filters.append(button);
    }

    list = el('div', { class: 'gc-list' });
    empty = el('div', { class: 'gc-empty', text: t(lang, 'emptyNet') });
    list.append(empty);
    detail = el('div', { class: 'gc-detail' });
    detail.hidden = true;
    older = el('button', { class: 'gc-tool gc-net-older', text: lang === 'zh' ? '更早记录' : 'Earlier' });
    newer = el('button', { class: 'gc-tool gc-net-newer', text: lang === 'zh' ? '更新记录' : 'Newer' });
    pageLabel = el('span'); pager = el('div', { class: 'gc-log-pages' }, [older, pageLabel, newer]);
    older.onclick = () => { anchor = eligible[Math.max(0, start - 100)]?.id ?? null; syncEmpty(); if (list) list.scrollTop = 0; };
    newer.onclick = () => { anchor = eligible[Math.min(Math.max(0, eligible.length - 100), start + 100)]?.id ?? null; syncEmpty(); if (list) list.scrollTop = 0; };
    pane.append(searchBar, filters, pager, list, detail);
    syncEmpty();
    const schedule = () => { if (store.items.length <= 100) syncEmpty(); else if (!timer) timer = window.setTimeout(syncEmpty, 16); };
    const unsubscribe = store.subscribe(event => {
      if (event.type === 'clear') {
        anchor = null; rows.clear(); detail?.replaceChildren(); list?.replaceChildren(empty!); showList(); syncEmpty();
      } else {
        if (event.type === 'update' && event.item.id === detailId) detailDirty = true;
        if (event.type === 'trim' && detailId !== null && event.ids.includes(detailId)) showList();
        schedule();
      }
    });
    plugin.on('remove', () => { unsubscribe(); window.clearTimeout(timer); rows.clear(); });

  });

  plugin.on('show', syncEmpty);
  plugin.addTool(t(lang, 'latest'), () => { anchor = null; showList(); syncEmpty(); if (list) list.scrollTop = list.scrollHeight; });
  plugin.addTool(t(lang, 'clear'), () => store.clear());
  return plugin;
}

function isFailed(item: NetworkRecord): boolean {
  return Boolean(item.error) || item.status >= 400;
}

function methodLabel(item: NetworkRecord): string {
  if (item.kind !== 'resource' && item.kind !== 'navigation') return item.method;
  return resourceLabel(item.url, item.initiator || item.kind);
}

function paintStatus(node: HTMLElement, item: NetworkRecord, lang: GravScopeLang): void {
  const text = statusLabel(item, lang);
  node.textContent = text === '—' ? '' : text;
  node.hidden = text === '—';
  node.className = `gc-status ${statusClass(item)}`;
}

function statusText(item: NetworkRecord, lang: GravScopeLang): string {
  const text = statusLabel(item, lang);
  return text === '—' ? '' : text;
}

function statusLabel(item: NetworkRecord, lang: GravScopeLang): string {
  if (item.pending) return '…';
  if (item.kind === 'beacon') return item.statusText || 'sent';
  if (item.status >= 400 || item.status >= 200) return String(item.status);
  if (item.error) return t(lang, 'failed');
  if (item.cached) return t(lang, 'cached');
  if (item.status) return String(item.status);
  return '—';
}

function statusClass(item: NetworkRecord): string {
  if (item.pending) return 's0';
  if (item.kind === 'beacon') return item.statusText === 'sent' ? 's2' : 's5';
  if (item.status >= 500 || item.error) return 's5';
  if (item.status >= 400) return 's4';
  if (item.status >= 300) return 's3';
  if (item.status >= 200 || item.cached) return 's2';
  return 's0';
}

function rowMeta(item: NetworkRecord, lang: GravScopeLang): string {
  const parts: string[] = [];
  if (item.cached) parts.push(t(lang, 'cached'));
  parts.push(item.pending ? t(lang, 'pending') : formatDuration(item.duration));
  if (item.protocol) parts.push(item.protocol);
  if (item.size) parts.push(formatBytes(item.size));
  const error = errorText(item, lang);
  if (error && error !== `HTTP ${item.status}` && error !== statusLabel(item, lang)) parts.push(error);
  return parts.join(' · ');
}

function rowPreview(url: string, label: string, size: number): HTMLImageElement | null {
  const remoteImage = (label === 'IMG' || label === 'ICON') && /^https?:/i.test(url);
  if (remoteImage && size > 2_000_000) return null;
  if (!canPreviewImage(url) && !remoteImage) return null;
  const img = document.createElement('img');
  img.className = 'gc-thumb';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  expectOwnResource(url);
  img.src = url;
  return img;
}

function errorText(item: NetworkRecord, lang: GravScopeLang): string {
  if (!item.error) return '';
  if (item.error === 'Load failed') return t(lang, 'failed');
  return item.error;
}

function generalText(item: NetworkRecord, lang: GravScopeLang): string {
  const lines = [`URL: ${payloadLabel(item.url)}`, `Kind: ${item.kind}`];
  if (item.initiator) lines.push(`Initiator: ${item.initiator}`);
  lines.push(`Method: ${item.method}`);
  const status = item.pending ? t(lang, 'pending') : item.status ? String(item.status) : item.statusText || errorText(item, lang) || '—';
  lines.push(`Status: ${status}`);
  if (item.statusText && !['failed', 'cached', 'loaded', 'aborted'].includes(item.statusText)) {
    lines.push(`Status text: ${item.statusText}`);
  }
  if (item.cached) lines.push(`Cache: ${t(lang, 'cached')}`);
  if (item.protocol) lines.push(`Protocol: ${item.protocol}`);
  lines.push(`Started: ${formatTime(item.startTime)}`);
  lines.push(`Duration: ${item.pending ? '…' : formatDuration(item.duration)}`);
  if (item.size) lines.push(`Size: ${formatBytes(item.size)}`);
  const error = errorText(item, lang);
  if (error) lines.push(`Error: ${error}`);
  return lines.join('\n');
}

function headerText(headers: Record<string, string>): string {
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
  return lines.join('\n');
}

function hasHeaders(headers: Record<string, string>): boolean {
  return Object.keys(headers).length > 0;
}

function detailText(item: NetworkRecord, lang: GravScopeLang): string {
  return [generalText(item, lang), item.extra, headerText(item.requestHeaders), item.requestBody, headerText(item.responseHeaders), item.responseBody]
    .filter(Boolean)
    .join('\n\n');
}

function block(title: string, text: string, lang: GravScopeLang): HTMLElement {
  const section = el('section');
  const head = el('div', { class: 'gc-block-head' });
  head.append(el('h4', { text: title }));
  const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
  bindCopy(copy, () => text, lang);
  head.append(copy);
  const body = el('pre', { class: 'gc-pre' });
  const brief = describePayload(text);
  if (brief) {
    const thumb = imageThumb(text);
    if (thumb) body.append(thumb);
    body.append(document.createTextNode(brief.label));
  } else {
    body.textContent = text || ' ';
  }
  section.append(head, body);
  return section;
}

function pretty(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/[\r\n]/.test(text)) return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}
