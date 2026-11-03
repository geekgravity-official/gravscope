import { cutText, parseRawHeaders, previewBody } from './body';
import type { NetStore, NetworkRecord } from '../core/store';

interface OwnLoad {
  url: string;
  after: number;
}

const ownLoads: OwnLoad[] = [];

/** Ignore the next resource entry for a URL the panel itself is about to request, such as a row thumbnail. */
export function expectOwnResource(url: string): void {
  if (/^(data|blob):/i.test(url)) return;
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : 0;
  const cutoff = now - 8000;
  let write = 0;
  for (let index = 0; index < ownLoads.length; index += 1) {
    if (ownLoads[index].after >= cutoff) ownLoads[write++] = ownLoads[index];
  }
  ownLoads.length = write;
  ownLoads.push({ url: absoluteUrl(url), after: now });
}

function consumeOwnResource(url: string, startTime: number): boolean {
  const absolute = absoluteUrl(url);
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : startTime;
  for (let index = 0; index < ownLoads.length; index += 1) {
    const item = ownLoads[index];
    if (now - item.after > 8000) {
      ownLoads.splice(index, 1);
      index -= 1;
      continue;
    }
    if (item.url === absolute && startTime >= item.after - 1) {
      ownLoads.splice(index, 1);
      return true;
    }
  }
  return false;
}

export function installNetworkHook(store: NetStore): () => void {
  const restore: Array<() => void> = [];
  try {
    if (typeof XMLHttpRequest !== 'undefined') restore.push(hookXHR(store));
    if (typeof window.fetch === 'function') restore.push(hookFetch(store));
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      restore.push(hookBeacon(store));
    }
    restore.push(hookResources(store));
  } catch (error) {
    for (const fn of restore.reverse()) { try { fn(); } catch { /* Continue rollback. */ } }
    throw error;
  }
  return () => {
    for (const fn of restore) fn();
  };
}

function hookXHR(store: NetStore): () => void {
  let active = true;
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  const origSetHeader = proto.setRequestHeader;
  const records = new WeakMap<XMLHttpRequest, NetworkRecord>();
  const headers = new WeakMap<XMLHttpRequest, Record<string, string>>();
  const bound = new WeakSet<XMLHttpRequest>();

  proto.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    if (!active) return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>);
    const previous = records.get(this);
    if (previous?.pending) {
      previous.pending = false;
      previous.statusText = 'reopened';
      previous.endTime = Date.now();
      store.update(previous);
    }
    const record = store.start({
      kind: 'xhr',
      method: String(method || 'GET').toUpperCase(),
      url: String(url),
      pending: true,
    });
    records.set(this, record);
    headers.set(this, {});
    return origOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
  } as typeof proto.open;

  proto.setRequestHeader = function setRequestHeader(this: XMLHttpRequest, name: string, value: string) {
    if (!active) return origSetHeader.call(this, name, value);
    const bag = headers.get(this);
    const record = records.get(this);
    if (bag && record) {
      bag[String(name)] = String(value);
      record.requestHeaders = { ...bag };
    }
    return origSetHeader.call(this, name, value);
  };

  proto.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (!active) return origSend.call(this, body);
    const record = records.get(this);
    if (record) {
      const preview = previewBody(body);
      record.requestBody = preview.text;
      record.truncated = preview.truncated;
      if (!bound.has(this)) {
        bound.add(this);
        this.addEventListener('loadend', () => {
          const current = records.get(this);
          if (!active || !current || !current.pending) return;
          current.status = this.status;
          current.statusText = this.statusText;
          current.endTime = Date.now();
          current.duration = Math.max(0, current.endTime - current.startTime);
          current.pending = false;
          try {
            current.responseHeaders = parseRawHeaders(this.getAllResponseHeaders());
          } catch {
            current.responseHeaders = {};
          }
          const cut = cutText(readXHRBody(this));
          current.responseBody = cut.text;
          current.truncated = current.truncated || cut.truncated;
          current.size = cut.size;
          if (this.status === 0) current.error = this.statusText || 'Network error';
          store.update(current);
        });
      }
    }
    return origSend.call(this, body);
  };

  const installed = { open: proto.open, send: proto.send, setRequestHeader: proto.setRequestHeader };
  return () => {
    active = false;
    if (proto.open === installed.open) proto.open = origOpen;
    if (proto.send === installed.send) proto.send = origSend;
    if (proto.setRequestHeader === installed.setRequestHeader) proto.setRequestHeader = origSetHeader;
  };
}

