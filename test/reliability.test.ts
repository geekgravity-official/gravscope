import { afterEach, describe, expect, it, vi } from 'vitest';
import GravScope from '../src';
import type { ExportFile } from '../src';
import { ExportTask } from '../src/report/export-task';
import { checkReportSize, MAX_REPORT_BYTES, ReportLimitError } from '../src/report/limits';
import { captureReport } from '../src/report/snapshot';
import { showReportDialog } from '../src/report/dialog';
import { LogStore, NetStore, SystemStore } from '../src/core/store';
import { HISTORY_KEY } from '../src/core/log-history';

const stops: (() => void)[] = [];
afterEach(() => { GravScope.current?.destroy(); stops.splice(0).reverse().forEach(stop => stop()); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); });
function button(root: ParentNode, text: string) { const result = [...root.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === text); expect(result).toBeTruthy(); return result!; }
function openExport(panel: GravScope) { panel.showTab('log'); const root = document.querySelector('gravscope-root')!.shadowRoot!; button(root, 'Export').click(); return root; }

describe('export reliability', () => {
  it('keeps an export pending across dialogs, signals a long wait and ignores stale completion after cancellation', async () => {
    vi.useFakeTimers();
    const resolves: (() => void)[] = [];
    const handler = vi.fn((_file: ExportFile) => new Promise<void>(resolve => resolves.push(resolve)));
    const panel = new GravScope({ lang: 'en', defaultPlugins: [], onExport: handler });
    const root = openExport(panel); button(root, 'JSON').click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].requestId).toMatch(/^gravscope-/);
    root.querySelector<HTMLButtonElement>('.gc-report-head button')!.click();
    openExport(panel); expect(button(root, 'JSON').disabled).toBe(true); button(root, 'JSON').click();
    expect(handler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30000);
    expect(root.querySelector('.gc-export-task-status')!.textContent).toContain('over 30 seconds');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    button(root, 'Cancel waiting').click(); expect(button(root, 'JSON').disabled).toBe(true);
    confirm.mockReturnValue(true); button(root, 'Cancel waiting').click();
    expect(button(root, 'JSON').disabled).toBe(false);
    expect(root.querySelector('.gc-export-task-status')!.textContent).toContain('native work may still continue');
    button(root, 'JSON').click(); expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1][0].requestId).not.toBe(handler.mock.calls[0][0].requestId);
    resolves[0](); await Promise.resolve(); expect(button(root, 'JSON').disabled).toBe(true);
    resolves[1](); await Promise.resolve(); expect(button(root, 'JSON').disabled).toBe(false);
    expect(root.querySelector('.gc-export-task-status')!.textContent).toContain('callback completed');
  });

  it('releases task timers/listeners on destruction and does not revive stale tasks', async () => {
    vi.useFakeTimers();
    const task = new ExportTask(); let reject!: (reason: Error) => void;
    const listener = vi.fn(); task.subscribe(listener);
    task.start(() => new Promise<void>((_resolve, fail) => { reject = fail; }), { filename: 'test.json', mimeType: 'application/json', format: 'json', content: '{}' });
    task.destroy(); expect(vi.getTimerCount()).toBe(0);
    const count = listener.mock.calls.length;
    reject(new Error('late failure')); await Promise.resolve(); vi.advanceTimersByTime(30000);
    expect(listener).toHaveBeenCalledTimes(count);
    expect(task.start(() => {}, { filename: '', mimeType: '', format: 'json', content: '' })).toBe(false);
  });

  it('counts UTF-8 bytes and rejects oversized snapshots before a partial export', () => {
    expect(checkReportSize('中')).toBe(3);
    expect(checkReportSize('x'.repeat(MAX_REPORT_BYTES))).toBe(MAX_REPORT_BYTES);
    expect(() => checkReportSize('中'.repeat(Math.ceil(MAX_REPORT_BYTES / 3)))).toThrow(ReportLimitError);
    const logs = new LogStore();
    for (let i = 0; i < 180; i++) logs.append({ level: 'log', args: [i, '中'.repeat(12000)] });
    expect(() => captureReport(logs, new NetStore(), new SystemStore())).toThrow(ReportLimitError);
    expect(logs.items).toHaveLength(180);
  });

  it('checks expanded HTML separately and keeps smaller JSON available', async () => {
    const logs = new LogStore();
    for (let i = 0; i < 115; i++) logs.append({ level: 'log', args: [i, '<'.repeat(12000)] });
    const handler = vi.fn();
    const parent = document.createElement('div'); document.body.append(parent); stops.push(() => parent.remove());
    showReportDialog(parent, 'en', () => captureReport(logs, new NetStore(), new SystemStore()), handler);
    expect(parent.querySelector('.gc-report-size')!.textContent).toContain('KiB');
    button(parent, 'Save offline report').click(); await Promise.resolve();
    expect(handler).not.toHaveBeenCalled(); expect(parent.querySelector('.gc-report-summary')!.textContent).toContain('exceeds 5 MiB');
    button(parent, 'JSON').click(); await Promise.resolve(); expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].format).toBe('json');
    button(parent, 'Close').click();
  });

  it('enforces replay record limits after time filtering', () => {
    const logs = new LogStore(); logs.setMax(10001);
    for (let i = 0; i < 10001; i++) logs.append({ level: 'log', args: [i] }).time = 1;
    expect(() => captureReport(logs, new NetStore(), new SystemStore())).toThrow('record limits');
    expect(captureReport(logs, new NetStore(), new SystemStore(), { since: 2 }).logs).toEqual([]);
  });

  it('shows a useful size failure and disables file export/copy instead of keeping a stale preview', () => {
    const parent = document.createElement('div'); document.body.append(parent); stops.push(() => parent.remove());
    const handler = vi.fn();
    showReportDialog(parent, 'en', () => { throw new ReportLimitError(); }, handler);
    expect(button(parent, 'JSON').disabled).toBe(true); expect(button(parent, 'Copy report').disabled).toBe(true);
    expect(parent.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(parent.querySelector('.gc-report-summary')!.textContent).toContain('Narrow the time range');
    button(parent, 'JSON').click(); expect(handler).not.toHaveBeenCalled(); button(parent, 'Close').click();
  });
});

