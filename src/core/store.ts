import { summarize } from '../format/value';
import type { LogLevel } from '../types';

export type LogKind = 'normal' | 'table' | 'command' | 'group';

export interface LogItem {
  id: number;
  time: number;
  level: LogLevel;
  args: unknown[];
  repeat: number;
  depth: number;
  groupIds: number[];
  collapsed?: boolean;
  errorSource?: 'runtime' | 'promise' | 'resource';
  historical?: boolean;
  boundary?: boolean;
  kind: LogKind;
  command?: string;
}

export type LogEvent =
  | { type: 'add'; item: LogItem }
  | { type: 'update'; item: LogItem }
  | { type: 'trim'; ids: number[] }
  | { type: 'clear' };

export class LogStore {
  items: LogItem[] = [];
  max = 1000;
  depth = 0;
  private seq = 0;
  private groups: number[] = [];
  private listeners = new Set<(event: LogEvent) => void>();

  subscribe(listener: (event: LogEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMax(max: number): void {
    this.max = Math.max(1, Math.floor(max));
    this.trim();
  }

  setDepth(depth: number): void {
    this.depth = Math.max(0, depth);
  }

  beginGroup(args: unknown[], collapsed = false): LogItem {
    const item = this.append({ level: 'log', args: args.length ? args : ['console.group'], kind: 'group', collapsed });
    this.groups.push(item.id);
    this.depth = this.groups.length;
    return item;
  }

  endGroup(): void {
    this.groups.pop();
    this.depth = this.groups.length;
  }

  append(input: { level: LogLevel; args: unknown[]; kind?: LogKind; command?: string; collapsed?: boolean; boundary?: boolean; errorSource?: LogItem['errorSource'] }): LogItem {
    const kind = input.kind ?? 'normal';
    const item: LogItem = {
      id: ++this.seq,
      time: Date.now(),
      level: input.level,
      args: input.args,
      repeat: 1,
      depth: this.depth,
      groupIds: this.groups.slice(),
      collapsed: input.collapsed,
      kind,
      boundary: input.boundary,
      errorSource: input.errorSource,
      command: input.command,
    };
    const last = this.items[this.items.length - 1];
    if (
      last && !last.historical && !last.boundary && !item.boundary &&
      kind === 'normal' &&
      last.kind === 'normal' &&
      last.level === item.level && last.errorSource === item.errorSource &&
      last.depth === item.depth &&
      last.groupIds.join(',') === item.groupIds.join(',') &&
      sameArgs(last.args, item.args)
    ) {
      last.repeat += 1;
      this.emit({ type: 'update', item: last });
      return last;
    }
    this.items.push(item);
    this.trim();
    this.emit({ type: 'add', item });
    return item;
  }

  restore(records: LogItem[]): void {
    const ids = new Map<number, number>();
    for (const record of records) {
      const id = ++this.seq;
      const groupIds = record.groupIds.map(old => ids.get(old)).filter((value): value is number => value !== undefined);
      this.items.push({ ...record, id, groupIds, depth: groupIds.length, historical: true, command: undefined });
      ids.set(record.id, id);
    }
    this.trim();
  }

  clearErrors(): void {
    const ids = this.items.filter(item => item.level === 'error').map(item => item.id);
    this.items = this.items.filter(item => item.level !== 'error');
    if (ids.length) this.emit({ type: 'trim', ids });
  }

  resetGroups(): void { this.groups = []; this.depth = 0; }

  clear(): void {
    this.items = [];
    this.groups = [];
    this.depth = 0;
    this.emit({ type: 'clear' });
  }

  private trim(): void {
    const ids: number[] = [];
    while (this.items.length > this.max) {
      const removed = this.items.shift();
      if (removed) ids.push(removed.id);
    }
    if (ids.length) this.emit({ type: 'trim', ids });
  }

  private emit(event: LogEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch { /* A broken view must not interrupt capture or the host page. */ }
    }
  }
}

function sameArgs(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!sameValue(left[index], right[index])) return false;
  }
  return true;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  return summarize(left) === summarize(right);
}

export type NetworkKind = 'xhr' | 'fetch' | 'beacon' | 'resource' | 'navigation';

export interface NetworkRecord {
  id: number;
  kind: NetworkKind;
  method: string;
  url: string;
  status: number;
  statusText: string;
  pending: boolean;
  startTime: number;
  endTime: number;
  duration: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
  truncated: boolean;
  size: number;
  error: string;
  /** script / img / css / font / navigation, when this is not an XHR or fetch. */
  initiator: string;
  cached: boolean;
  protocol: string;
  /** Timing, sizes, and other diagnostic lines. */
  extra: string;
}

export type NetEvent =
  | { type: 'add'; item: NetworkRecord }
  | { type: 'update'; item: NetworkRecord }
  | { type: 'trim'; ids: number[] }
  | { type: 'clear' };

export class NetStore {
  shouldCapture: (url: string) => boolean = () => true;
  items: NetworkRecord[] = [];
  max = 200;
  private seq = 0;
  private listeners = new Set<(event: NetEvent) => void>();

  subscribe(listener: (event: NetEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMax(max: number): void {
    this.max = Math.max(1, Math.floor(max));
    this.trim();
  }

  start(init: Partial<NetworkRecord> & Pick<NetworkRecord, 'kind' | 'method' | 'url'>): NetworkRecord {
    const item: NetworkRecord = {
      id: ++this.seq,
      kind: init.kind,
      method: init.method,
      url: init.url,
      status: init.status ?? 0,
      statusText: init.statusText ?? '',
      pending: init.pending ?? true,
      startTime: init.startTime ?? Date.now(),
      endTime: init.endTime ?? 0,
      duration: init.duration ?? 0,
      requestHeaders: init.requestHeaders ?? {},
      responseHeaders: init.responseHeaders ?? {},
      requestBody: init.requestBody ?? '',
      responseBody: init.responseBody ?? '',
      truncated: init.truncated ?? false,
      size: init.size ?? 0,
      error: init.error ?? '',
      initiator: init.initiator ?? '',
      cached: init.cached ?? false,
      protocol: init.protocol ?? '',
      extra: init.extra ?? '',
    };
    if (this.shouldCapture(item.url)) {
      this.items.push(item);
      this.trim();
      this.emit({ type: 'add', item });
    }
    return item;
  }

  update(item: NetworkRecord): void {
    if (!this.items.includes(item)) return;
    this.emit({ type: 'update', item });
  }

  clear(): void {
    this.items = [];
    this.emit({ type: 'clear' });
  }

  private trim(): void {
    const ids: number[] = [];
    while (this.items.length > this.max) {
      const removed = this.items.shift();
      if (removed) ids.push(removed.id);
    }
    if (ids.length) this.emit({ type: 'trim', ids });
  }

  private emit(event: NetEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event); } catch { /* A broken view must not interrupt capture or the host page. */ }
    }
  }
}

export interface SystemEntry {
  key: string;
  value: string;
}

export class SystemStore {
  custom: SystemEntry[] = [];
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void { this.custom = []; for (const listener of this.listeners) listener(); }

  set(key: string, value: string): void {
    const found = this.custom.find((item) => item.key === key);
    if (found) found.value = value;
    else this.custom.push({ key, value });
    for (const listener of [...this.listeners]) listener();
  }
}