function hookFetch(store: NetStore): () => void {
  const original = window.fetch;
  let active = true;
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!active) return original.call(window, input, init);
    const started = now();
    let record: NetworkRecord | undefined;
    try {
      const preview = previewBody(init?.body);
      record = store.start({
        kind: 'fetch', method: resolveMethod(input, init), url: resolveUrl(input),
        requestHeaders: normalizeHeaders(init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)),
        requestBody: preview.text, truncated: preview.truncated, pending: true,
      });
    } catch { /* Diagnostics must not prevent the host request. */ }
    let response: Response;
    try {
      response = await original.call(window, input, init);
    } catch (error) {
      if (active && record) {
        try {
          record.pending = false;
          record.error = error instanceof Error ? error.message : String(error);
          record.duration = now() - started;
          record.endTime = Date.now();
          record.statusText = 'Error';
          store.update(record);
        } catch { /* Preserve the original rejection. */ }
      }
      throw error;
    }
    if (active && record) {
      try {
        record.status = response.status;
        record.statusText = response.statusText;
        record.responseHeaders = headersToRecord(response.headers);
        record.duration = now() - started;
        record.endTime = Date.now();
        record.pending = false;
        store.update(record);
        const current = record;
        // Streaming endpoints must not be buffered by the debug panel.
        if (!/text\/event-stream/i.test(response.headers.get('content-type') || '')) {
          void readResponsePreview(response.clone()).then((cut) => {
            if (!active) return;
            current.responseBody = cut.text;
            current.truncated = current.truncated || cut.truncated;
            current.size = cut.size;
            store.update(current);
          }).catch(() => undefined);
        }
      } catch { /* Failed cloning or rendering must not reject a successful fetch. */ }
    }
    return response;
  }) as typeof window.fetch;
  window.fetch = wrapped;
  return () => {
    active = false;
    if (window.fetch === wrapped) window.fetch = original;
  };
}

