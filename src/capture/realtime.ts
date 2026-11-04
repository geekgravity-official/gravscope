import type { ActivityStore } from '../core/activity';
let connectionSequence = 0;

function preview(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 2000) + (data.length > 2000 ? '\n[Truncated]' : '');
  if (typeof Blob !== 'undefined' && data instanceof Blob) return `[Blob ${data.size} bytes]`;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return `[Binary ${data.byteLength} bytes]`;
  return '[Non-text message]';
}

/** Observe new connections only. Never consume streams or close page-owned connections. */
export function installRealtime(store: ActivityStore, allow: (url: string) => boolean = () => true): () => void {
  let active = true;

  const cleanups = new Set<() => void>();
  const restore: (() => void)[] = [];
  const instrument = (socket: WebSocket | EventSource, type: 'websocket' | 'sse') => {
    if (!active || !allow(socket.url)) return;
    const connection = ++connectionSequence;
    const record = (action: string, detail = '') => { if (active) store.add({ type, connection, url: socket.url, action, detail }); };
    const open = () => record('open');
    const message = (event: Event) => record('receive', `${event.type}: ${preview((event as MessageEvent).data)}`);
    const error = () => { record(socket.readyState === 2 && type === 'sse' ? 'closed' : 'error', type === 'sse' && socket.readyState === 0 ? 'Reconnecting' : 'Connection error'); if (type === 'sse' && socket.readyState === 2) cleanup(); };
    const close = (event: Event) => { const value = event as CloseEvent; record('close', `${value.code} ${value.reason || ''}`); cleanup(); };
    socket.addEventListener('open', open); socket.addEventListener('message', message); socket.addEventListener('error', error);
    if (type === 'websocket') socket.addEventListener('close', close);
    const patches: (() => void)[] = [];
    const cleanup = () => {
      socket.removeEventListener('open', open); socket.removeEventListener('message', message); socket.removeEventListener('error', error); socket.removeEventListener('close', close);
      patches.forEach(fn => fn()); cleanups.delete(cleanup);
    };
    cleanups.add(cleanup);
    try {
    if (type === 'websocket') {
      const ws = socket as WebSocket;
      const original = ws.send;
      const wrapped: WebSocket['send'] = function (this: WebSocket, data) { original.call(this, data); if (this === ws) record('send', preview(data)); };
      ws.send = wrapped;
      patches.push(() => { if (ws.send === wrapped) { delete (ws as unknown as { send?: unknown }).send; if (ws.send !== original) ws.send = original; } });
    } else {
      const source = socket as EventSource;
      const named = new Set<string>();
      const add = source.addEventListener;
      const wrappedAdd = function (this: EventSource, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        (add as EventTarget['addEventListener']).call(this, type, listener, options);
        if (this === source && !['open', 'error', 'message'].includes(type) && !named.has(type) && named.size < 100) { named.add(type); add.call(source, type, message); }
      } as EventSource['addEventListener'];
      source.addEventListener = wrappedAdd;
      patches.push(() => {
        for (const name of named) source.removeEventListener(name, message);
        if (source.addEventListener === wrappedAdd) { delete (source as unknown as { addEventListener?: unknown }).addEventListener; if (source.addEventListener !== add) source.addEventListener = add; }
      });
      const original = source.close;
      const wrapped = function (this: EventSource) { original.call(this); if (this === source) { record('close'); cleanup(); } };
      source.close = wrapped;
      patches.push(() => { if (source.close === wrapped) { delete (source as unknown as { close?: unknown }).close; if (source.close !== original) source.close = original; } });
    }
    } catch (error) { cleanup(); throw error; }
    record('connecting');
  };
  // Keep native prototype, constants and subclass construction semantics.
  try { for (const key of ['WebSocket', 'EventSource'] as const) {
    const Native = window[key];
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    if (typeof Native !== 'function') continue;
    const Wrapped = function (this: unknown, ...args: unknown[]) {
      if (!new.target) throw new TypeError(`${key} requires new`);
      const socket = Reflect.construct(Native, args, new.target === Wrapped ? Native : new.target) as WebSocket | EventSource;
      try { instrument(socket, key === 'WebSocket' ? 'websocket' : 'sse'); } catch { /* Diagnostics must not break a successful native constructor. */ }
      return socket;
    };
    Object.setPrototypeOf(Wrapped, Native); Wrapped.prototype = Native.prototype;
    Object.defineProperty(window, key, { configurable: true, writable: true, value: Wrapped });
    restore.push(() => { if (window[key] === Wrapped as unknown) Object.defineProperty(window, key, { configurable: true, writable: true, value: Native, ...descriptor }); });
  }
  } catch (error) { active = false; cleanups.forEach(fn => fn()); restore.forEach(fn => fn()); throw error; }
  return () => { active = false; cleanups.forEach(fn => fn()); restore.forEach(fn => fn()); };
}
