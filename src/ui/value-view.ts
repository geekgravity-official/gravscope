import { canPreviewImage, payloadLabel } from '../format/payload';
import { describeElement, isExpandable, isStructured, presentChunks, readStruct, sanitizeCss, summarize, type Chunk, type StructView } from '../format/value';
import { el } from './dom';

interface Message {
  args: unknown[];
  kind?: 'normal' | 'table' | 'command' | 'group';
  command?: string;
}

export function renderMessage(line: HTMLElement, details: HTMLElement, item: Message): void {
  line.replaceChildren();
  details.replaceChildren();
  details.hidden = true;
  if (item.command) line.append(el('span', { class: 'gc-cmdmark', text: `› ${item.command}` }));
  if (item.kind === 'table') {
    line.append(el('span', { class: 'gc-chunk gc-obj', text: tableLabel(item.args[0]) }));
    renderTable(item.args[0], details);
    details.hidden = false;
    return;
  }

  const blocks: HTMLElement[] = [];
  let inline: HTMLElement | null = null;
  for (const chunk of presentChunks(item.args)) {
    if (chunk.ownLine && isStructured(chunk.value)) {
      const block = el('div', { class: 'gc-struct gc-arg' });
      renderData(chunk.value, block, new WeakSet(), 0);
      line.append(block);
      inline = null;
      continue;
    }
    const span = el('span', { class: `gc-chunk ${classFor(chunk)}` });
    if (chunk.css) span.style.cssText = sanitizeCss(chunk.css);
    if (chunk.expandable) {
      const button = el('button', { class: 'gc-toggle', type: 'button', text: chunk.text });
      const block = el('div', { class: 'gc-expand' });
      block.hidden = true;
      button.addEventListener('click', () => {
        if (!block.dataset.ready) {
          renderValue(chunk.value, block);
          block.dataset.ready = '1';
        }
        block.hidden = !block.hidden;
        details.hidden = blocks.every((node) => node.hidden);
      });
      span.append(button);
      blocks.push(block);
      details.append(block);
    } else {
      const thumb = typeof chunk.value === 'string' ? imageThumb(chunk.value) : null;
      if (thumb) span.append(thumb);
      span.append(document.createTextNode(chunk.text));
    }
    if (chunk.ownLine) {
      span.classList.add('gc-arg');
      line.append(span);
      inline = null;
    } else {
      if (!inline) {
        inline = el('div', { class: 'gc-inline-msg' });
        line.append(inline);
      }
      inline.append(span);
    }
  }
}

export function imageThumb(src: string): HTMLImageElement | null {
  if (!canPreviewImage(src)) return null;
  const img = document.createElement('img');
  img.className = 'gc-thumb';
  img.alt = '';
  img.src = src;
  return img;
}

export function renderValue(value: unknown, container: HTMLElement): void {
  const seen = new WeakSet<object>();
  writeValue(value, container, seen, 0);
}

function writeValue(value: unknown, container: HTMLElement, seen: WeakSet<object>, depth: number): void {
  if (value !== null && typeof value === 'object' && seen.has(value)) {
    container.append(el('span', { class: 'gc-nil', text: '[Circular]' }));
    return;
  }
  if (depth > 6 || value === null || value === undefined || typeof value !== 'object') {
    container.append(el('span', { class: literalClass(value), text: summarize(value) }));
    return;
  }
  if (value instanceof Error) {
    container.append(el('div', { class: 'gc-str', text: `${value.name}: ${value.message}` }));
    if (value.stack) container.append(el('pre', { class: 'gc-pre', text: value.stack }));
    return;
  }
  if (typeof Element !== 'undefined' && value instanceof Element) {
    container.append(el('div', { class: 'gc-obj', text: describeElement(value) }));
    const lines: string[] = [];
    const count = Math.min(value.attributes.length, 20);
    for (let index = 0; index < count; index += 1) {
      const attr = value.attributes[index];
      lines.push(`${attr.name}="${attr.value}"`);
    }
    const attrs = lines.join('\n');
    if (attrs) container.append(el('pre', { class: 'gc-pre', text: attrs }));
    container.append(el('div', { class: 'gc-nil', text: `${value.childNodes.length} child nodes` }));
    return;
  }

  seen.add(value);
  if (value instanceof Map) {
    let index = 0;
    for (const [key, entry] of value) {
      if (index >= 100) break;
      container.append(pair(summarize(key), entry, seen, depth));
      index += 1;
    }
    return;
  }
  if (value instanceof Set) {
    let index = 0;
    for (const entry of value) {
      if (index >= 100) break;
      container.append(pair(String(index), entry, seen, depth));
      index += 1;
    }
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 100).forEach((entry, index) => container.append(pair(String(index), entry, seen, depth)));
    if (value.length > 100) container.append(el('div', { class: 'gc-nil', text: `… +${value.length - 100}` }));
    return;
  }

  const keys = Object.keys(value).slice(0, 100);
  if (!keys.length) {
    container.append(el('span', { class: 'gc-nil', text: summarize(value) }));
    return;
  }
  for (const key of keys) {
    let nested: unknown;
    try {
      nested = (value as Record<string, unknown>)[key];
    } catch (error) {
      nested = error instanceof Error ? error.message : 'Thrown';
    }
    container.append(pair(key, nested, seen, depth));
  }
}

