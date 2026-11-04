export interface PageMetric {
  value: number | null;
  unit: 'ms' | 'bytes';
  state: 'available' | 'pending' | 'unavailable';
}
export interface PagePerformance {
  scope: 'current-document';
  navigationType: string | null;
  metrics: Record<string, PageMetric>;
}
/** Read-only browser snapshots, independent of the long-task capture toggle. */
export function readPagePerformance(): PagePerformance {
  let nav: PerformanceNavigationTiming | undefined;
  let paints: PerformanceEntry[] = [];
  try { nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined; } catch { /* Unsupported. */ }
  try { paints = performance.getEntriesByType('paint'); } catch { /* Unsupported. */ }
  const metrics: Record<string, PageMetric> = {};
  const missing = (state: 'pending' | 'unavailable' = 'unavailable'): PageMetric => ({ value: null, unit: 'ms', state });
  const duration = (start: number | undefined, end: number | undefined, completed: boolean): PageMetric => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start! < 0 || end! < 0) return missing();
    if (!completed) return missing('pending');
    if (end! < start!) return missing();
    return { value: Math.round((end! - start!) * 100) / 100, unit: 'ms', state: 'available' };
  };
  const spans: Array<[string, keyof PerformanceNavigationTiming, keyof PerformanceNavigationTiming, keyof PerformanceNavigationTiming]> = [
    ['redirect', 'redirectStart', 'redirectEnd', 'responseStart'],
    ['dns', 'domainLookupStart', 'domainLookupEnd', 'responseStart'],
    ['tcp', 'connectStart', 'connectEnd', 'responseStart'],
    ['requestTTFB', 'requestStart', 'responseStart', 'responseStart'],
    ['navigationTTFB', 'startTime', 'responseStart', 'responseStart'],
    ['download', 'responseStart', 'responseEnd', 'responseEnd'],
    ['domInteractive', 'startTime', 'domInteractive', 'domInteractive'],
    ['domContentLoaded', 'startTime', 'domContentLoadedEventEnd', 'domContentLoadedEventEnd'],
    ['load', 'startTime', 'loadEventEnd', 'loadEventEnd'],
  ];
  for (const [key, start, end, completed] of spans) metrics[key] = nav ? duration(nav[start] as number, nav[end] as number, (nav[completed] as number) > 0) : missing();
  metrics.tls = nav && nav.secureConnectionStart > 0 ? duration(nav.secureConnectionStart, nav.connectEnd, nav.connectEnd > 0) : missing();
  let paintSupported = false;
  try { paintSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('paint'); } catch { /* Unsupported. */ }
  for (const [key, name] of [['fp', 'first-paint'], ['fcp', 'first-contentful-paint']]) {
    const entry = paints.find(item => item.name === name);
    metrics[key] = entry ? duration(0, entry.startTime, true) : missing(paintSupported && document.readyState !== 'complete' ? 'pending' : 'unavailable');
  }
  for (const key of ['transferSize', 'encodedBodySize', 'decodedBodySize'] as const) {
    const value = nav?.[key];
    metrics[key] = nav && Number.isFinite(value) && value! >= 0 && nav.responseEnd > 0 ? { value: value!, unit: 'bytes', state: 'available' } : { value: null, unit: 'bytes', state: nav && nav.responseEnd === 0 ? 'pending' : 'unavailable' };
  }
  return { scope: 'current-document', navigationType: nav && ['navigate', 'reload', 'back_forward', 'prerender'].includes(nav.type) ? nav.type : null, metrics };
}
export const PAGE_METRIC_LABELS: Record<string, [string, string]> = {
  redirect: ['重定向', 'Redirect'], dns: ['DNS', 'DNS'], tcp: ['连接（含 TLS）', 'Connection (incl. TLS)'], tls: ['TLS', 'TLS'],
  requestTTFB: ['请求到首字节', 'Request to first byte'], navigationTTFB: ['导航到首字节', 'Navigation to first byte'], download: ['文档下载', 'Document download'],
  domInteractive: ['DOM 可交互', 'DOM interactive'], domContentLoaded: ['DOMContentLoaded 完成', 'DOMContentLoaded end'], load: ['Load 完成', 'Load event end'],
  fp: ['首次绘制 FP', 'First paint (FP)'], fcp: ['首次内容绘制 FCP', 'First contentful paint (FCP)'],
  transferSize: ['文档传输大小', 'Document transfer size'], encodedBodySize: ['压缩后文档大小', 'Encoded document body'], decodedBodySize: ['解压后文档大小', 'Decoded document body'],
};
export function pagePerformanceRows(lang: 'zh' | 'en', report = readPagePerformance()): Array<[string, string]> {
  return Object.entries(report.metrics).map(([key, metric]) => [PAGE_METRIC_LABELS[key]?.[lang === 'zh' ? 0 : 1] ?? key,
    metric.state === 'available' ? `${metric.value} ${metric.unit}` : metric.state === 'pending' ? (lang === 'zh' ? '等待数据' : 'Pending') : (lang === 'zh' ? '不可用 / 未提供' : 'Unavailable / not provided')]);
}
