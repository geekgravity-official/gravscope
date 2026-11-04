import { afterEach, describe, expect, it, vi } from 'vitest';
import * as frames from '../src/core/frame-context';
import { LogHistory, HISTORY_KEY } from '../src/core/log-history';
import { LogStore, NetStore, SystemStore } from '../src/core/store';
import { captureReport, reportHTML } from '../src/report/snapshot';

const histories: LogHistory[] = [];
afterEach(() => { histories.forEach(h => h.destroy()); histories.length = 0; sessionStorage.clear(); vi.restoreAllMocks(); });

function tree() {
  const top: any = { length: 2 };
  const left: any = { top, parent: top, length: 1 };
  const right: any = { top, parent: top, length: 0 };
  const nested: any = { top, parent: left, length: 0 };
  top.top = top; top.parent = top; top[0] = left; top[1] = right; left[0] = nested;
  for (const frame of [top, left, right, nested]) {
    for (const key of ['location', 'document', 'name']) Object.defineProperty(frame, key, { get() { throw Error('must not read foreign page data'); } });
  }
  return { top, left, right, nested };
}
function history(type: frames.FrameContext['type'], path: number[] | null, preference?: boolean) {
  vi.spyOn(frames, 'getFrameContext').mockReturnValue({ type, path });
  const store = new LogStore();
  const saved = new LogHistory(store, preference, 'en');
  histories.push(saved);
  return { store, saved };
}

describe('frame scope', () => {
  it('resolves top, siblings and nested positions without reading foreign page data', () => {
    const { top, left, right, nested } = tree();
    expect(frames.getFrameContext(top)).toEqual({ type: 'top', path: [] });
    expect(frames.getFrameContext(left)).toEqual({ type: 'iframe', path: [0] });
    expect(frames.getFrameContext(right)).toEqual({ type: 'iframe', path: [1] });
    expect(frames.getFrameContext(nested)).toEqual({ type: 'iframe', path: [0, 0] });
  });
  it('fails closed for denied, detached and cyclic frame trees', () => {
    const { left, top } = tree();
    Object.defineProperty(left, 'parent', { get() { throw Error('denied'); } });
    expect(frames.getFrameContext(left)).toEqual({ type: 'iframe', path: null });
    expect(frames.getFrameContext({ top, parent: top } as any).path).toBeNull();
    const cyclic: any = { top, length: 1 }; cyclic.parent = cyclic; cyclic[0] = cyclic;
    expect(frames.getFrameContext(cyclic).path).toBeNull();
  });
  it('keeps parent, sibling and nested histories separate, including clear and disable', () => {
    const parent = history('top', [], true);
    const child = history('iframe', [0], true);
    const sibling = history('iframe', [1], true);
    const nested = history('iframe', [0, 0], true);
    for (const [i, item] of [parent, child, sibling, nested].entries()) {
      item.store.append({ level: 'log', args: ['scope-' + i] }); item.saved.flush();
    }
    const parentRaw = sessionStorage.getItem(HISTORY_KEY);
    const siblingRaw = sessionStorage.getItem(HISTORY_KEY + ':frame:1');
    child.store.clear(); child.saved.setEnabled(false);
    expect(sessionStorage.getItem(HISTORY_KEY + ':frame:0')).toBeNull();
    expect(sessionStorage.getItem(HISTORY_KEY)).toBe(parentRaw);
    expect(sessionStorage.getItem(HISTORY_KEY + ':frame:1')).toBe(siblingRaw);
    expect(sessionStorage.getItem(HISTORY_KEY + ':frame:0.0')).toContain('scope-3');
    const restored = history('iframe', [1]);
    expect(restored.saved.enabled).toBe(true);
    expect(restored.store.items[0].args).toEqual(['scope-2']);
  });
  it('never reads or deletes top history when frame scope cannot be determined', () => {
    const parent = history('top', [], true);
    parent.store.append({ level: 'log', args: ['parent'] }); parent.saved.flush();
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const unknown = history('iframe', null, true);
    expect(unknown.store.items).toHaveLength(0);
    unknown.store.append({ level: 'log', args: ['still captured'] }); unknown.saved.flush();
    unknown.saved.setEnabled(false); unknown.saved.destroy();
    expect(unknown.store.items).toHaveLength(1);
    expect(sessionStorage.getItem(HISTORY_KEY)).toBe(raw);
  });
  it('includes frame source in JSON and HTML while retaining old report compatibility', () => {
    vi.spyOn(frames, 'getFrameContext').mockReturnValue({ type: 'iframe', path: [1, 0] });
    const report = captureReport(new LogStore(), new NetStore(), new SystemStore());
    expect(report.frame).toEqual({ type: 'iframe', path: [1, 0] });
    expect(reportHTML(report)).toContain('iframe');
    delete report.frame;
    expect(() => reportHTML(report)).not.toThrow();
  });
});