describe('clear and graceful capture fallback', () => {
  it('clears retained diagnostics and history without deleting business storage or disabling capture', async () => {
    vi.useFakeTimers();
    localStorage.setItem('business', 'keep'); sessionStorage.setItem('business', 'keep');
    const originalFetch = window.fetch; window.fetch = vi.fn(async () => new Response('ok')) as typeof fetch;
    stops.push(() => { window.fetch = originalFetch; });
    const panel = new GravScope({ lang: 'en', preserveLogs: true });
    console.log('old diagnostic marker'); await window.fetch('/old-diagnostic'); panel.setSystemInfo('Build', 'old-build');
    const root = openExport(panel);
    expect(root.querySelector('textarea')!.value).toContain('old diagnostic marker');
    panel.clearAll(); vi.advanceTimersByTime(40);
    const report = panel.getReport();
    expect(report.logs).toEqual([]); expect(report.network).toEqual([]); expect(report.activity).toEqual([]); expect(report.custom).toEqual([]);
    expect(root.querySelector('.gc-report')).toBeNull(); expect(root.textContent).not.toContain('old diagnostic marker');
    expect(JSON.parse(sessionStorage.getItem(HISTORY_KEY)!).records).toEqual([]);
    expect(localStorage.getItem('business')).toBe('keep'); expect(sessionStorage.getItem('business')).toBe('keep');
    console.info('after clear'); expect(JSON.stringify(panel.getReport())).toContain('after clear');
    vi.spyOn(window, 'confirm').mockReturnValue(false); button(root, 'Clear all diagnostics').click();
    expect(panel.getReport().logs).toHaveLength(1);
  });

  it('rolls back partially installed console hooks, exposes failure and retries just that channel', () => {
    const originalLog = console.log;
    const descriptor = Object.getOwnPropertyDescriptor(console, 'table')!;
    Object.defineProperty(console, 'table', { configurable: true, get: () => descriptor.value, set: () => { throw new Error('protected table'); } });
    stops.push(() => Object.defineProperty(console, 'table', descriptor));
    const panel = new GravScope({ lang: 'en', defaultPlugins: [], capture: { network: false } });
    expect(console.log).toBe(originalLog); expect(GravScope.current).toBe(panel);
    expect(JSON.stringify(panel.getReport())).toContain('console capture unavailable');
    panel.show(); const root = document.querySelector('gravscope-root')!.shadowRoot!; button(root, 'Capture settings').click();
    expect(root.querySelector<HTMLInputElement>('[data-capture="console"]')!.checked).toBe(false);
    expect(root.querySelector('[data-capture-status="console"]')!.textContent).toContain('disabled');
    Object.defineProperty(console, 'table', descriptor);
    panel.setOption('capture', { console: true }); expect(console.log).not.toBe(originalLog);
    expect(root.querySelector('[data-capture-status="console"]')!.textContent).toContain('Capturing');
  });

  it('restores early XHR changes when a later XHR member is protected', () => {
    const proto = XMLHttpRequest.prototype;
    const open = proto.open;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'send')!;
    Object.defineProperty(proto, 'send', { configurable: true, get: () => descriptor.value, set: () => { throw new Error('protected send'); } });
    stops.push(() => Object.defineProperty(proto, 'send', descriptor));
    const panel = new GravScope({ defaultPlugins: [] });
    expect(proto.open).toBe(open); expect(JSON.stringify(panel.getReport())).toContain('network capture unavailable');
    Object.defineProperty(proto, 'send', descriptor); panel.setOption('capture', { network: true }); expect(proto.open).not.toBe(open);
  });
});
