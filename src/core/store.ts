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

  append(input: { level: LogLevel; args: unknown[]; kind?: LogKind; command?: string }): LogItem {
    const kind = input.kind ?? 'normal';
    const item: LogItem = {
      id: ++this.seq,
      time: Date.now(),
      level: input.level,
      args: input.args,
      repeat: 1,
      depth: this.depth,
      kind,
      command: input.command,
    };
    const last = this.items[this.items.length - 1];
    if (
      last &&
      kind === 'normal' &&
      last.kind === 'normal' &&
      last.level === item.level &&
      last.depth === item.depth &&
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
    this.items.push(item);
    this.trim();
    this.emit({ type: 'add', item });
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

  set(key: string, value: string): void {
    const found = this.custom.find((item) => item.key === key);
    if (found) found.value = value;
    else this.custom.push({ key, value });
    for (const listener of [...this.listeners]) listener();
  }
}