async function readResponsePreview(response: Response): Promise<{ text: string; size: number; truncated: boolean }> {
  const limit = 100_000;
  if (!response.body || typeof response.body.getReader !== 'function' || typeof TextDecoder === 'undefined') {
    // Without bounded stream reading, do not buffer unknown or oversized responses.
    const size = Number(response.headers.get('content-length'));
    if (!size || size > limit) return { text: '[Body preview unavailable]', size: 0, truncated: true };
    return cutText(await response.text());
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (size < limit) {
      const part = await reader.read();
      if (part.done) return { text: text + decoder.decode(), size, truncated: false };
      const chunk = part.value.subarray(0, limit - size);
      size += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
    return { text: text + decoder.decode(), size, truncated: true };
  } finally {
    // Do not await tee cancellation: it can wait for the application's branch.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function hookBeacon(store: NetStore): () => void {
  const original = navigator.sendBeacon;
  let active = true;
  const wrapped = (url: string | URL, data?: BodyInit | null) => {
    if (!active) return original.call(navigator, url, data);
    const preview = previewBody(data);
    let ok = false;
    let thrown: unknown;
    try {
      ok = original.call(navigator, url, data);
    } catch (error) {
      thrown = error;
    }
    store.start({
      kind: 'beacon',
      method: 'POST',
      url: String(url),
      pending: false,
      status: 0,
      statusText: ok ? 'sent' : 'blocked',
      requestBody: preview.text,
      truncated: preview.truncated,
      endTime: Date.now(),
      duration: 0,
      error: ok ? '' : thrown instanceof Error ? thrown.message : 'Beacon was not queued',
    });
    if (thrown) throw thrown;
    return ok;
  };
  navigator.sendBeacon = wrapped;
  return () => {
    active = false;
    if (navigator.sendBeacon === wrapped) navigator.sendBeacon = original;
  };
}

function readXHRBody(xhr: XMLHttpRequest): string {
  try {
    if (xhr.responseType === '' || xhr.responseType === 'text') return xhr.responseText || '';
    if (xhr.responseType === 'json') return JSON.stringify(xhr.response);
    if (xhr.response == null) return '';
    if (typeof xhr.response === 'string') return xhr.response;
    return `[${xhr.responseType || 'response'}]`;
  } catch {
    return '';
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headersToRecord(headers);
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {};
    for (const pair of headers) out[String(pair[0])] = String(pair[1]);
    return out;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key] = String(value);
  return out;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

interface TimedEntry extends PerformanceEntry {
  initiatorType?: string;
  nextHopProtocol?: string;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  redirectStart: number;
  redirectEnd: number;
  redirectCount?: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  serverTiming?: Array<{ name: string; duration: number }>;
  responseStatus?: number;
  deliveryType?: string;
  renderBlockingStatus?: string;
}

const RESOURCE_TAGS = ['img', 'script', 'link', 'video', 'audio', 'source', 'iframe', 'track', 'embed', 'object'];

function hookResources(store: NetStore): () => void {
  const restore: Array<() => void> = [];
  const byElement = new WeakMap<Element, NetworkRecord>();
  const seen = new Set<string>();

  const onResourceEvent = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || isInternal(target)) return;
    const url = resourceUrlOf(target);
    if (!url) return;
    let record = byElement.get(target);
    if (!record) record = recentMatch(store, url);
    if (!record) {
      if (event.type !== 'error') return;
      record = store.start({
        kind: 'resource',
        method: 'GET',
        url: absoluteUrl(url),
        pending: false,
        status: 0,
        statusText: 'failed',
        error: 'Load failed',
        initiator: initiatorOf(target),
        endTime: Date.now(),
        duration: 0,
        extra: elementNote(target),
      });
      byElement.set(target, record);
      return;
    }
    if (!record.pending && event.type !== 'error') return;
    if (event.type === 'error') markFailed(record, target);
    else markLoaded(record);
    byElement.set(target, record);
    store.update(record);
  };

  window.addEventListener('error', onResourceEvent, true);
  window.addEventListener('load', onResourceEvent, true);
  restore.push(() => {
    window.removeEventListener('error', onResourceEvent, true);
    window.removeEventListener('load', onResourceEvent, true);
  });

  restore.push(watchPerformance(store, seen));
  restore.push(watchDom(store, byElement));
  return () => {
    for (const fn of restore) fn();
  };
}

function watchPerformance(store: NetStore, seen: Set<string>): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (let index = 0; index < entries.length; index += 1) applyEntry(store, seen, entries[index]);
    });
  } catch {
    return () => undefined;
  }
  let buffered = false;
  try {
    observer.observe({ type: 'resource', buffered: true });
    observer.observe({ type: 'navigation', buffered: true });
    buffered = true;
  } catch {
    try {
      observer.observe({ entryTypes: ['resource', 'navigation'] });
    } catch {
      try {
        observer.disconnect();
      } catch {
        // Ignore observers this engine cannot disconnect.
      }
      return () => undefined;
    }
  }
  if (!buffered) replayEntries(store, seen);
  return () => observer.disconnect();
}

function replayEntries(store: NetStore, seen: Set<string>): void {
  const resources = performance.getEntriesByType?.('resource') ?? [];
  for (let index = 0; index < resources.length; index += 1) applyEntry(store, seen, resources[index]);
  const navigations = performance.getEntriesByType?.('navigation') ?? [];
  for (let index = 0; index < navigations.length; index += 1) applyEntry(store, seen, navigations[index]);
}