function renderData(value: unknown, container: HTMLElement, seen: WeakSet<object>, depth: number): void {
  if (!isStructured(value)) {
    container.append(el('span', { class: literalClass(value), text: summarize(value) }));
    return;
  }
  if (seen.has(value)) {
    container.append(el('span', { class: 'gc-nil', text: '[Circular]' }));
    return;
  }
  if (isCompact(value)) {
    renderCompact(value, container);
    return;
  }
  renderFoldable(value, container, seen, depth);
}

function isCompact(value: object): boolean {
  if (Array.isArray(value)) return value.length === 0 || (value.length <= 8 && value.every((item) => !isStructured(item)));
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (typeof URL !== 'undefined' && value instanceof URL) return false;
  if (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) return !hasPair(value);
  if (typeof Headers !== 'undefined' && value instanceof Headers) return !hasPair(value);
  return Object.keys(value).length === 0;
}

function renderCompact(value: object, container: HTMLElement): void {
  if (Array.isArray(value)) {
    if (!value.length) {
      container.append(el('span', { class: 'gc-punct', text: '[]' }));
      return;
    }
    const span = el('span', { class: 'gc-chunk' });
    span.append(el('span', { class: 'gc-punct', text: '[' }));
    value.forEach((item, index) => {
      if (index) span.append(document.createTextNode(', '));
      span.append(el('span', { class: literalClass(item), text: summarize(item) }));
    });
    span.append(el('span', { class: 'gc-punct', text: ']' }));
    container.append(span);
    return;
  }
  const view = readStruct(value);
  const title = view.title ? `${view.title} ` : '';
  container.append(el('span', { class: 'gc-punct', text: `${title}{}` }));
}

function renderFoldable(value: object, container: HTMLElement, seen: WeakSet<object>, depth: number): void {
  const button = el('button', { class: 'gc-disclosure', type: 'button' });
  button.setAttribute('aria-expanded', 'false');
  const caret = el('span', { class: 'gc-caret', text: '▶' });
  const label = el('span', { class: 'gc-disclosure-label gc-obj', text: summarize(value) });
  const brace = el('span', { class: 'gc-disclosure-brace gc-punct', text: Array.isArray(value) ? '[' : '{' });
  brace.hidden = true;
  button.append(caret, label, brace);
  const body = el('div', { class: 'gc-struct-body' });
  body.hidden = true;
  let title = '';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const willOpen = body.hidden;
    if (willOpen && !body.dataset.ready) {
      seen.add(value);
      if (Array.isArray(value)) fillArray(value, body, seen, depth);
      else {
        const view = readStruct(value);
        title = view.title;
        fillRows(view, body, seen, depth);
      }
      body.dataset.ready = '1';
    }
    if (willOpen) {
      label.className = 'gc-disclosure-label gc-punct';
      label.textContent = title;
      brace.hidden = false;
      button.classList.add('is-open');
    } else {
      label.className = 'gc-disclosure-label gc-obj';
      label.textContent = summarize(value);
      brace.hidden = true;
      button.classList.remove('is-open');
    }
    body.hidden = !willOpen;
    caret.textContent = willOpen ? '▼' : '▶';
    button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    const slot = button.parentElement;
    if (slot?.classList.contains('gc-slot')) slot.classList.toggle('gc-slot-block', willOpen);
  });
  container.append(button, body);
}

