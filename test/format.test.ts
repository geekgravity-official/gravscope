import { describe, expect, it } from 'vitest';
import { cutText, previewBody } from '../src/capture/body';
import { parseCookies } from '../src/format/cookie';
import { describePayload } from '../src/format/payload';
import { resourceLabel, softWrapUrl } from '../src/format/text';
import { captureTrace, expandNewlines, formatArgs, formatCopy, sanitizeCss, summarize } from '../src/format/value';
import { keyboardOverlap } from '../src/ui/keyboard';

describe('summarize', () => {
  it('prints scalars and circular objects', () => {
    expect(summarize('hi')).toBe('"hi"');
    expect(summarize(3)).toBe('3');
    expect(summarize(null)).toBe('null');
    const box: { name: string; self?: unknown } = { name: 'a' };
    box.self = box;
    expect(summarize(box)).toContain('[Circular]');
    expect(summarize(box)).toContain('name');
  });

  it('previews console.trace as an object and copies the stack', () => {
    const trace = captureTrace(new Error('console.trace'));
    expect(summarize(trace)).toBe('console.trace');
    expect(formatCopy(trace)).toContain('console.trace');
    expect(formatCopy(trace)).toContain('format.test.ts');
    expect(formatCopy(trace)).not.toContain('__gravscopeTrace');
  });

  it('shortens data urls and base64 blobs', () => {
    const image = `data:image/png;base64,${'A'.repeat(40)}b1+/=`;
    expect(summarize(image)).toBe('image/png · 33 B');
    expect(summarize(image)).not.toContain('AAAA');
    const blob = 'Aa1+'.repeat(80);
    expect(describePayload(blob)?.label.startsWith('base64 · ')).toBe(true);
    expect(summarize(blob)).not.toContain('Aa1+Aa1+');
    expect(summarize('hello world')).toBe('"hello world"');
  });
});

describe('formatArgs', () => {
  it('applies printf substitutions', () => {
    const chunks = formatArgs(['id=%s n=%d ok=%s', 'gc', 3, true]);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe('id=gc n=3 ok=true');
  });

  it('keeps %c styles for color and weight', () => {
    const chunks = formatArgs(['%cGravScope%c ready', 'color:#3b82f6;font-weight:700', 'color:#34d399']);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe('GravScope ready');
    expect(chunks[0]?.css).toContain('color:#3b82f6');
    expect(chunks[0]?.css).toContain('font-weight:700');
    expect(chunks[1]?.css).toContain('color:#34d399');
    expect(chunks.every((chunk) => !chunk.ownLine)).toBe(true);
  });

  it('puts each plain argument on its own line', () => {
    const chunks = formatArgs(['Uncaught (in promise)', new TypeError('Failed to fetch')]);
    expect(chunks.map((chunk) => chunk.text)).toEqual(['"Uncaught (in promise)"', 'TypeError: Failed to fetch']);
    expect(chunks.every((chunk) => chunk.ownLine)).toBe(true);
  });

  it('keeps real line breaks and names common values', () => {
    const quoted = summarize('top\nbottom');
    expect(quoted).toBe('"top\nbottom"');
    expect(quoted).not.toContain('\\n');
    expect(summarize(-0)).toBe('-0');
    const url = summarize(new URL('https://example.com/a?b=1'));
    expect(url).toContain('origin: "https://example.com"');
    expect(url).toContain('pathname: "/a"');
    expect(url).toContain('search: "?b=1"');
    expect(summarize(new Map([['id', 1]]))).toBe('Map(1) {"id" => 1}');
    expect(summarize(new Set(['a']))).toBe('Set(1) {"a"}');
    expect(formatCopy({ id: 7, user: { name: 'ada' } })).toBe('{\n  id: 7,\n  user: {\n    name: "ada"\n  }\n}');
    expect(formatCopy(new Map([['id', 1]]))).toBe('Map(1) {\n  "id" => 1\n}');
    expect(formatCopy(new Set(['a', 'b']))).toBe('Set(2) {\n  0: "a",\n  1: "b"\n}');
    const urlText = formatCopy(new URL('https://example.com/a?b=1'));
    expect(urlText).toContain('URL {');
    expect(urlText).toContain('href: "https://example.com/a?b=1"');
    expect(urlText).toContain('pathname: "/a"');
    expect(formatCopy(new Uint8Array([1, 2]))).toBe(
      'Uint8Array(2) {\n  0: 1,\n  1: 2,\n  byteLength: 2,\n  byteOffset: 0,\n  buffer: ArrayBuffer {\n    byteLength: 2\n  }\n}',
    );
    expect(summarize(new Uint8Array([1, 2]))).toBe('Uint8Array(2) [1, 2, buffer: ArrayBuffer(2), byteLength: 2, byteOffset: 0, length: 2]');
    const lines = expandNewlines(formatArgs(['%cA\n%cB', 'color:red', 'color:blue']));
    expect(lines.map((chunk) => chunk.text)).toEqual(['A', 'B']);
    expect(lines[0]?.ownLine).toBe(false);
    expect(lines[1]?.ownLine).toBe(true);
    expect(lines[1]?.css).toContain('color:blue');
    const indented = expandNewlines(formatArgs(['{\n  "id": 1\n}']));
    expect(indented.map((chunk) => chunk.text)).toEqual(['{', '  "id": 1', '}']);
  });

  it('keeps a plain percent sign', () => {
    expect(formatArgs(['100% done'])[0]?.text).toBe('"100% done"');
    expect(formatArgs(['100%%']).map((chunk) => chunk.text).join('')).toBe('100%');
  });
});

describe('sanitizeCss', () => {
  it('strips urls and imports from %c styles', () => {
    const css = sanitizeCss('color:red; background:url(https://evil.test/x); @import "x";');
    expect(css).toContain('color:red');
    expect(css).not.toContain('url(');
    expect(css).not.toContain('@import');
  });
});

describe('network labels and keyboard', () => {
  it('labels scripts and favicons from the url, not every link as css', () => {
    expect(resourceLabel('http://127.0.0.1:4325/_next/static/chunks/18-3ud4pl-n1g.js', 'link')).toBe('JS');
    expect(resourceLabel('http://127.0.0.1:4325/brand/theme.css', 'link')).toBe('CSS');
    expect(resourceLabel('http://127.0.0.1:4325/api/favicon?url=https%3A%2F%2Fgetwaves.io', 'link')).toBe('ICON');
    const wrapped = softWrapUrl('http://127.0.0.1/api/favicon?url=https');
    expect(wrapped).toContain('?\u200b');
    expect(wrapped).toContain('/\u200b');
    expect(wrapped.replace(/\u200b/g, '')).toBe('http://127.0.0.1/api/favicon?url=https');
  });

  it('measures how far the keyboard covers the layout viewport', () => {
    expect(keyboardOverlap(800, 500, 0)).toBe(300);
    expect(keyboardOverlap(800, 500, 20)).toBe(280);
    expect(keyboardOverlap(800, 800, 0)).toBe(0);
  });
});

describe('cookies and bodies', () => {
  it('parses cookies', () => {
    expect(parseCookies('a=1; b=hello%20world')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: 'hello world' },
    ]);
  });

  it('truncates long text and previews structured bodies', () => {
    const cut = cutText('x'.repeat(100_001));
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBe(100_000);
    expect(previewBody(new URLSearchParams('a=1'))).toEqual({ text: 'a=1', truncated: false });
  });
});
