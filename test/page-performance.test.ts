import { afterEach, describe, expect, it, vi } from 'vitest';
import GravScope from '../src';
import { readPagePerformance } from '../src/core/page-performance';
import { reportHTML } from '../src/report/snapshot';

const navigation = () => ({ type: 'navigate', startTime: 0, redirectStart: 0, redirectEnd: 0, domainLookupStart: 5, domainLookupEnd: 5, connectStart: 5, connectEnd: 25, secureConnectionStart: 10, requestStart: 30, responseStart: 80, responseEnd: 100, domInteractive: 120, domContentLoadedEventEnd: 140, loadEventEnd: 200, transferSize: 1234, encodedBodySize: 1000, decodedBodySize: 2000 });
function mock(nav: ReturnType<typeof navigation> | null, paints: any[] = []) {
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(type => (type === 'navigation' ? nav ? [nav] : [] : type === 'paint' ? paints : []) as PerformanceEntry[]);
}
afterEach(() => { GravScope.current?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('page performance snapshots', () => {
  it('separates request and navigation TTFB, TLS subset, valid zeros and document sizes', () => {
    mock(navigation(), [{ name: 'first-contentful-paint', startTime: 90 }]);
    const { metrics } = readPagePerformance();
    expect(metrics.requestTTFB.value).toBe(50);
    expect(metrics.navigationTTFB.value).toBe(80);
    expect(metrics.tcp.value).toBe(20);
    expect(metrics.tls.value).toBe(15);
    expect(metrics.dns).toEqual({ value: 0, unit: 'ms', state: 'available' });
    expect(metrics.load.value).toBe(200);
    expect(metrics.fcp.value).toBe(90);
    expect(metrics.decodedBodySize).toEqual({ value: 2000, unit: 'bytes', state: 'available' });
  });
  it('does not present unfinished, missing or invalid timings as a zero success', () => {
    const nav = navigation(); nav.loadEventEnd = 0; nav.domContentLoadedEventEnd = 0; nav.domainLookupEnd = -1; nav.secureConnectionStart = 0;
    mock(nav);
    expect(readPagePerformance().metrics.load.state).toBe('pending');
    expect(readPagePerformance().metrics.domContentLoaded.state).toBe('pending');
    expect(readPagePerformance().metrics.dns.value).toBeNull();
    expect(readPagePerformance().metrics.tls.state).toBe('unavailable');
    nav.loadEventEnd = 300;
    expect(readPagePerformance().metrics.load.value).toBe(300);
  });
  it('handles unavailable/denied APIs and distinguishes supported paint without a sample', () => {
    mock(null);
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(readPagePerformance().metrics.fp.state).toBe('unavailable');
    vi.stubGlobal('PerformanceObserver', { supportedEntryTypes: ['paint'] });
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    expect(readPagePerformance().metrics.fcp.state).toBe('pending');
    vi.mocked(performance.getEntriesByType).mockImplementation(() => { throw Error('denied'); });
    expect(() => readPagePerformance()).not.toThrow();
    expect(readPagePerformance().metrics.load.value).toBeNull();
  });
  it('shares metrics across performance/system panels, JSON and HTML even with long-task capture disabled', () => {
    mock(navigation(), [{ name: 'first-paint', startTime: 60 }]);
    const panel = new GravScope({ lang: 'en', capture: { performance: false } });
    panel.showTab('performance');
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    expect(root.textContent).toContain('Load event end');
    expect(root.textContent).toContain('200 ms');
    const report = panel.getReport({ since: Date.now() });
    expect(report.performance?.metrics.fp.value).toBe(60);
    expect(reportHTML(report)).toContain('Page performance');
    const copy = report.performance!; copy.metrics.load.value = 999;
    expect(panel.getReport().performance?.metrics.load.value).toBe(200);
    panel.clearAll();
    expect(panel.getReport().logs).toHaveLength(0);
    expect(panel.getReport().performance?.metrics.load.value).toBe(200);
    delete report.performance;
    expect(() => reportHTML(report)).not.toThrow();
  });
});
