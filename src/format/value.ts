import { describePayload } from './payload';
import { formatBytes } from './text';

const MAX_KEYS = 8;
const MAX_DEPTH = 2;
const MAX_STRING = 180;

export interface Chunk {
  text: string;
  css?: string;
  value?: unknown;
  expandable: boolean;
  ownLine?: boolean;
}

export function summarize(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string') return quoteString(value as string);
  if (type === 'number') {
    const number = value as number;
    if (number === 0 && 1 / number < 0) return '-0';
    return String(number);
  }
  if (type === 'boolean') return String(value);
  if (type === 'bigint') return `${String(value)}n`;
  if (type === 'symbol') return (value as symbol).toString();
  if (type === 'function') {
    const fn = value as { name?: string };
    return `ƒ ${fn.name || 'anonymous'}()`;
  }
  if (type !== 'object') return String(value);
  if (seen.has(value as object)) return '[Circular]';
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (isTraceValue(value)) return 'console.trace';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (typeof Element !== 'undefined' && value instanceof Element) return describeElement(value);
  if (typeof Window !== 'undefined' && value instanceof Window) return 'Window';
  const nodeLabel = labelNode(value);
  if (nodeLabel) return nodeLabel;
  if (typeof Promise !== 'undefined' && value instanceof Promise) return 'Promise';
  if (typeof URL !== 'undefined' && value instanceof URL) return urlPreview(value);
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return `URLSearchParams ${clip(value.toString())}`;
  if (typeof File !== 'undefined' && value instanceof File) return joinType('File', value.name, formatBytes(value.size), value.type);
  if (typeof Blob !== 'undefined' && value instanceof Blob) return joinType('Blob', formatBytes(value.size), value.type);
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
  if (typeof DataView !== 'undefined' && value instanceof DataView) return `DataView(${value.byteLength})`;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return typedPreview(value as unknown as ArrayLike<number> & { length: number });
  if (value instanceof Map || value instanceof Set) {
    seen.add(value);
    try {
      if (value instanceof Map) return collectionPreview('Map', value.size, mapParts(value, seen, depth));
      return collectionPreview('Set', value.size, setParts(value as Set<unknown>, seen, depth));
    } finally {
      seen.delete(value);
    }
  }
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) return `Array(${value.length})`;
    return value.constructor?.name || 'Object';
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const inner = value.slice(0, MAX_KEYS).map((item) => summarize(item, seen, depth + 1));
      const more = value.length > MAX_KEYS ? `, … +${value.length - MAX_KEYS}` : '';
      return `[${inner.join(', ')}${more}]`;
    }
    const name = value.constructor?.name;
    const keys = Object.keys(value);
    const inner = keys.slice(0, MAX_KEYS).map((key) => {
      let nested: unknown;
      try {
        nested = (value as Record<string, unknown>)[key];
      } catch {
        nested = '[Thrown]';
      }
      return `${key}: ${summarize(nested, seen, depth + 1)}`;
    });
    const more = keys.length > MAX_KEYS ? `, … +${keys.length - MAX_KEYS}` : '';
    const body = `{${inner.join(', ')}${more}}`;
    if (name && name !== 'Object') return `${name} ${body}`;
    return body;
  } finally {
    seen.delete(value);
  }
}

export function isPlainData(value: unknown): value is object {
  if (value === null || typeof value !== 'object') return false;
  if (isTraceValue(value)) return false;
  if (value instanceof Error || value instanceof Date || value instanceof RegExp) return false;
  if (value instanceof Map || value instanceof Set) return false;
  if (typeof Element !== 'undefined' && value instanceof Element) return false;
  if (typeof Window !== 'undefined' && value instanceof Window) return false;
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return false;
  if (typeof URL !== 'undefined' && (value instanceof URL || value instanceof URLSearchParams)) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (typeof Promise !== 'undefined' && value instanceof Promise) return false;
  if (typeof Document !== 'undefined' && (value instanceof Document || value instanceof DocumentFragment)) return false;
  if (typeof Text !== 'undefined' && (value instanceof Text || value instanceof Comment)) return false;
  return true;
}