function applyEntry(store: NetStore, seen: Set<string>, entry: PerformanceEntry): void {
  if (entry.entryType !== 'resource' && entry.entryType !== 'navigation') return;
  const timing = entry as TimedEntry;
  const initiator = timing.initiatorType || entry.entryType;
  if (initiator === 'fetch' || initiator === 'xmlhttprequest' || initiator === 'beacon') return;
  if (entry.entryType === 'resource' && consumeOwnResource(timing.name, timing.startTime)) return;
  const key = `${entry.entryType}|${timing.name}|${timing.startTime}`;
  if (seen.has(key)) return;
  seen.add(key);

  const status = typeof timing.responseStatus === 'number' ? timing.responseStatus : 0;
  const cached = isCached(timing);
  const size = positive(timing.decodedBodySize) || positive(timing.encodedBodySize) || positive(timing.transferSize);
  const failed = status >= 400;
  const report = timingReport(timing, status);
  const match = recentMatch(store, timing.name);
  const target = match && needsTiming(match) ? match : null;
  if (!target) {
    store.start({
      kind: entry.entryType === 'navigation' ? 'navigation' : 'resource',
      method: 'GET',
      url: timing.name,
      pending: false,
      status,
      statusText: failed ? String(status) : cached ? 'cached' : '',
      error: failed ? `HTTP ${status}` : '',
      initiator,
      cached,
      protocol: timing.nextHopProtocol || '',
      duration: Number.isFinite(timing.duration) ? timing.duration : 0,
      startTime: wallTime(timing.startTime),
      endTime: wallTime(timing.responseEnd || timing.startTime + (timing.duration || 0)),
      size,
      extra: report,
    });
    return;
  }
  if (entry.entryType === 'navigation') target.kind = 'navigation';
  target.url = timing.name || target.url;
  target.initiator = initiator || target.initiator;
  target.pending = false;
  if (status) target.status = status;
  if (failed) {
    target.error = target.error || `HTTP ${status}`;
    target.statusText = target.statusText || String(status);
  } else if (!target.statusText) {
    target.statusText = cached ? 'cached' : '';
  }
  target.cached = cached || target.cached;
  target.protocol = timing.nextHopProtocol || target.protocol;
  if (Number.isFinite(timing.duration)) target.duration = timing.duration;
  target.startTime = wallTime(timing.startTime);
  target.endTime = wallTime(timing.responseEnd || timing.startTime + (timing.duration || 0));
  if (size) target.size = size;
  if (report) target.extra = target.extra ? `${report}\n${target.extra}` : report;
  store.update(target);
}

function watchDom(store: NetStore, byElement: WeakMap<Element, NetworkRecord>): () => void {
  if (typeof MutationObserver === 'undefined' || !document.documentElement) return () => undefined;
  const consider = (node: Element, fresh: boolean) => {
    if (isInternal(node)) return;
    const url = resourceUrlOf(node);
    if (!url || /^javascript:/i.test(url)) return;
    if (!fresh && !isInFlight(node)) return;
    beginResource(store, byElement, node, url);
  };
  const scan = (node: Node, fresh: boolean) => {
    if (!(node instanceof Element) || isInternal(node)) return;
    consider(node, fresh);
    const found = node.querySelectorAll(RESOURCE_TAGS.join(','));
    for (let index = 0; index < found.length; index += 1) consider(found[index], fresh);
  };
  scan(document.documentElement, false);
  const observer = new MutationObserver((mutations) => {
    for (let index = 0; index < mutations.length; index += 1) {
      const mutation = mutations[index];
      if (mutation.type === 'childList') {
        const added = mutation.addedNodes;
        for (let child = 0; child < added.length; child += 1) scan(added[child], true);
      } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        consider(mutation.target, true);
      }
    }
  });
  try {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'data'],
    });
  } catch {
    return () => undefined;
  }
  return () => observer.disconnect();
}

