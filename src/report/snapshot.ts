import { readPagePerformance, type PagePerformance } from '../core/page-performance';
import { byteSize, checkReportSize, MAX_REPORT_BYTES, ReportLimitError } from './limits';
import type { ActivityStore } from '../core/activity';
import type { LogStore, NetStore, SystemStore } from '../core/store';
import { VERSION } from '../version';
import { getFrameContext, type FrameContext } from '../core/frame-context';

export interface ReportOptions {
  /** Include records at or after this Unix timestamp in milliseconds. */
  since?: number;
  redactKeys?: string[];
  /** Bodies are excluded by default. */
  includeBodies?: boolean;
}
export interface DiagnosticReport {
  schemaVersion: 1;
  version: string;
  createdAt: string;
  page: string;
  /** Optional for compatibility with reports from earlier releases. */
  frame?: FrameContext;
  performance?: PagePerformance;
  device: { userAgent: string; language: string; viewport: string };
  custom: unknown;
  logs: unknown[];
  network: unknown[];
  policy: string;
  activity?: unknown[];
}
const sensitive = /password|passwd|secret|token|authorization|cookie|api[-_]?key|credential/i;
const LIMIT = 12000;

export function redactText(value: string, keys: readonly string[] = []): string {
  const truncated = value.length > LIMIT;
  value = value.slice(0, LIMIT + 1);
  for (const key of keys.slice(0, 100)) {
    if (!key || key.length > 100) continue;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp('(^|[^\\w-])(' + escaped + '["\']?\\s*[:=]\\s*)(?:"[^"\\n]*"|\'[^\'\\n]*\'|[^\\s,;}]+)', 'gi'), '$1$2[REDACTED]');
  }
  return value.slice(0, LIMIT)
    .replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi, (raw) => {
      try {
        const url = new URL(raw);
        url.username = ''; url.password = '';
        const keys: string[] = [];
        url.searchParams.forEach((_value, key) => keys.push(key));
        for (const key of keys) url.searchParams.set(key, '[REDACTED]');
        if (url.hash) url.hash = '[REDACTED]';
        return url.href;
      } catch { return '[URL omitted]'; }
    })
    .replace(/\bBearer\s+[^\s,"'}]+/gi, 'Bearer [REDACTED]')
    .replace(/(^|[^\w-])([\w-]*(?:password|passwd|secret|token|authorization|cookie|api[-_]?key|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, '$1$2[REDACTED]')
    + (truncated || value.length > LIMIT ? '\n[Truncated]' : '');
}

/** Snapshot own data properties only: never invoke logged object getters. */
export function sanitize(value: unknown, seen = new Set<object>(), depth = 0, budget = { remaining: 2000 }, keys: readonly string[] = []): unknown {
  if (budget.remaining-- <= 0) return '[Node limit]';
  if (depth >= 6) return '[Depth limit]';
  if (typeof value === 'string') {
    if (value.length <= LIMIT && /^[\s]*[\[{]/.test(value)) {
      try { return sanitize(JSON.parse(value), seen, depth + 1, budget, keys); } catch { /* Plain text. */ }
    }
    return redactText(value, keys);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth >= 6) return '[Depth limit]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      const result: Record<string, unknown> = {};
      for (const key of ['name', 'message', 'stack']) {
        const property = Object.getOwnPropertyDescriptor(value, key);
        result[key] = !property ? (key === 'name' ? 'Error' : '') : 'value' in property ? sanitize(property.value, seen, depth + 1, budget, keys) : '[Accessor omitted]';
      }
      return result;
    }
    if (value instanceof Date) return Date.prototype.toISOString.call(value);
    if (value instanceof URL) return redactText(Object.getOwnPropertyDescriptor(URL.prototype, 'href')!.get!.call(value), keys);
    if (value instanceof Map || value instanceof Set) {
      const entries: unknown[] = [];
      const iterator = value instanceof Map ? Map.prototype.entries.call(value) : Set.prototype.values.call(value);
      for (const entry of iterator) {
        if (entries.length >= 100) break;
        entries.push(value instanceof Map && typeof entry[0] === 'string' && isSensitive(entry[0], keys) ? [entry[0], '[REDACTED]'] : entry);
      }
      return sanitize(entries, seen, depth + 1, budget, keys);
    }
    if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM node]';
    const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
    const ownKeys = Array.isArray(value) ? Array.from({ length: Math.min(value.length, 100) }, (_, index) => String(index)) : Object.keys(value).slice(0, 100);
    for (const key of ownKeys) {
      if (budget.remaining <= 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const next = isSensitive(key, keys) ? '[REDACTED]' : descriptor && 'value' in descriptor ? sanitize(descriptor.value, seen, depth + 1, budget, keys) : '[Accessor omitted]';
      Object.defineProperty(output, key, { value: next, enumerable: true, configurable: true, writable: true });
    }
    return output;
  } catch { return '[Unavailable]'; }
  finally { seen.delete(value); }
}

export function captureReport(logs: LogStore, network: NetStore, system: SystemStore, options: ReportOptions = {}, activity?: ActivityStore): DiagnosticReport {
  const since = options.since ?? 0;
  const keys = options.redactKeys ?? [];
  const clean = (value: unknown) => sanitize(value, new Set(), 0, { remaining: 2000 }, keys);
  if (!Number.isFinite(since) || since < 0) throw new Error('Invalid report start time');
  const selectedLogs = logs.items.filter(item => item.time >= since);
  const selectedNetwork = network.items.filter(item => item.startTime >= since);
  if (selectedLogs.length > 10000 || selectedNetwork.length > 10000) throw new ReportLimitError('records');
  let used = 0;
  const retain = (value: unknown): unknown => {
    used += byteSize(JSON.stringify(value));
    if (used > MAX_REPORT_BYTES) throw new ReportLimitError();
    return value;
  };
  const report: DiagnosticReport = {
    schemaVersion: 1, version: VERSION, createdAt: new Date().toISOString(),
    page: redactText(location.href, keys),
    frame: getFrameContext(),
    performance: readPagePerformance(),
    device: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${innerWidth} × ${innerHeight}` },
    custom: system.custom.map(entry => retain({ key: entry.key, value: isSensitive(entry.key, keys) ? '[REDACTED]' : clean(entry.value) })),
    logs: selectedLogs.map(item => retain({ id: item.id, time: item.time, level: item.level, repeat: item.repeat, kind: item.kind, historical: item.historical, errorSource: item.errorSource, boundary: item.boundary, depth: item.depth, groupIds: item.groupIds.slice(), collapsed: item.collapsed, args: clean(item.args), command: item.command ? '[Command omitted]' : undefined })),
    network: selectedNetwork.map(item => retain(clean({ ...item, requestBody: options.includeBodies ? item.requestBody : '[Body omitted]', responseBody: options.includeBodies ? item.responseBody : '[Body omitted]' }))),
    activity: activity?.items.filter(item => item.time >= since).map(item => retain(clean({ ...item, detail: (item.type === 'sse' || item.type === 'websocket') && !options.includeBodies ? '[Body omitted]' : item.detail }))),
    policy: 'Heuristic redaction; URL query values and fragments masked. Storage and command source excluded. Review before sharing. Only retained records are included; object values reflect export time.',
  };
  checkReportSize(JSON.stringify(report, null, 2));
  return report;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function reportHTML(report: DiagnosticReport): string {
  const section = (name: string, data: unknown[]) => `<h2>${name} (${data.length})</h2>${data.map((item, index) => `<details><summary>${index + 1} · ${escape(JSON.stringify(item).slice(0, 160))}</summary><pre>${escape(JSON.stringify(item, null, 2))}</pre></details>`).join('')}`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>GravScope diagnostic report</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#202735;background:#f5f7fa}h1{margin-bottom:4px}summary{cursor:pointer;overflow-wrap:anywhere}details,pre{padding:12px;background:white;border:1px solid #dce1e8;border-radius:8px}details{margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{color:#596577}</style><h1>GravScope · Diagnostic report</h1><p>${escape(report.createdAt)} · v${escape(report.version)}</p><p>${escape(report.policy)}</p><h2>Environment</h2><pre>${escape(JSON.stringify({ page: report.page, frame: report.frame, device: report.device, custom: report.custom }, null, 2))}</pre><h2>Page performance</h2><pre>${escape(JSON.stringify(report.performance ?? { unavailable: true }, null, 2))}</pre>${section('Logs', report.logs)}${section('Network', report.network)}${section('Activity', report.activity ?? [])}</html>`;
}

function isSensitive(key: string, keys: readonly string[]): boolean { return sensitive.test(key) || keys.some(value => value.toLowerCase() === key.toLowerCase()); }
