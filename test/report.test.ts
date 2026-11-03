import { afterEach, describe, expect, it } from 'vitest';
import { GravScope } from '../src/index';
import { LogStore, NetStore, SystemStore } from '../src/core/store';
import { captureReport, reportHTML, sanitize } from '../src/report/snapshot';

afterEach(() => GravScope.current?.destroy());

describe('diagnostic reports', () => {
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
