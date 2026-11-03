const MAX_TEXT = 100_000;

export interface TextCut {
  text: string;
  truncated: boolean;
  size: number;
}

export function cutText(text: string): TextCut {
  const size = byteLength(text);
  if (text.length <= MAX_TEXT) return { text, truncated: false, size };
  return { text: text.slice(0, MAX_TEXT), truncated: true, size };
}

export function previewBody(body: unknown): { text: string; truncated: boolean } {
  if (body == null || body === '') return { text: '', truncated: false };
  if (typeof body === 'string') {
    const cut = cutText(body);
    return { text: cut.text, truncated: cut.truncated };
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    const cut = cutText(body.toString());
    return { text: cut.text, truncated: cut.truncated };
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((value, key) => {
      if (typeof value === 'string') parts.push(`${key}=${value}`);
      else parts.push(`${key}=[file ${value.name || 'blob'}]`);
    });
    const cut = cutText(parts.join('&'));
    return { text: cut.text, truncated: cut.truncated };
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { text: `[Blob ${body.size} bytes${body.type ? ` ${body.type}` : ''}]`, truncated: false };
  }
  if (body instanceof ArrayBuffer) return { text: `[ArrayBuffer ${body.byteLength} bytes]`, truncated: false };
  if (ArrayBuffer.isView(body)) return { text: `[${body.constructor.name} ${body.byteLength} bytes]`, truncated: false };
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return { text: '[ReadableStream]', truncated: false };
  }
  if (typeof Document !== 'undefined' && body instanceof Document) return { text: '[Document]', truncated: false };
  return { text: Object.prototype.toString.call(body), truncated: false };
}

export function parseRawHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!raw) return headers;
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return headers;
}

function byteLength(text: string): number {
  if (text.length > MAX_TEXT) return text.length;
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}
