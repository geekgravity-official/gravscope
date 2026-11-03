import { afterEach, describe, expect, it } from 'vitest';
import GravScope from '../src/index';
import { LogStore } from '../src/core/store';
import { createLogPlugin } from '../src/plugins/log';

let dispose: (() => void) | undefined;
afterEach(() => { GravScope.current?.destroy(); dispose?.(); dispose = undefined; });
function setup(max = 100) {
  const store = new LogStore(); store.setMax(max);
  const plugin = createLogPlugin(store, 'en', () => {});
  const pane = document.createElement('div'); plugin.emit('render', pane);
  dispose = () => plugin.emit('remove');
  const row = (id: number) => pane.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
  const toggle = (id: number) => row(id).querySelector<HTMLButtonElement>('.gc-group-toggle')!;
  return { store, pane, row, toggle };
}

describe('console groups', () => {
  it('captures all three native group methods with distinct initial states and correct ancestry', () => {
    const gc = new GravScope({ defaultPlugins: [] });
    console.group('outer');
    console.log('first');
    console.groupCollapsed('inner');
    console.warn('inside');
    console.groupEnd();
    console.log('after inner');
    console.groupEnd();
    console.groupEnd();
    console.log('outside');
    const logs = gc.getReport().logs as Array<{ id: number; kind: string; depth: number; groupIds: number[]; collapsed?: boolean }>;
    expect(logs).toHaveLength(6);
    expect(logs.map(item => item.depth)).toEqual([0, 1, 1, 2, 1, 0]);
    expect(logs[0].collapsed).toBe(false);
    expect(logs[2].collapsed).toBe(true);
    expect(logs[3].groupIds).toEqual([logs[0].id, logs[2].id]);
    expect(logs[5].groupIds).toEqual([]);
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    expect(root.querySelector<HTMLElement>(`[data-id="${logs[3].id}"]`)!.hidden).toBe(true);
  });

  it('expands group by default and preserves nested collapsed state across parent toggles', () => {
    const {store, row, toggle} = setup();
    const outer = store.beginGroup(['outer']);
    const inner = store.beginGroup(['inner'], true);
    const child = store.append({level:'log',args:['child']});
    store.endGroup(); store.endGroup();
    const outside = store.append({level:'log',args:['outside']});
    expect(row(inner.id).hidden).toBe(false);
    expect(row(child.id).hidden).toBe(true);
    toggle(outer.id).click();
    expect(row(inner.id).hidden).toBe(true);
    expect(row(outside.id).hidden).toBe(false);
    toggle(outer.id).click();
    expect(row(inner.id).hidden).toBe(false);
    expect(row(child.id).hidden).toBe(true);
    toggle(inner.id).click();
    expect(row(child.id).hidden).toBe(false);
    expect(toggle(inner.id).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps new and repeated children hidden while the group is collapsed', () => {
    const {store,row,toggle} = setup();
    const group = store.beginGroup(['collapsed'],true);
    const child = store.append({level:'log',args:['same']});
    store.append({level:'log',args:['same']});
    expect(row(child.id).hidden).toBe(true);
    expect(child.repeat).toBe(2);
    toggle(group.id).click();
    expect(row(child.id).hidden).toBe(false);
  });

  it('reveals search and level matches with ancestor context without changing saved fold state', () => {
    const {store,pane,row,toggle} = setup();
    const parent = store.beginGroup(['context'],true);
    const match = store.append({level:'error',args:['needle']});
    const other = store.append({level:'log',args:['unrelated']});
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!;
    const level = pane.querySelector<HTMLSelectElement>('.gc-level-select')!;
    search.value = 'needle'; search.dispatchEvent(new Event('input'));
    level.value = 'error'; level.dispatchEvent(new Event('change'));
    expect(row(parent.id).hidden).toBe(false);
    expect(row(match.id).hidden).toBe(false);
    expect(row(other.id).hidden).toBe(true);
    expect(toggle(parent.id).disabled).toBe(true);
    search.value = ''; search.dispatchEvent(new Event('input'));
    level.value = 'all'; level.dispatchEvent(new Event('change'));
    expect(row(match.id).hidden).toBe(true);
    expect(toggle(parent.id).getAttribute('aria-expanded')).toBe('false');
  });

  it('does not strand retained children when a collapsed heading is evicted', () => {
    const {store,pane,row} = setup(2);
    const group = store.beginGroup(['old'],true);
    const a = store.append({level:'log',args:['a']});
    const b = store.append({level:'log',args:['b']});
    expect(pane.querySelector(`[data-id="${group.id}"]`)).toBeNull();
    expect(row(a.id).hidden).toBe(false);
    expect(row(b.id).hidden).toBe(false);
  });

  it('resets grouping on clear and tolerates unmatched groupEnd and empty labels', () => {
    const {store,row} = setup();
    const group = store.beginGroup([],true);
    expect(row(group.id).textContent).toContain('console.group');
    store.clear(); store.endGroup(); store.endGroup();
    const item = store.append({level:'log',args:['new session']});
    expect(item.depth).toBe(0);
    expect(item.groupIds).toEqual([]);
    expect(row(item.id).hidden).toBe(false);
  });

  it('never merges equal values across distinct groups after heading eviction', () => {
    const {store} = setup(2);
    store.beginGroup(['one']);
    const first = store.append({level:'log',args:['same']});
    store.endGroup(); store.beginGroup(['two']);
    const second = store.append({level:'log',args:['same']});
    expect(first.id).not.toBe(second.id);
    expect(second.repeat).toBe(1);
    expect(first.groupIds).not.toEqual(second.groupIds);
  });
});
