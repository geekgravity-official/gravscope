import { afterEach, describe, expect, it, vi } from 'vitest';
import GravScope from '../src';
import { ActivityStore } from '../src/core/activity';
import { LogStore, NetStore } from '../src/core/store';
import { installNavigation, installLongTasks } from '../src/capture/activity';
import { installRealtime } from '../src/capture/realtime';
import { createDiagnosticsPlugin } from '../src/plugins/diagnostics';
import { createNetworkPlugin } from '../src/plugins/network';
import { createStoragePlugin } from '../src/plugins/storage';
import { HISTORY_KEY } from '../src/core/log-history';

const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).reverse().forEach(stop => stop()); GravScope.current?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });
function render(plugin: ReturnType<typeof createStoragePlugin>) { const pane = document.createElement('div'); plugin.emit('render', pane); stops.push(() => plugin.emit('remove')); return pane; }
function clickText(pane: HTMLElement, text: string) { const button = [...pane.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text); expect(button).toBeTruthy(); button!.click(); }

describe('extended diagnostics', () => {
  it('excludes future URL matches, changes rules at runtime, and preserves host fetch results', async () => {
    const original = window.fetch;
    window.fetch = vi.fn(async () => new Response('ok')) as typeof fetch;
    stops.push(() => { GravScope.current?.destroy(); window.fetch = original; });
    const panel = new GravScope({ defaultPlugins: [], networkIgnore: ['/heartbeat'] });
    expect(await (await window.fetch('/heartbeat')).text()).toBe('ok');
    expect(panel.getReport().network).toHaveLength(0);
    panel.setOption('networkIgnore', ['/analytics']);
    await window.fetch('/heartbeat');
    expect(panel.getReport().network).toHaveLength(1);
    await window.fetch('/analytics');
    expect(panel.getReport().network).toHaveLength(1);
  });

  it('redacts custom keys in reports and persisted logs without mutating live objects', () => {
    const panel = new GravScope({ defaultPlugins: [], preserveLogs: true, redactKeys: ['customerId', 'phone'] });
    const input = { customerId: 'PRIVATE_CUSTOMER', nested: { phone: 'PRIVATE_PHONE' }, visible: 'public' };
    console.log(input, 'phone=PRIVATE_PLAIN', '{"customerId":"PRIVATE_JSON"}');
    let text = JSON.stringify(panel.getReport());
    expect(text).not.toContain('PRIVATE_'); expect(text).toContain('public');
    expect(input.customerId).toBe('PRIVATE_CUSTOMER');
    panel.setSystemInfo('phone', 'PRIVATE_SYSTEM');
    expect(JSON.stringify(panel.getReport())).not.toContain('PRIVATE_SYSTEM');
    panel.setOption('redactKeys', ['customerId', 'phone', 'visible']);
    text = JSON.stringify(panel.getReport()); expect(text).not.toContain('public');
    panel.destroy();
    expect(sessionStorage.getItem(HISTORY_KEY)).not.toContain('PRIVATE_');
  });

  it('records SPA routes once and leaves later history wrappers owned by the page', () => {
    const store = new ActivityStore();
    const original = history.pushState;
    const stop = installNavigation(store); stops.push(stop);
    history.pushState({}, '', '/route-one'); history.replaceState({}, '', '/route-one');
    expect(store.items.filter(item => item.url.endsWith('/route-one'))).toHaveLength(1);
    const captured = history.pushState;
    const later: History['pushState'] = function (this: History, ...args) { captured.apply(this, args); };
    history.pushState = later; stop();
    expect(history.pushState).toBe(later);
    const count = store.items.length; history.pushState({}, '', '/after-stop');
    expect(store.items).toHaveLength(count);
    history.pushState = original;
  });

  it('observes long tasks when supported and disconnects on stop', () => {
    let callback: PerformanceObserverCallback;
    const disconnect = vi.fn();
    class Observer { static supportedEntryTypes = ['longtask']; constructor(cb: PerformanceObserverCallback) { callback = cb; } observe = vi.fn(); disconnect = disconnect; }
    vi.stubGlobal('PerformanceObserver', Observer);
    const store = new ActivityStore(); const stop = installLongTasks(store); stops.push(stop);
    callback!({ getEntries: () => [{ name: 'self', duration: 120, startTime: 0 }] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(store.items[0].duration).toBe(120); stop(); expect(disconnect).toHaveBeenCalled();
    callback!({ getEntries: () => [{ name: 'self', duration: 999, startTime: 0 }] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(store.items).toHaveLength(1);
  });

  it('focuses the timeline on error context and provides ranked performance summaries', () => {
    const logs = new LogStore(), net = new NetStore(), activity = new ActivityStore();
    const error = logs.append({ level: 'error', args: ['failure'] });
    const stale = logs.append({ level: 'log', args: ['outside-window'] }); stale.time = error.time - 60000;
    net.start({ kind: 'fetch', method: 'GET', url: '/slow', pending: false, duration: 2200, size: 9000 });
    activity.add({ type: 'navigation', url: '/page', action: 'navigate', detail: '' });
    const timeline = createDiagnosticsPlugin('timeline', logs, net, activity, 'en'); const pane = render(timeline); timeline.focus(error.time);
    expect(pane.textContent).toContain('failure'); expect(pane.textContent).toContain('/slow'); expect(pane.textContent).toContain('/page');
    expect(pane.textContent).not.toContain('outside-window');
    timeline.getTools().find(tool => tool.name === 'Reset range')!.onClick(); expect(pane.textContent).toContain('outside-window');
    const perf = render(createDiagnosticsPlugin('performance', logs, net, activity, 'en'));
    expect(perf.textContent).toContain('Slow · 2200 ms'); expect(perf.textContent).toContain('Size · 9000 bytes');
  });

  it('opens timeline context from an exception and exports bounded activity', () => {
    const panel = new GravScope({ lang: 'en', defaultPlugins: ['errors'] }); panel.showTab('errors');
    console.error('context error');
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.gc-error-context')!.click();
    expect(root.textContent).toContain('30 seconds before/after');
    expect(panel.getReport().activity?.length).toBeGreaterThan(0);
    const store = new ActivityStore();
    for (let i = 0; i < 1100; i++) store.add({ type: 'sse', url: '/', action: 'receive', detail: String(i) });
    expect(store.items).toHaveLength(1000); expect(store.items[0].detail).toBe('100');
  });

  it('pages 10000 network entries, searches offscreen records, and preserves detail scroll', () => {
    vi.useFakeTimers();
    const store = new NetStore(); store.setMax(10000);
    const plugin = createNetworkPlugin(store, 'en'); const pane = render(plugin);
    for (let i = 0; i < 10000; i++) store.start({ kind: 'fetch', url: `/request-${i}`, method: 'GET' });
    vi.advanceTimersByTime(20);
    expect(pane.querySelectorAll('.gc-net')).toHaveLength(100);
    pane.querySelector<HTMLButtonElement>('.gc-net-older')!.click();
    const ids = [...pane.querySelectorAll<HTMLElement>('.gc-net')].map(row => row.dataset.id);
    store.setMax(10001); store.start({ kind: 'fetch', url: '/new', method: 'GET' }); vi.advanceTimersByTime(20);
    expect([...pane.querySelectorAll<HTMLElement>('.gc-net')].map(row => row.dataset.id)).toEqual(ids);
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!; search.value = 'request-0'; search.dispatchEvent(new Event('input'));
    expect(pane.querySelectorAll('.gc-net')).toHaveLength(1);
    pane.querySelector<HTMLElement>('.gc-net')!.click();
    const detail = pane.querySelector<HTMLElement>('.gc-detail')!; detail.scrollTop = 125;
    store.items[0].status = 200; store.items[0].pending = false; store.update(store.items[0]); vi.advanceTimersByTime(20);
    expect(detail.scrollTop).toBe(125); expect(detail.textContent).toContain('200');
    store.clear(); expect(pane.querySelectorAll('.gc-net')).toHaveLength(0); expect(detail.hidden).toBe(true);
  });

  it('searches storage, validates JSON before explicit save, cancels editing and confirms deletion', () => {
    localStorage.setItem('settings', '{"name":"Alice"}'); localStorage.setItem('other', 'hidden');
    const pane = render(createStoragePlugin('en'));
    pane.querySelector<HTMLButtonElement>('[data-area="local"]')!.click();
    const search = pane.querySelector<HTMLInputElement>('.gc-storage-search')!; search.value = 'Alice'; search.dispatchEvent(new Event('input'));
    expect(pane.querySelectorAll('.gc-item')).toHaveLength(1);
    pane.querySelector<HTMLButtonElement>('.gc-val')!.click();
    const editor = pane.querySelector<HTMLElement>('.gc-storage-editor')!;
    const input = editor.querySelector('textarea')!; input.value = '{bad'; clickText(editor, 'Save');
    expect(localStorage.getItem('settings')).toBe('{"name":"Alice"}'); expect(editor.querySelector('[role="alert"]')!.textContent).not.toBe('');
    input.value = '{"name":"Bob"}'; clickText(editor, 'Format JSON'); clickText(editor, 'Save');
    expect(JSON.parse(localStorage.getItem('settings')!).name).toBe('Bob');
    search.value = ''; search.dispatchEvent(new Event('input'));
    pane.querySelector<HTMLButtonElement>('.gc-val')!.click(); clickText(pane.querySelector('.gc-storage-editor')!, 'Cancel');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false); clickText(pane, 'Delete'); expect(localStorage.length).toBe(2);
    confirm.mockReturnValue(true); clickText(pane, 'Delete'); expect(localStorage.length).toBe(1);
  });
});

class FakeSocket extends EventTarget {
  static OPEN = 1;
  readyState = 0;
  sent: unknown[] = [];
  constructor(public url: string, public protocols?: string | string[]) { super(); if (url === 'bad') throw new Error('bad URL'); }
  send(data: unknown) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(data); }
  close() { this.readyState = 3; this.dispatchEvent(new CloseEvent('close', { code: 1000 })); }
}
class FakeSource extends EventTarget { readyState = 0; constructor(public url: string) { super(); } close() { this.readyState = 2; } }

describe('real-time capture', () => {
  it('preserves native semantics, records bounded WS messages, and stops without closing sockets', () => {
    vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('EventSource', FakeSource);
    const activity = new ActivityStore(); const stop = installRealtime(activity); stops.push(stop);
    expect(WebSocket.OPEN).toBe(1); expect(() => new WebSocket('bad')).toThrow('bad URL');
    class Child extends WebSocket {}
    const ws = new Child('wss://example.com', ['test']); expect(ws).toBeInstanceOf(Child); expect(ws).toBeInstanceOf(FakeSocket);
    expect(() => ws.send('not sent')).toThrow(); expect(activity.items.some(item => item.action === 'send')).toBe(false);
    (ws as unknown as FakeSocket).readyState = 1; ws.dispatchEvent(new Event('open'));
    ws.send('x'.repeat(3000)); ws.dispatchEvent(new MessageEvent('message', { data: 'received' }));
    expect(activity.items.find(item => item.action === 'send')!.detail.length).toBeLessThan(2100);
    expect(activity.items.some(item => item.detail.includes('received'))).toBe(true);
    const Captured = WebSocket; stop(); const count = activity.items.length;
    expect(ws.readyState).toBe(1); ws.send('after stop'); new Captured('wss://later');
    expect(activity.items).toHaveLength(count); expect(WebSocket).toBe(FakeSocket);
  });

  it('observes SSE default and registered named events, reconnection and explicit close', () => {
    vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('EventSource', FakeSource);
    const activity = new ActivityStore(); const stop = installRealtime(activity, url => !url.includes('ignored')); stops.push(stop);
    new EventSource('/ignored'); expect(activity.items).toHaveLength(0);
    const sse = new EventSource('/events'); const listener = vi.fn(); sse.addEventListener('update', listener);
    sse.dispatchEvent(new MessageEvent('update', { data: 'named payload' }));
    sse.dispatchEvent(new MessageEvent('message', { data: 'default payload' })); sse.dispatchEvent(new Event('error'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(activity.items.map(item => item.detail).join()).toContain('named payload');
    expect(activity.items.map(item => item.detail).join()).toContain('Reconnecting');
    sse.close(); const count = activity.items.length;
    expect(activity.items[count - 1].action).toBe('close');
    sse.dispatchEvent(new MessageEvent('update', { data: 'after close' })); expect(activity.items).toHaveLength(count);
  });

  it('rolls back constructor wrapping if a later constructor cannot be patched', () => {
    vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('EventSource', FakeSource);
    const define = Object.defineProperty;
    const spy = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
      if (target === window && key === 'EventSource' && descriptor.value !== FakeSource) throw new Error('locked constructor');
      return define(target, key, descriptor);
    });
    expect(() => installRealtime(new ActivityStore())).toThrow('locked constructor');
    expect(window.WebSocket).toBe(FakeSocket); spy.mockRestore();
  });

  it('masks realtime payloads by default and includes sanitized content only on request', () => {
    vi.stubGlobal('WebSocket', FakeSocket); vi.stubGlobal('EventSource', FakeSource);
    const panel = new GravScope({ defaultPlugins: [], redactKeys: ['phone'] });
    const ws = new WebSocket('wss://example.com?code=PRIVATE_QUERY'); ws.dispatchEvent(new MessageEvent('message', { data: 'phone=PRIVATE_PHONE' }));
    expect(JSON.stringify(panel.getReport())).not.toContain('PRIVATE_PHONE');
    const report = JSON.stringify(panel.getReport({ includeBodies: true })); expect(report).toContain('[REDACTED]'); expect(report).not.toContain('PRIVATE_PHONE'); expect(report).not.toContain('PRIVATE_QUERY');
    panel.setOption('capture', { realtime: false }); const count = panel.getReport().activity!.length;
    ws.dispatchEvent(new MessageEvent('message', { data: 'ignored' })); expect(panel.getReport().activity).toHaveLength(count);
  });
});
