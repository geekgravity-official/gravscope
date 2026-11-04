import { afterEach, describe, expect, it, vi } from 'vitest';
import { GravScope } from '../src';
import { LogHistory, HISTORY_KEY } from '../src/core/log-history';
import { LogStore } from '../src/core/store';

afterEach(() => { GravScope.current?.destroy(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('session log history', () => {
  it('is off by default, and restores redacted groups and errors with original timestamps after a new instance', () => {
    const off = new GravScope({ defaultPlugins: [] });
    console.log('not preserved');
    off.destroy();
    expect(sessionStorage.getItem(HISTORY_KEY)).toBeNull();
    const first = new GravScope({ preserveLogs: true, defaultPlugins: [] });
    console.groupCollapsed('order');
    console.error(new Error('failure'), { token: 'PRIVATE_TOKEN', progress: 2 });
    console.groupEnd();
    const before = first.getReport().logs as { time: number }[];
    first.destroy();
    expect(sessionStorage.getItem(HISTORY_KEY)).not.toContain('PRIVATE_TOKEN');
    const second = new GravScope({ defaultPlugins: [] });
    const logs = second.getReport().logs as { id: number; groupIds: number[]; historical: boolean; boundary: boolean; time: number }[];
    expect(logs).toHaveLength(3);
    expect(logs[1].groupIds).toEqual([logs[0].id]);
    expect(logs[1].time).toBe(before[1].time);
    expect(logs[1].historical).toBe(true);
    expect(logs[2].boundary).toBe(true);
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    expect(root.querySelector('.gc-history-badge')).not.toBeNull();
    expect(root.querySelector('.gc-session-boundary')).not.toBeNull();
    console.log('fresh');
    const latest = second.getReport().logs.slice(-1)[0] as { groupIds: number[] };
    expect(latest.groupIds).toEqual([]);
  });

  it('clear removes saved records and disable deletes the history; runtime UI stays in sync', () => {
    const panel = new GravScope({ preserveLogs: true, defaultPlugins: [] });
    const checkbox = document.querySelector('gravscope-root')!.shadowRoot!.querySelector<HTMLInputElement>('.gc-preserve-logs')!;
    console.log('clear me');
    window.dispatchEvent(new Event('pagehide'));
    console.clear();
    expect(JSON.parse(sessionStorage.getItem(HISTORY_KEY)!).records).toEqual([]);
    panel.setOption('preserveLogs', false);
    expect(checkbox.checked).toBe(false);
    expect(sessionStorage.getItem(HISTORY_KEY)).toBeNull();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    console.log('saved');
    panel.destroy();
    new GravScope({ preserveLogs: false, defaultPlugins: [] });
    expect(sessionStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('bounds saved count and size, omits command source, snapshots objects and flushes on pagehide', () => {
    vi.useFakeTimers();
    const store = new LogStore();
    const history = new LogHistory(store, true, 'en');
    const obj = { value: 'before' };
    store.append({ level: 'log', args: [obj], kind: 'command', command: 'PRIVATE_SOURCE' });
    vi.advanceTimersByTime(150);
    obj.value = 'after';
    expect(sessionStorage.getItem(HISTORY_KEY)).toContain('before');
    expect(sessionStorage.getItem(HISTORY_KEY)).not.toContain('PRIVATE_SOURCE');
    for (let i = 0; i < 300; i++) store.append({ level: 'log', args: [i, 'x'.repeat(10000)] });
    window.dispatchEvent(new Event('pagehide'));
    const raw = sessionStorage.getItem(HISTORY_KEY)!;
    expect(raw.length).toBeLessThanOrEqual(128 * 1024);
    const records = JSON.parse(raw).records;
    expect(records.length).toBeLessThanOrEqual(200);
    expect(records.at(-1).args[0]).toBe(299);
    history.destroy();
  });

  it('ignores corrupt history and tolerates denied storage without breaking capture', () => {
    sessionStorage.setItem(HISTORY_KEY, '{broken');
    const store = new LogStore();
    const history = new LogHistory(store, undefined, 'en');
    expect(store.items).toHaveLength(0);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    history.setEnabled(true);
    expect(() => { store.append({ level: 'error', args: ['still captured'] }); history.flush(); }).not.toThrow();
    expect(store.items).toHaveLength(1);
    history.destroy();
  });
});
