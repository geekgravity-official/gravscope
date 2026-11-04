import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile, GravScopeOptions } from '../src';
import { GravScope } from '../src/index';
import { LogStore, NetStore, SystemStore } from '../src/core/store';
import { captureReport, reportHTML, sanitize } from '../src/report/snapshot';

afterEach(() => {
  GravScope.current?.destroy();
  vi.restoreAllMocks();
});

describe('diagnostic reports', () => {
  const openReport = (options: GravScopeOptions = {}) => {
    const gc = new GravScope({ lang: 'en', defaultPlugins: [], ...options });
    gc.show();
    console.log({ token: 'PRIVATE_COPY_TOKEN', message: 'copy-report-marker' });
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    [...root.querySelectorAll<HTMLButtonElement>('.gc-tool')].find(button => button.textContent === 'Export')!.click();
    return root;
  };

  it('hands off named, typed and redacted files without a browser download; blocks duplicate exports', async () => {
    let resolve!: () => void;
    const handler = vi.fn((_file: ExportFile) => new Promise<void>(done => { resolve = done; }));
    const download = vi.spyOn(URL, 'createObjectURL');
    const root = openReport({ onExport: handler });
    const json = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'JSON')!;
    const html = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Save offline report')!;
    json.click(); html.click(); json.click();
    expect(handler).toHaveBeenCalledTimes(1); expect(json.disabled).toBe(true); expect(html.disabled).toBe(true);
    const file = handler.mock.calls[0][0];
    expect(file.filename).toMatch(/^gravscope-.*\.json$/); expect(file.mimeType).toBe('application/json;charset=utf-8'); expect(file.format).toBe('json');
    expect(file.content).toBe(root.querySelector<HTMLTextAreaElement>('.gc-report-preview')!.value);
    expect(file.content).not.toContain('PRIVATE_COPY_TOKEN'); expect(download).not.toHaveBeenCalled();
    resolve(); await vi.waitFor(() => expect(json.disabled).toBe(false));
    html.click(); expect(handler.mock.calls[1][0].filename).toMatch(/\.html$/); expect(handler.mock.calls[1][0].mimeType).toBe('text/html;charset=utf-8');
    expect(handler.mock.calls[1][0].content).toContain('<!doctype html>');
    root.querySelector<HTMLButtonElement>('.gc-report-head button')!.click(); resolve(); await Promise.resolve();
    expect(root.querySelector('.gc-report')).toBeNull();
  });

  it('handles sync throws and rejected exports without fallback, then allows retry and copy', async () => {
    const handler = vi.fn<(_: ExportFile) => void | Promise<void>>().mockImplementationOnce(() => { throw new Error('native failure'); }).mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
    const download = vi.spyOn(URL, 'createObjectURL');
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const root = openReport({ onExport: handler });
    const json = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'JSON')!;
    json.click(); await vi.waitFor(() => expect(json.disabled).toBe(false));
    expect(root.querySelector('.gc-report-summary')!.textContent).toContain('Application export failed');
    json.click(); await vi.waitFor(() => expect(json.disabled).toBe(false));
    expect(download).not.toHaveBeenCalled();
    json.click(); await vi.waitFor(() => expect(root.querySelector('.gc-report-summary')!.textContent).toContain('callback completed'));
    GravScope.current!.getReport(); root.querySelector<HTMLButtonElement>('.gc-report-copy')!.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled()); expect(handler).toHaveBeenCalledTimes(3);
  });

  it('keeps default download filenames and MIME types when no callback is configured', () => {
    const blob = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const root = openReport();
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'JSON')!.click();
    expect(filename).toMatch(/^gravscope-.*\.json$/);
    expect((blob.mock.calls[0][0] as Blob).type).toBe('application/json;charset=utf-8');
  });

  it('hides the export entry when disabled while retaining the report API', () => {
    const gc = new GravScope({ lang: 'en', defaultPlugins: [], exportEnabled: false });
    gc.show();
    console.log('report-api-marker');
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    expect([...root.querySelectorAll('.gc-tool')].some(button => button.textContent === 'Export')).toBe(false);
    expect(JSON.stringify(gc.getReport())).toContain('report-api-marker');
  });

  it('copies the current redacted preview and reports success', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const root = openReport();
    const preview = root.querySelector<HTMLTextAreaElement>('.gc-report-preview')!;
    root.querySelector<HTMLButtonElement>('.gc-report-copy')!.click();
    await vi.waitFor(() => expect(root.querySelector('.gc-report-summary')!.textContent).toContain('report copied'));
    expect(write).toHaveBeenCalledWith(preview.value);
    expect(preview.value).toContain('copy-report-marker');
    expect(preview.value).not.toContain('PRIVATE_COPY_TOKEN');
  });

  it('selects the report for manual copying when clipboard access fails', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Clipboard denied'));
    const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
    try {
      const root = openReport();
      const preview = root.querySelector<HTMLTextAreaElement>('.gc-report-preview')!;
      const copy = root.querySelector<HTMLButtonElement>('.gc-report-copy')!;
      copy.click();
      await vi.waitFor(() => expect(root.querySelector('.gc-report-summary')!.textContent).toContain('Automatic copy failed'));
      expect(copy.disabled).toBe(false);
      expect(preview.selectionStart).toBe(0);
      expect(preview.selectionEnd).toBe(preview.value.length);
      preview.setSelectionRange(0, 0);
      root.querySelector<HTMLButtonElement>('.gc-report-select')!.click();
      expect(preview.selectionEnd).toBe(preview.value.length);
    } finally {
      if (previous) Object.defineProperty(document, 'execCommand', previous);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('redacts nested credentials, URL parameters, headers and JSON strings without mutating originals', () => {
    const original = { access_token: 'SECRET_A', nested: '{"password":"SECRET_B"}', url: 'https://user:SECRET_C@example.com/a?code=SECRET_D#SECRET_E' };
    const output = JSON.stringify(sanitize(original));
    for (const secret of ['SECRET_A', 'SECRET_B', 'SECRET_C', 'SECRET_D', 'SECRET_E']) expect(output).not.toContain(secret);
    expect(original.access_token).toBe('SECRET_A');
    expect(output).toContain('REDACTED');
    expect(JSON.stringify(sanitize(new Map([['token', 'SECRET_F']])))).not.toContain('SECRET_F');
  });

  it('handles circular values and skips getters', () => {
    let reads = 0;
    const value: Record<string, unknown> = { get dangerous() { reads += 1; throw new Error('getter'); } };
    value.self = value;
    const output = JSON.stringify(sanitize(value));
    expect(reads).toBe(0);
    expect(output).toContain('[Circular]');
    expect(output).toContain('[Accessor omitted]');
  });

  it('bounds sparse arrays and avoids overridden Error and Map accessors', () => {
    const sparse: unknown[] = [];
    sparse[100000000] = 'far away';
    expect(JSON.stringify(sanitize(sparse)).length).toBeLessThan(5000);
    let reads = 0;
    const error = new Error('safe');
    Object.defineProperty(error, 'stack', { get() { reads++; return 'unsafe'; } });
    const map = new Map([['token', 'secret']]);
    Object.defineProperty(map, 'entries', { get() { reads++; throw new Error('unsafe'); } });
    expect(JSON.stringify(sanitize(error))).toContain('[Accessor omitted]');
    expect(JSON.stringify(sanitize(map))).not.toContain('secret');
    expect(reads).toBe(0);
  });

  it('filters records by time, excludes bodies by default, and exports detached data', () => {
    const logs = new LogStore();
    const network = new NetStore();
    const system = new SystemStore();
    logs.append({ level: 'error', args: ['test'] }).time = 100;
    logs.append({ level: 'info', args: [{ state: 'before' }] }).time = 200;
    network.start({ kind: 'fetch', method: 'POST', url: 'https://example.com', startTime: 200, requestHeaders: { Authorization: 'secret-header' }, requestBody: '{"password":"secret-body"}', responseBody: 'body-value' });
    system.set('apiKey', 'secret-custom');
    const report = captureReport(logs, network, system, { since: 150 });
    expect(report.logs).toHaveLength(1);
    const json = JSON.stringify(report);
    expect(json).not.toContain('secret-header');
    expect(json).not.toContain('secret-custom');
    expect(json).not.toContain('body-value');
    expect(JSON.stringify(captureReport(logs, network, system, { includeBodies: true }))).toContain('body-value');
    expect(JSON.stringify(captureReport(logs, network, system, { includeBodies: true }))).not.toContain('secret-body');
    (logs.items[1].args[0] as { state: string }).state = 'after';
    expect(JSON.stringify(report.logs)).toContain('before');
    expect(() => captureReport(logs, network, system, { since: NaN })).toThrow();
  });

  it('renders offline HTML with escaped untrusted content and no executable scripts', () => {
    const logs = new LogStore();
    logs.append({ level: 'error', args: ['</pre><script>alert(1)</script><img src=x onerror=alert(1)>'] });
    const html = reportHTML(captureReport(logs, new NetStore(), new SystemStore()));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
  });

  it('opens the export preview and closes without hiding the panel', () => {
    const gc = new GravScope({ lang: 'en', defaultPlugins: [] });
    gc.show();
    console.log('report-ui-marker');
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    const exportButton = [...root.querySelectorAll<HTMLButtonElement>('.gc-tool')].find(button => button.textContent === 'Export')!;
    exportButton.click();
    const preview = root.querySelector<HTMLTextAreaElement>('.gc-report-preview')!;
    expect(JSON.parse(preview.value).logs).toHaveLength(1);
    expect(preview.value).toContain('report-ui-marker');
    root.querySelector<HTMLButtonElement>('.gc-report-head button')!.click();
    expect(root.querySelector('.gc-report')).toBeNull();
    expect(root.querySelector('.gc-panel')!.classList.contains('open')).toBe(true);
  });
});
