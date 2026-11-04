import { LogStore, type LogItem } from './store';
import { sanitize } from '../report/snapshot';
import type { GravScopeLang } from '../types';

export const HISTORY_KEY = 'gravscope:log-history:v1';
const MAX_RECORDS = 200;
// UTF-16 storage budget: at most 256 KiB of string data.
const MAX_CHARS = 128 * 1024;

export class LogHistory {
  enabled = false;
  private timer = 0;
  private listeners = new Set<() => void>();
  private stop: () => void;

  constructor(private store: LogStore, preference: boolean | undefined, lang: GravScopeLang, private redactKeys: () => readonly string[] = () => []) {
    let saved: unknown;
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw && raw.length <= MAX_CHARS) saved = JSON.parse(raw);
    } catch { /* Storage may be disabled or corrupted. */ }
    const data = saved as { version?: number; enabled?: boolean; records?: unknown[] } | undefined;
    this.enabled = preference ?? (data?.version === 1 && data.enabled === true);
    if (this.enabled && data?.version === 1 && Array.isArray(data.records)) {
      const records = data.records.slice(-MAX_RECORDS).filter(validRecord);
      this.store.restore(records);
      if (records.length) this.store.append({ level: 'info', args: [lang === 'zh' ? '新页面会话 · 已恢复历史日志' : 'New page session · previous logs restored'], boundary: true });
    }
    this.stop = store.subscribe(event => {
      if (event.type === 'clear') { this.cancel(); this.remove(); if (this.enabled) this.write([]); }
      else if (this.enabled && !this.timer) this.timer = window.setTimeout(() => { this.timer = 0; this.flush(); }, 150);
    });
    window.addEventListener('pagehide', this.flush);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.enabled) this.flush();
    else this.remove();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.cancel();
    if (value) this.flush();
    else this.remove();
    for (const listener of this.listeners) listener();
  }

  flush = (): void => {
    this.cancel();
    if (!this.enabled) return;
    const records = this.store.items.slice(-MAX_RECORDS).map(item => ({
      id: item.id, time: item.time, level: item.level, kind: item.kind,
      args: sanitize(item.args, new Set(), 0, { remaining: 2000 }, this.redactKeys()), repeat: item.repeat, depth: item.depth,
      groupIds: item.groupIds, collapsed: item.collapsed, errorSource: item.errorSource, boundary: item.boundary,
      // Never persist command source.
    }));
    this.write(records);
  };

  destroy(): void {
    this.flush();
    this.stop();
    window.removeEventListener('pagehide', this.flush);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => { if (document.visibilityState === 'hidden') this.flush(); };
  private cancel(): void { window.clearTimeout(this.timer); this.timer = 0; }
  private remove(): void { try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* Best effort. */ } }
  private write(records: unknown[]): void {
    try {
      const prefix = '{"version":1,"enabled":true,"records":[';
      const encoded: string[] = [];
      let size = prefix.length + 2;
      for (let index = records.length - 1; index >= 0; index--) {
        const record = JSON.stringify(records[index]);
        const extra = record.length + (encoded.length ? 1 : 0);
        if (size + extra > MAX_CHARS) break;
        encoded.unshift(record);
        size += extra;
      }
      const text = prefix + encoded.join(',') + ']}';
      sessionStorage.setItem(HISTORY_KEY, text);
    } catch { this.remove(); /* Quota or disabled storage must not break the host page. */ }
  }
}

function validRecord(value: unknown): value is LogItem {
  if (!value || typeof value !== 'object') return false;
  const r = value as LogItem;
  return Number.isSafeInteger(r.id) && r.id > 0 && Number.isFinite(r.time) && r.time >= 0
    && ['log', 'info', 'warn', 'error', 'debug'].includes(r.level)
    && ['normal', 'group', 'table', 'command'].includes(r.kind)
    && Array.isArray(r.args) && r.args.length <= 200
    && Number.isSafeInteger(r.repeat) && r.repeat > 0
    && Number.isSafeInteger(r.depth) && r.depth >= 0 && r.depth <= 100
    && Array.isArray(r.groupIds) && r.groupIds.length <= 100 && r.groupIds.every(id => Number.isSafeInteger(id) && id > 0)
    && (r.errorSource === undefined || ['runtime', 'promise', 'resource'].includes(r.errorSource))
    && (r.collapsed === undefined || typeof r.collapsed === 'boolean')
    && (r.boundary === undefined || typeof r.boundary === 'boolean');
}
