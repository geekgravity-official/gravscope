import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogStore } from '../src/core/store';
import { createLogPlugin } from '../src/plugins/log';
import GravScope from '../src';
import { createErrorsPlugin } from '../src/plugins/errors';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); stop = undefined; GravScope.current?.destroy(); vi.restoreAllMocks(); vi.useRealTimers(); });

function setup() {
  const store = new LogStore(); store.setMax(10000);
  const plugin = createLogPlugin(store, 'en', () => {});
  const pane = document.createElement('div');
  plugin.emit('render', pane);
  stop = () => plugin.emit('remove');
  return { store, plugin, pane };
}

describe('bounded log rendering', () => {
  it('bounds DOM for 10000 records while search and copy cover the whole retained store', async () => {
    vi.useFakeTimers();
    const { store, pane, plugin } = setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    for (let index = 0; index < 10000; index++) store.append({ level: 'log', args: [`row-${index}`] });
    vi.advanceTimersByTime(20);
    expect(store.items).toHaveLength(10000);
    expect(pane.querySelectorAll('.gc-row').length).toBeLessThanOrEqual(300);
    expect(pane.textContent).toContain('row-9999');
    expect(pane.querySelector('[data-id="1"]')).toBeNull();
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!;
    search.value = 'row-17'; search.dispatchEvent(new Event('input'));
    expect(pane.querySelector('[data-id="18"]')).not.toBeNull();
    search.value = ''; search.dispatchEvent(new Event('input'));
    plugin.getTools().find(tool => tool.name === 'Copy')!.onClick();
    expect(write).toHaveBeenCalled();
    const copied = write.mock.calls[0][0];
    expect(copied.split('\n')).toHaveLength(10000);
    expect(copied.split('\n')[0]).toContain('row-0');
    expect(copied).toContain('row-9999');
    await Promise.resolve();
  });

  it('keeps paused pages stable, retains group context and returns to the newest page', () => {
    vi.useFakeTimers();
    const { store, pane, plugin } = setup();
    const group = store.beginGroup(['context']);
    for (let index = 0; index < 600; index++) store.append({ level: 'log', args: [index] });
    store.endGroup(); vi.advanceTimersByTime(20);
    expect(pane.querySelector(`[data-id="${group.id}"] .gc-group-toggle`)).not.toBeNull();
    pane.querySelector<HTMLButtonElement>('.gc-log-older')!.click();
    const before = [...pane.querySelectorAll<HTMLElement>('.gc-row')].map(row => row.dataset.id);
    store.append({ level: 'log', args: ['new arrival'] }); vi.advanceTimersByTime(20);
    expect([...pane.querySelectorAll<HTMLElement>('.gc-row')].map(row => row.dataset.id)).toEqual(before);
    expect(pane.querySelector('.gc-resume-logs')?.textContent).toContain('1 new');
    plugin.getTools().find(tool => tool.name === 'Latest')!.onClick();
    expect(pane.textContent).toContain('new arrival');
    store.clear();
    expect(pane.querySelectorAll('.gc-row')).toHaveLength(0);
    expect(pane.querySelector<HTMLElement>('.gc-log-pages')!.hidden).toBe(true);
  });

  it('updates repeated records, evicts stale page data and cancels queued rendering on removal', () => {
    vi.useFakeTimers();
    const { store, pane, plugin } = setup();
    store.setMax(250);
    for (let index = 0; index < 1000; index++) store.append({ level: 'log', args: [index] });
    vi.advanceTimersByTime(20);
    expect(store.items).toHaveLength(250);
    store.append({ level: 'log', args: [999] }); vi.advanceTimersByTime(20);
    expect(pane.querySelector('[data-id="1000"] .gc-repeat')?.textContent).toBe('2');
    store.setMax(10); vi.advanceTimersByTime(20);
    expect(pane.querySelectorAll('.gc-row')).toHaveLength(10);
    plugin.emit('remove'); stop = undefined;
    store.append({ level: 'log', args: ['after removal'] }); vi.advanceTimersByTime(100);
    expect(pane.textContent).not.toContain('after removal');
  });

  it('restores chronological order when a filtered window shrinks to a small list', () => {
    vi.useFakeTimers();
    const { store, pane } = setup();
    for (let index = 0; index < 250; index++) store.append({ level: 'log', args: [`row-${index}`] });
    vi.advanceTimersByTime(20);
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!;
    search.value = 'row-249'; search.dispatchEvent(new Event('input'));
    store.setMax(200);
    search.value = ''; search.dispatchEvent(new Event('input'));
    expect([...pane.querySelectorAll<HTMLElement>('.gc-row')].map(row => Number(row.dataset.id)))
      .toEqual(store.items.map(item => item.id));
  });

  it('bounds error cards, searches all errors and retains expanded stacks during updates', () => {
    vi.useFakeTimers();
    const store = new LogStore(); store.setMax(10000);
    const plugin = createErrorsPlugin(store, 'en');
    const pane = document.createElement('div'); plugin.emit('render', pane);
    stop = () => plugin.emit('remove');
    for (let index = 0; index < 10000; index++) store.append({ level: 'error', args: [`failure-${index}`] });
    vi.advanceTimersByTime(20);
    expect(pane.querySelectorAll('.gc-error-item')).toHaveLength(100);
    const row = pane.querySelector<HTMLDetailsElement>('.gc-error-item')!; row.open = true;
    store.append({ level: 'error', args: ['failure-9999'] });
    vi.advanceTimersByTime(20);
    expect(pane.querySelector('.gc-error-item')).toBe(row);
    expect(row.open).toBe(true);
    expect(row.querySelector('summary')?.textContent).toContain('×2');
    pane.querySelector<HTMLButtonElement>('.gc-errors-next')!.click();
    expect(pane.textContent).toContain('failure-9899');
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!;
    search.value = 'failure-0'; search.dispatchEvent(new Event('input'));
    expect(pane.querySelectorAll('.gc-error-item')).toHaveLength(1);
    expect(pane.textContent).toContain('failure-0');
    search.value = ''; search.dispatchEvent(new Event('input'));
    store.append({ level: 'error', args: ['queued error'] });
    plugin.getTools()[0].onClick();
    vi.advanceTimersByTime(20);
    expect(pane.querySelectorAll('.gc-error-item')).toHaveLength(0);
    store.append({ level: 'error', args: ['before remove'] });
    plugin.emit('remove'); stop = undefined;
    store.append({ level: 'error', args: ['after remove'] });
    vi.advanceTimersByTime(20);
    expect(pane.textContent).not.toContain('after remove');
  });

  it('does not duplicate rows when trim is emitted before add at a small retention limit', () => {
    const { store, pane } = setup(); store.setMax(20);
    for (let index = 0; index < 1000; index++) {
      store.append({ level: 'log', args: [index] });
      expect(pane.querySelectorAll('.gc-row').length).toBe(Math.min(index + 1, 20));
    }
    const ids = [...pane.querySelectorAll<HTMLElement>('.gc-row')].map(row => Number(row.dataset.id));
    expect(ids).toEqual(store.items.map(item => item.id));
  });

  it('keeps common tools visible and closes More before opening dialogs or hiding the panel', () => {
    const panel = new GravScope({ lang: 'en', defaultPlugins: [] }); panel.show();
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    const toolbar = root.querySelector('.gc-tools')!;
    expect([...toolbar.querySelectorAll(':scope > button')].map(node => node.textContent)).toEqual(['Clear', 'Pause scrolling', 'Latest']);
    const more = toolbar.querySelector<HTMLDetailsElement>('.gc-more-tools')!;
    more.open = true;
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(more.open).toBe(false);
    expect(root.querySelector('.gc-panel')?.classList.contains('open')).toBe(true);
    more.open = true;
    [...more.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Export')!.click();
    expect(more.open).toBe(false);
    expect(root.querySelector('.gc-report')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.gc-report-head button')!.click();
    more.open = true; panel.hide();
    expect(more.open).toBe(false);
  });
});
