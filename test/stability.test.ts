import { afterEach, describe, expect, it, vi } from 'vitest';
import { GravScope } from '../src/index';
import { installConsoleHook } from '../src/capture/console';
import { installNetworkHook } from '../src/capture/network';
import { LogStore, NetStore } from '../src/core/store';

const originalFetch = window.fetch;
const originalLog = console.log;
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
const originalHeader = XMLHttpRequest.prototype.setRequestHeader;
let stop: (() => void) | undefined;
afterEach(() => {
  stop?.(); stop = undefined;
  GravScope.current?.destroy();
  window.fetch = originalFetch;
  console.log = originalLog;
  XMLHttpRequest.prototype.open = originalOpen;
  XMLHttpRequest.prototype.send = originalSend;
  XMLHttpRequest.prototype.setRequestHeader = originalHeader;
});

describe('host isolation', () => {
  it('keeps later console wrappers and deactivates capture through retained references', () => {
    console.log = vi.fn();
    const logs = new LogStore();
    stop = installConsoleHook(logs);
    const captured = console.log;
    const later = vi.fn((...args: unknown[]) => captured(...args));
    console.log = later;
    stop();
    expect(console.log).toBe(later);
    console.log('after destroy');
    expect(logs.items).toHaveLength(0);
  });

  it('keeps later fetch and XHR wrappers when removing the panel', async () => {
    window.fetch = vi.fn(async () => new Response('ok'));
    const store = new NetStore();
    stop = installNetworkHook(store);
    const captured = window.fetch;
    const later = vi.fn((...args: Parameters<typeof fetch>) => captured(...args));
    window.fetch = later;
    const open = XMLHttpRequest.prototype.open;
    const laterOpen = function(this: XMLHttpRequest, ...args: Parameters<typeof open>) { return open.apply(this, args); } as typeof open;
    XMLHttpRequest.prototype.open = laterOpen;
    stop();
    expect(window.fetch).toBe(later);
    expect(XMLHttpRequest.prototype.open).toBe(laterOpen);
    await window.fetch('https://example.com');
    expect(store.items).toHaveLength(0);
  });

  it('returns the successful response even when cloning fails', async () => {
    const response = new Response('ok');
    response.clone = () => { throw new Error('clone unavailable'); };
    window.fetch = vi.fn(async () => response);
    stop = installNetworkHook(new NetStore());
    expect(await window.fetch('https://example.com')).toBe(response);
    expect(await response.text()).toBe('ok');
  });

  it('preserves the original rejection even if subscribers throw', async () => {
    const failure = new Error('original failure');
    window.fetch = vi.fn(async () => { throw failure; });
    const store = new NetStore();
    store.subscribe(() => { throw new Error('view failure'); });
    stop = installNetworkHook(store);
    await expect(window.fetch('https://example.com')).rejects.toBe(failure);
  });

  it('does not update pending requests after destruction', async () => {
    let resolve!: (response: Response) => void;
    window.fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    const store = new NetStore();
    const update = vi.fn();
    store.subscribe(update);
    stop = installNetworkHook(store);
    const request = window.fetch('https://example.com');
    stop(); update.mockClear();
    resolve(new Response('ok'));
    expect(await (await request).text()).toBe('ok');
    expect(update).not.toHaveBeenCalled();
  });

  it('bounds large previews without consuming the caller response and skips SSE', async () => {
    window.fetch = vi.fn(async () => new Response('x'.repeat(200000)));
    const store = new NetStore();
    stop = installNetworkHook(store);
    const response = await window.fetch('https://example.com');
    expect((await response.text()).length).toBe(200000);
    await vi.waitFor(() => expect(store.items[0].truncated).toBe(true));
    expect(store.items[0].responseBody.length).toBeLessThanOrEqual(100000);
    stop();
    const stream = new Response('data: hello\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const clone = vi.spyOn(stream, 'clone');
    window.fetch = vi.fn(async () => stream);
    stop = installNetworkHook(new NetStore());
    await window.fetch('https://example.com/events');
    expect(clone).not.toHaveBeenCalled();
  });

  it('rolls back failed initialization and allows another instance', () => {
    const beforeFetch = window.fetch;
    const beforeLog = console.log;
    expect(() => new GravScope({ target: '#missing-gravscope-target' })).toThrow();
    expect(GravScope.current).toBeNull();
    expect(window.fetch).toBe(beforeFetch);
    expect(console.log).toBe(beforeLog);
    const gc = new GravScope({ defaultPlugins: [] });
    expect(GravScope.current).toBe(gc);
  });

  it('restores earlier hooks if installing a later hook fails', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'fetch')!;
    Object.defineProperty(window, 'fetch', { configurable: true, get: () => originalFetch, set: () => { throw new Error('read only fetch'); } });
    try {
      expect(() => new GravScope({ defaultPlugins: [] })).toThrow('read only fetch');
      expect(console.log).toBe(originalLog);
      expect(XMLHttpRequest.prototype.open).toBe(originalOpen);
      expect(GravScope.current).toBeNull();
    } finally { Object.defineProperty(window, 'fetch', descriptor); }
  });

  it('retains bounded history under a burst and isolates failing views', () => {
    const logs = new LogStore();
    logs.setMax(100);
    logs.subscribe(() => { throw new Error('view failure'); });
    const delivered = vi.fn();
    logs.subscribe(delivered);
    for (let index = 0; index < 10000; index += 1) logs.append({ level: 'log', args: [index] });
    expect(logs.items).toHaveLength(100);
    expect(logs.items[0].args).toEqual([9900]);
    expect(delivered).toHaveBeenCalled();
  });
});
