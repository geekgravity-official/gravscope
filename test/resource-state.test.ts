import { afterEach, describe, expect, it, vi } from 'vitest';
import { installNetworkHook } from '../src/capture/network';
import { NetStore } from '../src/core/store';
import { createNetworkPlugin } from '../src/plugins/network';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; document.body.replaceChildren(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const store = new NetStore();
  dispose = installNetworkHook(store, false);
  return store;
}
function image(lazy = false) {
  const img = document.createElement('img');
  Object.defineProperty(img, 'complete', { configurable: true, value: false });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 0 });
  img.loading = lazy ? 'lazy' : 'eager';
  img.src = '/state-test.png';
  document.body.append(img);
  return img;
}
const tick = () => vi.advanceTimersByTimeAsync(1001);
function loaded(img: HTMLImageElement, width = 100) {
  Object.defineProperty(img, 'complete', { configurable: true, value: true });
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
}

describe('resource state reconciliation', () => {
  it('does not label deferred lazy images as actively loading and accepts later load', async () => {
    const store = setup(); const img = image(true); await tick();
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'deferred', endTime: 0 });
    loaded(img); img.dispatchEvent(new Event('load'));
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'loaded', error: '' });
  });
  it('reconciles a cached/completed image even when the load event was missed', async () => {
    const store = setup(); const img = image(); await tick();
    expect(store.items[0].pending).toBe(true);
    loaded(img); await tick();
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'loaded' });
  });
  it('marks an undecodable image failed, including a missed error event', async () => {
    const store = setup(); const img = image(); await tick(); loaded(img, 0); await tick();
    expect(store.items[0]).toMatchObject({ pending: false, error: 'Load failed' });
  });
  it('uses unknown rather than failed for removed images', async () => {
    const store = setup(); const img = image(); await tick(); img.remove(); await tick();
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'unknown', error: '', endTime: 0 });
  });
  it('uses unknown after prolonged observation and still accepts a late successful load', async () => {
    const store = setup(); const img = image(); await tick(); await vi.advanceTimersByTimeAsync(31000);
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'unknown', error: '', endTime: 0 });
    loaded(img); img.dispatchEvent(new Event('load'));
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'loaded' });
  });
  it('settles the old URL and tracks the replacement independently', async () => {
    const store = setup(); const img = image(); await tick(); img.src = '/replacement.png'; await tick();
    expect(store.items[0].pending).toBe(false);
    expect(store.items[1]).toMatchObject({ pending: true, url: expect.stringContaining('replacement.png') });
    img.dispatchEvent(new Event('error'));
    expect(store.items[1].error).toBe('Load failed');
    expect(store.items[0].error).toBe('');
  });
  it('keeps simultaneous elements with the same URL independent', async () => {
    const store = setup(); const first = image(); const second = image(); await tick();
    expect(store.items).toHaveLength(2);
    loaded(first); first.dispatchEvent(new Event('load')); second.dispatchEvent(new Event('error'));
    expect(store.items[0].error).toBe(''); expect(store.items[1].error).toBe('Load failed');
  });
  it('observes srcset selection changes', async () => {
    const store = setup(); const img = image(); await tick();
    Object.defineProperty(img, 'currentSrc', { configurable: true, value: 'http://localhost/selected.png' });
    img.srcset = '/selected.png 2x'; await tick();
    expect(store.items[0].pending).toBe(false);
    expect(store.items[store.items.length - 1]?.url).toContain('selected.png');
  });
  it('does not leave link resources indefinitely loading or invent an HTTP failure', async () => {
    const store = setup(); const link = document.createElement('link');
    link.rel = 'prefetch'; link.href = '/future-resource'; document.body.append(link);
    await tick(); await vi.advanceTimersByTimeAsync(31000);
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'unknown', status: 0, error: '' });
    link.dispatchEvent(new Event('load'));
    expect(store.items[0].statusText).toBe('loaded');
  });
  it('settles a lazy image whose URL is replaced before loading', async () => {
    const store = setup(); const img = image(true); await tick(); img.src = '/lazy-replacement.png'; await tick();
    expect(store.items[0]).toMatchObject({ pending: false, statusText: 'aborted' });
    expect(store.items[1]).toMatchObject({ pending: false, statusText: 'deferred' });
  });
  it('does not recreate cleared records during reconciliation', async () => {
    const store = setup(); const img = image(); await tick(); store.clear(); loaded(img); await tick();
    expect(store.items).toHaveLength(0);
  });
  it('stops reconciliation when capture is disposed', async () => {
    const store = setup(); const img = image(); await tick(); dispose!(); dispose = undefined;
    loaded(img); await vi.advanceTimersByTimeAsync(32000);
    expect(store.items[0].pending).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('shows unconfirmed state without fake duration or preview requests', () => {
    const store = new NetStore();
    const plugin = createNetworkPlugin(store, 'zh'); const pane = document.createElement('div');
    plugin.emit('render', pane);
    store.start({ kind: 'resource', method: 'GET', url: 'https://example.com/photo.png', initiator: 'img', pending: false, statusText: 'unknown' });
    expect(pane.textContent).toContain('状态未知');
    expect(pane.querySelector('.gc-thumb')).toBeNull();
    expect(pane.querySelector('.gc-net')?.textContent).not.toContain('0 ms');
    plugin.emit('remove');
  });
});