export interface StructRow {
  name: string;
  sep: string;
  value?: unknown;
}

export interface StructView {
  title: string;
  rows: StructRow[];
}

export function isStructured(value: unknown): value is object {
  if (isTraceValue(value)) return true;
  if (isPlainData(value)) return true;
  if (value instanceof Map || value instanceof Set) return true;
  if (typeof URL !== 'undefined' && (value instanceof URL || value instanceof URLSearchParams)) return true;
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (typeof Headers !== 'undefined' && value instanceof Headers) return true;
  return false;
}

export function collapseLabel(value: object): string {
  if (Array.isArray(value)) return '[…]';
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
  if (typeof DataView !== 'undefined' && value instanceof DataView) return `DataView(${value.byteLength})`;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    const named = value as { constructor?: { name?: string }; length?: number };
    return `${named.constructor?.name || 'TypedArray'}(${named.length ?? 0})`;
  }
  if (typeof URL !== 'undefined' && value instanceof URL) return 'URL';
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return 'URLSearchParams';
  if (typeof Headers !== 'undefined' && value instanceof Headers) return 'Headers';
  if (typeof File !== 'undefined' && value instanceof File) return 'File';
  if (typeof Blob !== 'undefined' && value instanceof Blob) return 'Blob';
  if (isTraceValue(value)) return 'console.trace';
  return '{…}';
}

export function readStruct(value: object): StructView {
  if (isTraceValue(value)) return readTrace(value);
  if (value instanceof Map) return readMap(value);
  if (value instanceof Set) return readSet(value);
  if (typeof URL !== 'undefined' && value instanceof URL) return readUrl(value);
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return readPairs('URLSearchParams', value);
  if (typeof Headers !== 'undefined' && value instanceof Headers) return readPairs('Headers', value);
  if (typeof File !== 'undefined' && value instanceof File) return readFile(value);
  if (typeof Blob !== 'undefined' && value instanceof Blob) return readBlob(value);
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return { title: 'ArrayBuffer', rows: [{ name: 'byteLength', sep: ':', value: value.byteLength }] };
  }
  if (typeof DataView !== 'undefined' && value instanceof DataView) return readDataView(value);
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return readTyped(value);
  return readObject(value);
}

export function formatCopy(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (isTraceValue(value)) return ['console.trace', ...value.frames].join('\n');
  if (!isStructured(value)) return summarize(value);
  if (seen.has(value)) return '[Circular]';
  if (depth > 2) return collapseLabel(value);
  if (Array.isArray(value)) return formatArray(value, seen, depth);
  return formatStruct(value, seen, depth);
}

function formatArray(value: unknown[], seen: WeakSet<object>, depth: number): string {
  if (!value.length) return '[]';
  if (value.length <= 8 && value.every((item) => !isStructured(item))) {
    return `[${value.map((item) => formatCopy(item, seen, depth + 1)).join(', ')}]`;
  }
  seen.add(value);
  try {
    const pad = '  '.repeat(depth);
    const inner = '  '.repeat(depth + 1);
    const lines = value.slice(0, 20).map((item) => `${inner}${formatCopy(item, seen, depth + 1)}`);
    if (value.length > 20) lines.push(`${inner}… +${value.length - 20}`);
    return `[\n${lines.join(',\n')}\n${pad}]`;
  } finally {
    seen.delete(value);
  }
}

function formatStruct(value: object, seen: WeakSet<object>, depth: number): string {
  const view = readStruct(value);
  const title = view.title ? `${view.title} ` : '';
  if (!view.rows.length) return `${title}{}`;
  seen.add(value);
  try {
    const pad = '  '.repeat(depth);
    const inner = '  '.repeat(depth + 1);
    const lines = view.rows.map((row) => {
      if (!row.sep) return `${inner}${row.name}`;
      const glue = row.sep === ':' ? ': ' : ` ${row.sep} `;
      return `${inner}${row.name}${glue}${formatCopy(row.value, seen, depth + 1)}`;
    });
    return `${title}{\n${lines.join(',\n')}\n${pad}}`;
  } finally {
    seen.delete(value);
  }
}

