import type { LogStore, NetStore, SystemStore } from '../core/store';
import { VERSION } from '../version';

export interface ReportOptions {
  /** Include records at or after this Unix timestamp in milliseconds. */
  since?: number;
  /** Bodies are excluded by default. */
  includeBodies?: boolean;
}
export interface DiagnosticReport {
  schemaVersion: 1;
  version: string;
  createdAt: string;
  page: string;
  device: { userAgent: string; language: string; viewport: string };
  custom: unknown;
  logs: unknown[];
  network: unknown[];
  policy: string;
}
const sensitive = /password|passwd|secret|token|authorization|cookie|api[-_]?key|credential/i;
const LIMIT = 12000;

export function redactText(value: string): string {
  return value.slice(0, LIMIT)
    .replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
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
    .replace(/((?:password|passwd|secret|[\w-]*token|authorization|cookie|api[-_]?key|credential)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    + (value.length > LIMIT ? '\n[Truncated]' : '');
}

/** Snapshot own data properties only: never invoke logged object getters. */
export function sanitize(value: unknown, seen = new Set<object>(), depth = 0, budget = { remaining: 2000 }): unknown {
  if (budget.remaining-- <= 0) return '[Node limit]';
  if (depth >= 6) return '[Depth limit]';
  if (typeof value === 'string') {
    if (value.length <= LIMIT && /^[\s]*[\[{]/.test(value)) {
      try { return sanitize(JSON.parse(value), seen, depth + 1, budget); } catch { /* Plain text. */ }
    }
    return redactText(value);
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
        result[key] = !property ? (key === 'name' ? 'Error' : '') : 'value' in property ? sanitize(property.value, seen, depth + 1, budget) : '[Accessor omitted]';
      }
      return result;
    }
    if (value instanceof Date) return Date.prototype.toISOString.call(value);
    if (value instanceof URL) return redactText(Object.getOwnPropertyDescriptor(URL.prototype, 'href')!.get!.call(value));
    if (value instanceof Map || value instanceof Set) {
      const entries: unknown[] = [];
      const iterator = value instanceof Map ? Map.prototype.entries.call(value) : Set.prototype.values.call(value);
      for (const entry of iterator) {
        if (entries.length >= 100) break;
        entries.push(value instanceof Map && typeof entry[0] === 'string' && sensitive.test(entry[0]) ? [entry[0], '[REDACTED]'] : entry);
      }
      return sanitize(entries, seen, depth + 1, budget);
    }
    if (typeof Node !== 'undefined' && value instanceof Node) return '[DOM node]';
    const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
    const keys = Array.isArray(value) ? Array.from({ length: Math.min(value.length, 100) }, (_, index) => String(index)) : Object.keys(value).slice(0, 100);
    for (const key of keys) {
      if (budget.remaining <= 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const next = sensitive.test(key) ? '[REDACTED]' : descriptor && 'value' in descriptor ? sanitize(descriptor.value, seen, depth + 1, budget) : '[Accessor omitted]';
      Object.defineProperty(output, key, { value: next, enumerable: true, configurable: true, writable: true });
    }
    return output;
  } catch { return '[Unavailable]'; }
  finally { seen.delete(value); }
}

export function captureReport(logs: LogStore, network: NetStore, system: SystemStore, options: ReportOptions = {}): DiagnosticReport {
  const since = options.since ?? 0;
  if (!Number.isFinite(since) || since < 0) throw new Error('Invalid report start time');
  return {
    schemaVersion: 1, version: VERSION, createdAt: new Date().toISOString(),
    page: redactText(location.href),
    device: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${innerWidth} × ${innerHeight}` },
    custom: system.custom.map(entry => ({ key: entry.key, value: sensitive.test(entry.key) ? '[REDACTED]' : sanitize(entry.value) })),
    logs: logs.items.filter(item => item.time >= since).map(item => ({ id: item.id, time: item.time, level: item.level, repeat: item.repeat, args: sanitize(item.args), command: item.command ? '[Command omitted]' : undefined })),
    network: network.items.filter(item => item.startTime >= since).map(item => sanitize({ ...item, requestBody: options.includeBodies ? item.requestBody : '[Body omitted]', responseBody: options.includeBodies ? item.responseBody : '[Body omitted]' })),
    policy: 'Heuristic redaction; URL query values and fragments masked. Storage and command source excluded. Review before sharing. Only retained records are included; object values reflect export time.',
  };
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function reportHTML(report: DiagnosticReport): string {
  const section = (name: string, data: unknown[]) => `<h2>${name} (${data.length})</h2>${data.map((item, index) => `<details><summary>${index + 1} · ${escape(JSON.stringify(item).slice(0, 160))}</summary><pre>${escape(JSON.stringify(item, null, 2))}</pre></details>`).join('')}`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>GravScope diagnostic report</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#202735;background:#f5f7fa}h1{margin-bottom:4px}summary{cursor:pointer;overflow-wrap:anywhere}details,pre{padding:12px;background:white;border:1px solid #dce1e8;border-radius:8px}details{margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{color:#596577}</style><h1>GravScope · Diagnostic report</h1><p>${escape(report.createdAt)} · v${escape(report.version)}</p><p>${escape(report.policy)}</p><h2>Environment</h2><pre>${escape(JSON.stringify({ page: report.page, device: report.device, custom: report.custom }, null, 2))}</pre>${section('Logs', report.logs)}${section('Network', report.network)}</html>`;
}