function beginResource(store: NetStore, byElement: WeakMap<Element, NetworkRecord>, element: Element, url: string): void {
  const abs = absoluteUrl(url);
  const previous = byElement.get(element);
  if (previous && absoluteUrl(previous.url) === abs) return;
  if (previous?.pending) {
    previous.pending = false;
    previous.statusText = previous.statusText || 'aborted';
    previous.endTime = Date.now();
    previous.duration = Math.max(0, previous.endTime - previous.startTime);
    store.update(previous);
  }
  const existing = recentMatch(store, abs);
  if (existing) {
    existing.initiator = existing.initiator || initiatorOf(element);
    const note = elementNote(element);
    if (note && !existing.extra.includes(note)) existing.extra = existing.extra ? `${existing.extra}\n${note}` : note;
    byElement.set(element, existing);
    store.update(existing);
    return;
  }
  const record = store.start({
    kind: 'resource',
    method: 'GET',
    url: abs,
    pending: true,
    initiator: initiatorOf(element),
    extra: elementNote(element),
  });
  byElement.set(element, record);
  if (!isInFlight(element)) {
    if (element instanceof HTMLImageElement && element.naturalWidth === 0) markFailed(record, element);
    else markLoaded(record);
    store.update(record);
  }
}

function markLoaded(record: NetworkRecord): void {
  if (record.status >= 400 || record.error) {
    record.pending = false;
    return;
  }
  record.pending = false;
  record.endTime = record.endTime || Date.now();
  record.duration = record.duration || Math.max(0, record.endTime - record.startTime);
  if (!record.statusText) record.statusText = record.cached ? 'cached' : 'loaded';
}

function markFailed(record: NetworkRecord, target: Element): void {
  record.pending = false;
  record.endTime = record.endTime || Date.now();
  record.duration = record.duration || Math.max(0, record.endTime - record.startTime);
  if (record.status >= 400) record.error = record.error || `HTTP ${record.status}`;
  else if (!record.error) {
    record.error = 'Load failed';
    record.statusText = 'failed';
  }
  const note = elementNote(target);
  if (note && !record.extra.includes(note)) record.extra = record.extra ? `${record.extra}\n${note}` : note;
}

function needsTiming(record: NetworkRecord): boolean {
  if (record.pending) return true;
  return !/^(Redirect|Redirects|DNS|TCP|TLS|TTFB|Download|Duration|Transfer|Encoded|Decoded|Protocol|Delivery|Render blocking|HTTP status|Server-Timing|Note):/m.test(record.extra);
}

function recentMatch(store: NetStore, url: string): NetworkRecord | undefined {
  const target = absoluteUrl(url);
  const nowMs = Date.now();
  for (let index = store.items.length - 1; index >= 0; index -= 1) {
    const item = store.items[index];
    if (item.kind !== 'resource' && item.kind !== 'navigation') continue;
    if (absoluteUrl(item.url) !== target) continue;
    if (item.pending || nowMs - item.startTime < 10000 || (item.endTime > 0 && nowMs - item.endTime < 10000)) return item;
  }
  return undefined;
}

function isCached(entry: TimedEntry): boolean {
  const delivery = entry.deliveryType || '';
  if (delivery === 'cache' || delivery === 'cache-storage') return true;
  const transfer = entry.transferSize ?? -1;
  const encoded = positive(entry.encodedBodySize);
  const decoded = positive(entry.decodedBodySize);
  return transfer === 0 && (encoded > 0 || decoded > 0);
}