function fillArray(value: unknown[], body: HTMLElement, seen: WeakSet<object>, depth: number): void {
  value.slice(0, 20).forEach((item, index) => body.append(propLine(String(index), ':', item, seen, depth)));
  if (value.length > 20) body.append(el('div', { class: 'gc-prop gc-nil', text: `… +${value.length - 20}` }));
  body.append(el('div', { class: 'gc-punct', text: ']' }));
}

function fillRows(view: StructView, body: HTMLElement, seen: WeakSet<object>, depth: number): void {
  for (let index = 0; index < view.rows.length; index += 1) {
    const row = view.rows[index];
    if (!row.sep) {
      body.append(el('div', { class: 'gc-prop gc-nil', text: row.name }));
      continue;
    }
    body.append(propLine(row.name, row.sep, row.value, seen, depth));
  }
  body.append(el('div', { class: 'gc-punct', text: '}' }));
}

function propLine(name: string, sep: string, value: unknown, seen: WeakSet<object>, depth: number): HTMLElement {
  const prop = el('div', { class: 'gc-prop' });
  prop.append(el('span', { class: 'gc-k', text: name }));
  prop.append(el('span', { class: 'gc-punct', text: sep }));
  const slot = el('div', { class: 'gc-slot' });
  renderData(value, slot, seen, depth + 1);
  prop.append(slot);
  return prop;
}

function hasPair(value: { forEach: (callback: () => void) => void }): boolean {
  let found = false;
  value.forEach(() => {
    found = true;
  });
  return found;
}

function pair(key: string, value: unknown, seen: WeakSet<object>, depth: number): HTMLElement {
  const line = el('div', { class: 'gc-kvline' });
  line.append(el('span', { class: 'gc-k', text: key }));
  const holder = el('div', { class: 'gc-v' });
  if (!isExpandable(value)) {
    holder.append(el('span', { class: literalClass(value), text: summarize(value) }));
  } else {
    const toggle = el('button', { class: 'gc-toggle', type: 'button', text: summarize(value) });
    const child = el('div', { class: 'gc-tree' });
    child.hidden = true;
    toggle.addEventListener('click', () => {
      if (!child.dataset.ready) {
        writeValue(value, child, seen, depth + 1);
        child.dataset.ready = '1';
      }
      child.hidden = !child.hidden;
    });
    holder.append(toggle, child);
  }
  line.append(holder);
  return line;
}

function renderTable(data: unknown, container: HTMLElement): void {
  const records = asRecords(data);
  if (!records) {
    renderValue(data, container);
    return;
  }
  const columns: string[] = [];
  for (const row of records.slice(0, 50)) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const table = el('table', { class: 'gc-table' });
  const head = document.createElement('tr');
  head.append(cell('th', '(index)'));
  for (const column of columns) head.append(cell('th', column));
  const thead = document.createElement('thead');
  thead.append(head);
  const body = document.createElement('tbody');
  records.slice(0, 50).forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.append(cell('td', String(index)));
    for (const column of columns) {
      const value = row[column];
      tr.append(cell('td', value == null ? '' : typeof value === 'object' ? summarize(value) : payloadLabel(String(value))));
    }
    body.append(tr);
  });
  table.append(thead, body);
  container.append(table);
  if (records.length > 50) container.append(el('div', { class: 'gc-nil', text: `… +${records.length - 50}` }));
}

function asRecords(data: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(data)) {
    if (!data.length) return [];
    if (data.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))) {
      return data as Array<Record<string, unknown>>;
    }
    return null;
  }
  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({ key, value }));
  }
  return null;
}

function tableLabel(data: unknown): string {
  if (Array.isArray(data)) return `Table(${data.length})`;
  if (data && typeof data === 'object') return 'Table';
  return summarize(data);
}

function cell(tag: 'td' | 'th', text: string): HTMLTableCellElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function classFor(chunk: Chunk): string {
  if (chunk.expandable) return 'gc-obj';
  return literalClass(chunk.value);
}

function literalClass(value: unknown): string {
  if (typeof value === 'string') return 'gc-str';
  if (typeof value === 'number' || typeof value === 'bigint') return 'gc-num';
  if (typeof value === 'boolean') return 'gc-bool';
  if (value === null || value === undefined) return 'gc-nil';
  return 'gc-obj';
}