export function expandNewlines(chunks: Chunk[]): Chunk[] {
  const expanded: Chunk[] = [];
  let breakNext = false;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (isStructured(chunk.value)) {
      expanded.push({ ...chunk, ownLine: true });
      if (chunk.text.endsWith('\n')) breakNext = true;
      continue;
    }
    const text = chunk.text;
    const lines = text.split('\n');
    const trailingBreak = text.length > 0 && text.charAt(text.length - 1) === '\n';
    if (trailingBreak) lines.pop();
    if (!lines.length) lines.push('');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      expanded.push({
        text: line === '' ? '\u00a0' : line,
        css: chunk.css,
        value: lineIndex === 0 ? chunk.value : line,
        expandable: lineIndex === 0 && chunk.expandable,
        ownLine: Boolean(chunk.ownLine) || breakNext || lineIndex > 0,
      });
      breakNext = false;
    }
    if (trailingBreak) breakNext = true;
  }
  return expanded;
}

function quoteString(text: string): string {
  const brief = describePayload(text);
  if (brief) return brief.label;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (isJsonText(normalized)) return clip(normalized);
  const shown = clip(normalized);
  if (shown.includes('\n')) return `"${shown}"`;
  const body = shown.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${body}"`;
}

function isJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 100_000) return false;
  const first = trimmed.charAt(0);
  if (first !== '{' && first !== '[') return false;
  try {
    const value = JSON.parse(trimmed) as unknown;
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

function clip(text: string): string {
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}

function joinType(...parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

function labelNode(value: object): string {
  if (typeof Document !== 'undefined' && value instanceof Document) return '#document';
  if (typeof DocumentFragment !== 'undefined' && value instanceof DocumentFragment) return '#document-fragment';
  if (typeof Text !== 'undefined' && value instanceof Text) return `#text ${quoteString(value.data)}`;
  if (typeof Comment !== 'undefined' && value instanceof Comment) return `#comment ${quoteString(value.data)}`;
  return '';
}

function readMap(value: Map<unknown, unknown>): StructView {
  const rows: StructRow[] = [];
  value.forEach((entry, key) => {
    if (rows.length >= 20) return;
    rows.push({ name: summarize(key), sep: '=>', value: entry });
  });
  if (value.size > 20) rows.push({ name: `… +${value.size - 20}`, sep: '' });
  return { title: `Map(${value.size})`, rows };
}

function readSet(value: Set<unknown>): StructView {
  const rows: StructRow[] = [];
  let index = 0;
  value.forEach((entry) => {
    if (rows.length >= 20) return;
    rows.push({ name: String(index), sep: ':', value: entry });
    index += 1;
  });
  if (value.size > 20) rows.push({ name: `… +${value.size - 20}`, sep: '' });
  return { title: `Set(${value.size})`, rows };
}

function readUrl(url: URL): StructView {
  const fields = ['href', 'origin', 'protocol', 'username', 'password', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'] as const;
  return {
    title: 'URL',
    rows: fields.map((key) => ({ name: key, sep: ':', value: url[key] })),
  };
}

function readPairs(title: string, value: { forEach: (callback: (item: string, key: string) => void) => void }): StructView {
  const rows: StructRow[] = [];
  let extra = 0;
  value.forEach((item, key) => {
    if (rows.length >= 20) {
      extra += 1;
      return;
    }
    rows.push({ name: key, sep: ':', value: item });
  });
  if (extra) rows.push({ name: `… +${extra}`, sep: '' });
  return { title, rows };
}

function readFile(file: File): StructView {
  return {
    title: 'File',
    rows: [
      { name: 'name', sep: ':', value: file.name },
      { name: 'size', sep: ':', value: file.size },
      { name: 'type', sep: ':', value: file.type },
    ],
  };
}

function readBlob(blob: Blob): StructView {
  return {
    title: 'Blob',
    rows: [
      { name: 'size', sep: ':', value: blob.size },
      { name: 'type', sep: ':', value: blob.type },
    ],
  };
}

function readDataView(view: DataView): StructView {
  return {
    title: `DataView(${view.byteLength})`,
    rows: [
      { name: 'byteLength', sep: ':', value: view.byteLength },
      { name: 'byteOffset', sep: ':', value: view.byteOffset },
      { name: 'buffer', sep: ':', value: view.buffer },
    ],
  };
}

function readTyped(value: ArrayBufferView): StructView {
  const list = value as ArrayBufferView & ArrayLike<number>;
  const name = value.constructor?.name || 'TypedArray';
  const length = list.length ?? 0;
  const rows: StructRow[] = [];
  const count = Math.min(length, 20);
  for (let index = 0; index < count; index += 1) rows.push({ name: String(index), sep: ':', value: list[index] });
  if (length > 20) rows.push({ name: `… +${length - 20}`, sep: '' });
  rows.push(
    { name: 'byteLength', sep: ':', value: value.byteLength },
    { name: 'byteOffset', sep: ':', value: value.byteOffset },
    { name: 'buffer', sep: ':', value: value.buffer },
  );
  return { title: `${name}(${length})`, rows };
}

function readObject(value: object): StructView {
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const name = value.constructor?.name;
  const rows: StructRow[] = keys.slice(0, 20).map((key) => {
    let nested: unknown;
    try {
      nested = record[key];
    } catch (error) {
      nested = error instanceof Error ? error.message : '[Thrown]';
    }
    return { name: key, sep: ':', value: nested };
  });
  if (keys.length > 20) rows.push({ name: `… +${keys.length - 20}`, sep: '' });
  return { title: name && name !== 'Object' ? name : '', rows };
}

function collectionPreview(name: string, size: number, parts: string[]): string {
  const more = size > parts.length ? `, … +${size - parts.length}` : '';
  return `${name}(${size}) {${parts.join(', ')}${more}}`;
}

function mapParts(value: Map<unknown, unknown>, seen: WeakSet<object>, depth: number): string[] {
  const parts: string[] = [];
  value.forEach((entry, key) => {
    if (parts.length >= MAX_KEYS) return;
    parts.push(`${summarize(key, seen, depth + 1)} => ${summarize(entry, seen, depth + 1)}`);
  });
  return parts;
}

function setParts(value: Set<unknown>, seen: WeakSet<object>, depth: number): string[] {
  const parts: string[] = [];
  value.forEach((entry) => {
    if (parts.length >= MAX_KEYS) return;
    parts.push(summarize(entry, seen, depth + 1));
  });
  return parts;
}

function urlPreview(url: URL): string {
  const fields = ['origin', 'protocol', 'username', 'password', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'] as const;
  const body = fields.map((key) => `${key}: ${quoteString(url[key])}`).join(', ');
  return clip(`URL {${body}}`);
}

function typedPreview(value: ArrayLike<number> & { length: number }): string {
  const name = (value as { constructor?: { name?: string } }).constructor?.name || 'TypedArray';
  const view = value as ArrayLike<number> & ArrayBufferView;
  const parts: string[] = [];
  const count = Math.min(value.length, MAX_KEYS);
  for (let index = 0; index < count; index += 1) parts.push(String(value[index]));
  if (value.length > MAX_KEYS) parts.push(`… +${value.length - MAX_KEYS}`);
  const bufferLength = view.buffer ? view.buffer.byteLength : view.byteLength;
  parts.push(
    `buffer: ArrayBuffer(${bufferLength})`,
    `byteLength: ${view.byteLength}`,
    `byteOffset: ${view.byteOffset}`,
    `length: ${value.length}`,
  );
  return clip(`${name}(${value.length}) [${parts.join(', ')}]`);
}

export function presentChunks(args: unknown[]): Chunk[] {
  const shown = expandNewlines(formatArgs(args));
  const result: Chunk[] = [];
  for (let index = 0; index < shown.length; index += 1) {
    const chunk = shown[index];
    result.push(chunk);
    if (!(chunk.value instanceof Error) || !chunk.expandable) continue;
    const frames = stackFrames(chunk.value).slice(0, 6);
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      result.push({ text: frames[frameIndex], expandable: false, ownLine: true });
    }
  }
  return result;
}

export interface TraceValue {
  __gravscopeTrace: true;
  frames: string[];
}

export function isTraceValue(value: unknown): value is TraceValue {
  if (value === null || typeof value !== 'object') return false;
  const trace = value as TraceValue;
  return trace.__gravscopeTrace === true && Array.isArray(trace.frames);
}

export function captureTrace(error: Error): TraceValue {
  return { __gravscopeTrace: true, frames: stackFrames(error) };
}

function readTrace(value: TraceValue): StructView {
  const rows: StructRow[] = [];
  const count = Math.min(value.frames.length, 20);
  for (let index = 0; index < count; index += 1) rows.push({ name: value.frames[index], sep: '' });
  if (value.frames.length > 20) rows.push({ name: `… +${value.frames.length - 20}`, sep: '' });
  return { title: 'console.trace', rows };
}

function stackFrames(error: Error): string[] {
  const lines = (error.stack || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines[0] && lines[0].indexOf(error.message) !== -1) lines.shift();
  const frames: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/[ \t]+$/g, '');
    if (line.trim()) frames.push(line);
  }
  return frames;
}

export function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const names: string[] = [];
  const count = Math.min(element.classList.length, 2);
  for (let index = 0; index < count; index += 1) {
    const name = element.classList.item(index);
    if (name) names.push(`.${name}`);
  }
  const classes = names.join('');
  return `<${element.tagName.toLowerCase()}${id}${classes}>`;
}