function timingReport(entry: TimedEntry, status: number): string {
  const lines: string[] = [];
  const add = (label: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const rounded = Math.round(value);
    if (rounded <= 0) return;
    lines.push(`${label}: ${rounded} ms`);
  };
  add('Redirect', entry.redirectEnd - entry.redirectStart);
  if (entry.redirectCount) lines.push(`Redirects: ${entry.redirectCount}`);
  add('DNS', entry.domainLookupEnd - entry.domainLookupStart);
  add('TCP', entry.connectEnd - entry.connectStart);
  if (entry.secureConnectionStart > 0) add('TLS', entry.connectEnd - entry.secureConnectionStart);
  add('TTFB', entry.responseStart - entry.requestStart);
  add('Download', entry.responseEnd - entry.responseStart);
  add('Duration', entry.duration);
  pushSize(lines, 'Transfer', entry.transferSize);
  pushSize(lines, 'Encoded', entry.encodedBodySize);
  pushSize(lines, 'Decoded', entry.decodedBodySize);
  if (entry.nextHopProtocol) lines.push(`Protocol: ${entry.nextHopProtocol}`);
  if (entry.deliveryType) lines.push(`Delivery: ${entry.deliveryType}`);
  if (entry.renderBlockingStatus) lines.push(`Render blocking: ${entry.renderBlockingStatus}`);
  if (status) lines.push(`HTTP status: ${status}`);
  const serverTiming = entry.serverTiming;
  if (serverTiming) {
    for (let index = 0; index < serverTiming.length; index += 1) {
      const item = serverTiming[index];
      lines.push(`Server-Timing: ${item.name}=${item.duration}`);
    }
  }
  const hidden =
    !status &&
    !positive(entry.transferSize) &&
    !positive(entry.encodedBodySize) &&
    !positive(entry.decodedBodySize);
  if (hidden) lines.push('Note: cross-origin without Timing-Allow-Origin, so timing and size may be 0. This is not by itself a failure.');
  return lines.filter(Boolean).join('\n');
}

function pushSize(lines: string[], label: string, value: number | undefined): void {
  const size = positive(value);
  if (!size) return;
  lines.push(`${label}: ${size} B`);
}

function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function wallTime(mark: number): number {
  if (typeof performance === 'undefined' || !Number.isFinite(mark)) return Date.now();
  return Date.now() - (performance.now() - mark);
}

function absoluteUrl(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function resourceUrlOf(element: Element): string {
  if (element instanceof HTMLLinkElement) {
    const rel = (element.rel || '').toLowerCase();
    if (!/stylesheet|preload|modulepreload|icon|prefetch/.test(rel)) return '';
    return element.href || '';
  }
  if (element instanceof HTMLImageElement) return element.currentSrc || element.src || '';
  if (element instanceof HTMLScriptElement || element instanceof HTMLIFrameElement || element instanceof HTMLMediaElement || element instanceof HTMLSourceElement || element instanceof HTMLTrackElement || element instanceof HTMLEmbedElement) {
    return element.src || '';
  }
  if (element instanceof HTMLObjectElement) return element.data || '';
  return '';
}

function initiatorOf(element: Element): string {
  const tag = element.localName;
  if (tag === 'link') {
    const rel = (element as HTMLLinkElement).rel.toLowerCase();
    if (rel.includes('stylesheet')) return 'css';
    return rel || 'link';
  }
  if (tag === 'script') return 'script';
  if (tag === 'img') return 'img';
  return tag;
}

function isInFlight(element: Element): boolean {
  try {
    if (element instanceof HTMLImageElement) return !element.complete;
    if (element instanceof HTMLMediaElement) return element.readyState === 0;
    if (element instanceof HTMLLinkElement) return !element.sheet;
    if (element instanceof HTMLIFrameElement) return !element.contentDocument;
  } catch {
    return true;
  }
  return false;
}

function isInternal(element: Element): boolean {
  if (element.localName === 'gravscope-root' || Boolean(element.closest('gravscope-root'))) return true;
  if (typeof element.getRootNode !== 'function') return false;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.host.localName === 'gravscope-root';
}

function elementNote(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  let className = '';
  if (element.classList.length) {
    const name = element.classList.item(0);
    if (name) className = `.${name}`;
  }
  return `Element: ${element.localName}${id}${className}`;
}