export function formatArgs(args: unknown[]): Chunk[] {
  if (args.length === 0) return [{ text: 'undefined', expandable: false, value: undefined }];
  const first = args[0];
  if (typeof first !== 'string' || !/%[sdifocO%]/.test(first)) return args.map((arg) => argToChunk(arg));

  const chunks: Chunk[] = [];
  let index = 1;
  let css = '';
  const pattern = /%([sdifocO%])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(first))) {
    const plain = first.slice(last, match.index);
    if (plain) chunks.push({ text: plain, css, expandable: false, value: plain });
    last = match.index + match[0].length;
    const spec = match[1];
    if (spec === '%') {
      chunks.push({ text: '%', css, expandable: false, value: '%' });
      continue;
    }
    if (spec === 'c') {
      const style = args[index++];
      css = typeof style === 'string' ? sanitizeCss(style) : '';
      continue;
    }
    const arg = args[index++];
    if (spec === 's') {
      const text = String(arg ?? '');
      const brief = describePayload(text);
      chunks.push({ text: brief ? brief.label : text, css, expandable: false, value: text });
    } else if (spec === 'd' || spec === 'i') {
      const number = Number.parseInt(String(arg), 10);
      chunks.push({ text: String(number), css, expandable: false, value: number });
    } else if (spec === 'f') {
      const number = Number.parseFloat(String(arg));
      chunks.push({ text: String(number), css, expandable: false, value: number });
    } else {
      chunks.push(argToChunk(arg, css));
    }
  }
  const tail = first.slice(last);
  if (tail) chunks.push({ text: tail, css, expandable: false, value: tail });
  while (index < args.length) chunks.push(argToChunk(args[index++]));
  return chunks.length ? chunks : [argToChunk(first)];
}

export function sanitizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\([^)]*\)/gi, '')
    .replace(/@import[^;]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/behaviou?r\s*:[^;]*/gi, '');
}

export function isExpandable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value instanceof Error) return true;
  if (typeof Element !== 'undefined' && value instanceof Element) return true;
  if (value instanceof Date || value instanceof RegExp) return false;
  if (typeof value === 'function') return false;
  if (typeof Promise !== 'undefined' && value instanceof Promise) return false;
  if (typeof URL !== 'undefined' && value instanceof URL) return false;
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return false;
  if (typeof Window !== 'undefined' && value instanceof Window) return false;
  if (typeof Document !== 'undefined' && value instanceof Document) return false;
  if (typeof Text !== 'undefined' && value instanceof Text) return false;
  if (typeof Comment !== 'undefined' && value instanceof Comment) return false;
  return typeof value === 'object';
}

function argToChunk(value: unknown, css?: string): Chunk {
  return {
    text: summarize(value),
    css,
    value,
    expandable: isExpandable(value),
    ownLine: true,
  };
}
