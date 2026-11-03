import { afterEach, describe, expect, it, vi } from 'vitest';
import { GravScope, GravScopePlugin } from '../src/index';

const originalFetch = window.fetch.bind(window);
const OriginalXHR = window.XMLHttpRequest;
const originalLog = console.log;

afterEach(() => {
  GravScope.current?.destroy();
  window.fetch = originalFetch;
  window.XMLHttpRequest = OriginalXHR;
  localStorage.clear();
  sessionStorage.clear();
});

function root(): HTMLElement {
  const host = document.querySelector('gravscope-root');
  if (!(host instanceof HTMLElement) || !host.shadowRoot) throw new Error('GravScope host missing');
  return host;
}

function shadow(): ShadowRoot {
  return root().shadowRoot as ShadowRoot;
}

function clickNet(marker: string): void {
  const row = [...shadow().querySelectorAll<HTMLElement>('.gc-net')].find((node) => node.textContent?.includes(marker));
  row?.click();
}

describe('GravScope', () => {
  it('reloads the current page only when the reload tool is clicked', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    try {
      new GravScope({ lang: 'en', defaultPlugins: [] });
      expect(reload).not.toHaveBeenCalled();
      [...shadow().querySelectorAll<HTMLButtonElement>('.gc-tool')].find(button => button.textContent === 'Reload page')!.click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      reload.mockRestore();
    }
  });

  it('combines log search with level filtering and toggles the command input', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    console.info('needle info');
    console.error('needle failure');
    console.error('unrelated');
    const search = shadow().querySelector<HTMLInputElement>('.gc-search')!;
    const select = shadow().querySelector<HTMLSelectElement>('.gc-level-select')!;
    search.value = 'needle';
    search.dispatchEvent(new Event('input'));
    select.value = 'error';
    select.dispatchEvent(new Event('change'));
    const visible = [...shadow().querySelectorAll<HTMLElement>('.gc-row')].filter(row => !row.hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain('needle failure');
    expect(shadow().querySelector('.gc-result-count')?.textContent).toBe('1 / 3');
    const form = shadow().querySelector<HTMLElement>('.gc-cmd')!;
    expect(form.hidden).toBe(true);
    const toggle = [...shadow().querySelectorAll<HTMLButtonElement>('.gc-tool')].find(button => button.textContent === 'Console')!;
    toggle.click();
    expect(form.hidden).toBe(false);
    toggle.click();
    expect(form.hidden).toBe(true);
  });

  it('toggles full screen independently from closing the panel', () => {
    const gc = new GravScope({ lang: 'en', defaultPlugins: [] });
    gc.show();
    const size = shadow().querySelector<HTMLButtonElement>('.gc-size')!;
    const panel = shadow().querySelector('.gc-panel')!;
    size.click();
    expect(panel.classList.contains('gc-fullscreen')).toBe(true);
    expect(panel.classList.contains('open')).toBe(true);
    expect(size.getAttribute('aria-label')).toBe('Half screen');
    size.click();
    expect(panel.classList.contains('gc-fullscreen')).toBe(false);
    expect(panel.classList.contains('open')).toBe(true);
  });

  it('captures console output, repeats, and restores console on destroy', () => {
    const gc = new GravScope({ lang: 'en', theme: 'light', defaultPlugins: [] });
    expect(console.log).not.toBe(originalLog);
    console.log('hello-gravscope', { a: 1 });
    console.log('same-line');
    console.log('same-line');
    console.error('boom-gravscope');
    const text = shadow().textContent ?? '';
    expect(text).toContain('hello-gravscope');
    expect(text).toContain('boom-gravscope');
    expect(shadow().querySelector('.gc-repeat')?.textContent).toBe('2');
    expect(shadow().querySelector('.gc-app')?.getAttribute('data-theme')).toBe('light');
    gc.show();
    expect(shadow().querySelector('.gc-panel')?.classList.contains('open')).toBe(true);
    gc.hide();
    expect(shadow().querySelector('.gc-panel')?.classList.contains('open')).toBe(false);
    gc.destroy();
    expect(console.log).toBe(originalLog);
    expect(document.querySelector('gravscope-root')).toBeNull();
  });

  it('lifts the panel above the keyboard', () => {
    const previous = window.visualViewport;
    const viewport = {
      height: window.innerHeight - 280,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    const gc = new GravScope({ lang: 'en', theme: 'light', defaultPlugins: [] });
    gc.show();
    const panel = shadow().querySelector('.gc-panel') as HTMLElement;
    expect(panel.style.bottom).toBe('280px');
    expect(panel.style.maxHeight).toBe(`${Math.max(160, Math.round(viewport.height - 8))}px`);
    gc.destroy();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: previous });
  });

  it('ignores a short browser-chrome inset and a small viewport resize', () => {
    const previousHeight = window.innerHeight;
    const previous = window.visualViewport;
    const viewport = {
      height: previousHeight - 80,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    try {
      const gc = new GravScope({ lang: 'en', theme: 'light', defaultPlugins: [] });
      const host = document.querySelector('gravscope-root') as HTMLElement;
      const panel = shadow().querySelector('.gc-panel') as HTMLElement;
      expect(host.style.height).toBe(`${previousHeight}px`);
      expect(host.style.bottom).toBe('auto');
      gc.show();
      expect(panel.style.bottom).toBe('');
      window.innerHeight = previousHeight - 80;
      window.dispatchEvent(new Event('resize'));
      expect(host.style.height).toBe(`${previousHeight}px`);
      expect(panel.style.bottom).toBe('');
      window.innerHeight = previousHeight - 280;
      window.dispatchEvent(new Event('resize'));
      expect(host.style.height).toBe(`${previousHeight - 280}px`);
      gc.destroy();
    } finally {
      window.innerHeight = previousHeight;
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: previous });
    }
  });

  it('rejects a second active instance', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    expect(() => new GravScope({ lang: 'en', defaultPlugins: [] })).toThrow(/already active/);
  });

  it('trims logs to maxLogNumber', () => {
    new GravScope({ lang: 'en', defaultPlugins: [], maxLogNumber: 2 });
    console.log('keep-a');
    console.log('keep-b');
    console.log('keep-c');
    const text = shadow().textContent ?? '';
    expect(text).not.toContain('keep-a');
    expect(text).toContain('keep-b');
    expect(text).toContain('keep-c');
  });

  it('runs a command from the log input', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    const input = shadow().querySelector('.gc-cmd-input') as HTMLInputElement;
    input.value = '6 * 7';
    input.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(shadow().textContent).toContain('42');
    input.value = 'throw new Error("cmd-broke")';
    input.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(shadow().textContent).toContain('cmd-broke');
  });

  it('copies log text without the time or level', async () => {
    const written: string[] = [];
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => { written.push(text); return Promise.resolve(); } },
    });
    try {
      new GravScope({ lang: 'en', defaultPlugins: [] });
      console.log('copy-body', { id: 7 });
      shadow().querySelector<HTMLButtonElement>('.gc-row .gc-copy')?.click();
      await Promise.resolve();
      expect(written[0]).toContain('copy-body');
      expect(written[0]).toContain('id: 7');
      expect(written[0]).not.toContain('[log]');
      expect(written[0]).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    }
  });

  it('prints objects collapsed and opens them level by level', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    console.log({ outer: { inner: 'nested-value' } });
    const root = shadow().querySelector<HTMLButtonElement>('.gc-disclosure');
    expect(root?.getAttribute('aria-expanded')).toBe('false');
    expect(shadow().querySelector('.gc-k')).toBeNull();
    root?.click();
    expect(root?.getAttribute('aria-expanded')).toBe('true');
    expect(root?.querySelector('.gc-disclosure-brace')?.textContent).toBe('{');
    expect(root?.querySelector<HTMLElement>('.gc-disclosure-brace')?.hidden).toBe(false);
    expect(shadow().querySelector('.gc-k')?.textContent).toBe('outer');
    expect(shadow().textContent).toContain('nested-value');
    root?.click();
    expect(root?.getAttribute('aria-expanded')).toBe('false');
    expect(shadow().querySelector<HTMLElement>('.gc-struct-body')?.hidden).toBe(true);

    console.log({ a: { b: { c: { d: 'deep-value' } } } });
    const deepRoot = [...shadow().querySelectorAll<HTMLButtonElement>('.gc-disclosure')].find((button) => button.textContent?.includes('{a:'));
    deepRoot?.click();
    const nested = [...shadow().querySelectorAll<HTMLButtonElement>('.gc-disclosure')].find((button) => button.getAttribute('aria-expanded') === 'false' && button.textContent?.includes('{b:'));
    nested?.click();
    expect(shadow().textContent).toContain('deep-value');
  });

  it('prints Map, Set, URL, and typed arrays as trees', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    console.log(new Map([['id', 7]]), new Set(['a', 'b']), new URL('https://example.com/a?b=1'), new Uint8Array([1, 2, 3]));
    const structs = [...shadow().querySelectorAll('.gc-arg.gc-struct')];
    const map = structs.find((node) => node.textContent?.includes('Map(1)'));
    expect(map?.querySelector('.gc-k')).toBeNull();
    expect(map?.textContent).toContain('Map(1) {"id" => 7}');
    map?.querySelector<HTMLButtonElement>('.gc-disclosure')?.click();
    expect(map?.querySelector('.gc-k')?.textContent).toBe('"id"');
    expect(map?.textContent).toContain('=>');
    const set = structs.find((node) => node.textContent?.includes('Set(2)'));
    set?.querySelector<HTMLButtonElement>('.gc-disclosure')?.click();
    expect([...(set?.querySelectorAll('.gc-k') ?? [])].map((node) => node.textContent)).toEqual(['0', '1']);
    expect(set?.textContent).toContain('"b"');
    const url = structs.find((node) => node.textContent?.includes('URL'));
    url?.querySelector<HTMLButtonElement>('.gc-disclosure')?.click();
    const urlKeys = [...(url?.querySelectorAll('.gc-k') ?? [])].map((node) => node.textContent);
    expect(urlKeys).toContain('href');
    expect(urlKeys).toContain('pathname');
    expect(url?.textContent).toContain('"/a"');
    const bytes = structs.find((node) => node.textContent?.includes('Uint8Array(3)'));
    bytes?.querySelector<HTMLButtonElement>('.gc-disclosure')?.click();
    expect([...(bytes?.querySelectorAll('.gc-k') ?? [])].map((node) => node.textContent)).toContain('byteLength');
  });

  it('breaks real newlines and records dir, count, trace, and timers', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    console.log('top-line\nbottom-line');
    console.log('%cRed\n%cBlue', 'color:red', 'color:blue');
    console.log(new Map([['id', 7]]));
    console.dir({ dirKey: 1 });
    console.trace('from-trace');
    console.count('hits');
    console.count('hits');
    console.countReset('hits');
    console.count('hits');
    console.time('lap');
    console.timeEnd('lap');
    console.timeEnd('missing-timer');

    const rows = [...shadow().querySelectorAll('.gc-line')];
    const broken = rows.find((row) => row.textContent?.includes('top-line'));
    expect([...(broken?.querySelectorAll('.gc-arg') ?? [])].map((node) => node.textContent)).toEqual(['"top-line', 'bottom-line"']);
    console.log('{\n    "kept": true\n}');
    const json = [...shadow().querySelectorAll('.gc-line')].find((row) => row.textContent?.includes('kept'));
    expect([...(json?.querySelectorAll('.gc-arg') ?? [])].map((node) => node.textContent)).toEqual(['{', '    "kept": true', '}']);
    const styled = rows.find((row) => row.textContent?.includes('Red') && row.textContent?.includes('Blue'));
    expect(styled?.querySelector('.gc-inline-msg')?.textContent).toBe('Red');
    expect([...(styled?.querySelectorAll('.gc-arg') ?? [])].map((node) => node.textContent)).toEqual(['Blue']);

    const text = shadow().textContent ?? '';
    expect(text).toContain('Map(1)');
    expect(text).toContain('dirKey');
    expect(text).toContain('from-trace');
    const traceRow = rows.find((row) => row.textContent?.includes('from-trace'));
    const trace = traceRow?.querySelector<HTMLButtonElement>('.gc-disclosure');
    expect(trace?.textContent).toContain('console.trace');
    expect(traceRow?.textContent).not.toContain('__gravscopeTrace');
    expect(traceRow?.textContent).not.toContain('console.ts');
    trace?.click();
    expect(trace?.getAttribute('aria-expanded')).toBe('true');
    expect(traceRow?.querySelector('.gc-disclosure-brace')?.textContent).toBe('{');
    expect(traceRow?.textContent).toContain('console.ts');
    console.trace({ traced: 7 });
    const traced = [...shadow().querySelectorAll('.gc-struct')].find((node) => node.textContent?.includes('traced'));
    expect(traced?.querySelector('.gc-k')).toBeNull();
    traced?.querySelector<HTMLButtonElement>('.gc-disclosure')?.click();
    expect(traced?.querySelector('.gc-k')?.textContent).toBe('traced');
    expect(text).toContain('hits: 1');
    expect(text).toContain('hits: 2');
    expect(text).toContain('lap:');
    expect(text).toContain("Timer 'missing-timer' does not exist");
    expect(text.match(/hits: 1/g)?.length).toBe(2);
  });

  it('records fetch and restores the original fetch', async () => {
    window.fetch = (async () =>
      new Response('{"marker":"fetch-body-marker"}', {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })) as typeof window.fetch;
    const gc = new GravScope({ lang: 'en', defaultPlugins: ['network'] });
    const wrapped = window.fetch;
    await fetch('/api/gravscope-fetch-marker', { method: 'POST', body: '{"a":1}' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const text = shadow().textContent ?? '';
    expect(text).toContain('POST');
    expect(text).toContain('gravscope-fetch-marker');
    expect(text).toContain('202');
    clickNet('gravscope-fetch-marker');
    expect(shadow().textContent).toContain('fetch-body-marker');
    gc.destroy();
    expect(window.fetch).not.toBe(wrapped);
  });

  it('records XMLHttpRequest', () => {
    function FakeXHR(this: FakeInstance) {
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
      this.responseType = '';
      this.listeners = {};
    }
    interface FakeInstance {
      status: number;
      statusText: string;
      responseText: string;
      responseType: string;
      listeners: Record<string, Array<() => void>>;
    }
    FakeXHR.prototype.open = function open() {};
    FakeXHR.prototype.setRequestHeader = function setRequestHeader() {};
    FakeXHR.prototype.send = function send(this: FakeInstance) {
      this.status = 201;
      this.statusText = 'Created';
      this.responseText = '{"xhr":"xhr-body-marker"}';
      for (const listener of this.listeners.loadend ?? []) listener();
    };
    FakeXHR.prototype.addEventListener = function addEventListener(this: FakeInstance, name: string, fn: () => void) {
      (this.listeners[name] ??= []).push(fn);
    };
    FakeXHR.prototype.getAllResponseHeaders = function getAllResponseHeaders() {
      return 'content-type: application/json\r\n';
    };
    window.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
    new GravScope({ lang: 'en', defaultPlugins: ['network'] });
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', '/xhr-gravscope-marker');
    xhr.setRequestHeader('X-Test', '1');
    xhr.send();
    const text = shadow().textContent ?? '';
    expect(text).toContain('PUT');
    expect(text).toContain('xhr-gravscope-marker');
    expect(text).toContain('201');
    clickNet('xhr-gravscope-marker');
    expect(shadow().textContent).toContain('xhr-body-marker');
  });

  it('records a failed static resource', () => {
    new GravScope({ lang: 'en', defaultPlugins: ['network'] });
    const image = document.createElement('img');
    document.body.append(image);
    image.src = '/missing-gravscope-asset.png';
    image.dispatchEvent(new Event('error'));
    const text = shadow().textContent ?? '';
    expect(text).toContain('missing-gravscope-asset.png');
    expect(text).toContain('Failed');
    image.remove();
  });

  it('shows storage, elements, system info, and custom plugins', () => {
    localStorage.setItem('gravscope-key', 'gravscope-value');
    const node = document.createElement('div');
    node.id = 'probe-node';
    node.textContent = 'probe-text';
    document.body.append(node);
    const gc = new GravScope({ lang: 'en', defaultPlugins: ['storage', 'element', 'system'] });
    const local = [...shadow().querySelectorAll('button')].find((button) => button.textContent === 'LocalStorage');
    local?.click();
    expect(shadow().textContent).toContain('gravscope-key');
    expect(shadow().textContent).toContain('gravscope-value');
    expect(shadow().textContent).toContain('probe-node');
    gc.setSystemInfo('Build', 'gravscope-build-42');
    expect(shadow().textContent).toContain('gravscope-build-42');
    expect(shadow().textContent).toContain('UA');

    const plugin = new GravScopePlugin('extra', 'Extra');
    plugin.on('render', (element) => {
      element.textContent = 'extra-panel';
    });
    gc.addPlugin(plugin);
    expect(shadow().textContent).toContain('Extra');
    expect(shadow().textContent).toContain('extra-panel');
    node.remove();
  });

  it('opens from the floating button and ignores the click that lands on the mask', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    const button = shadow().querySelector<HTMLButtonElement>('.gc-switch');
    button?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 40, clientY: 80, button: 0, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 44, clientY: 84, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 44, clientY: 84, bubbles: true }));
    button?.click();
    const panel = shadow().querySelector('.gc-panel');
    expect(panel?.classList.contains('open')).toBe(true);
    expect(button?.style.left).toBe('');
    expect(button?.style.top).toBe('');
    shadow().querySelector<HTMLElement>('.gc-mask')?.click();
    expect(panel?.classList.contains('open')).toBe(true);
    button?.click();
    expect(panel?.classList.contains('open')).toBe(true);
  });

  it('drags the floating button and docks it against the nearer edge', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    const button = shadow().querySelector<HTMLButtonElement>('.gc-switch');
    const panel = shadow().querySelector('.gc-panel');
    const endX = window.innerWidth - 10;
    button?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 80, button: 0, bubbles: true, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: endX, clientY: 120, bubbles: true, pointerId: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: endX, clientY: 120, bubbles: true, pointerId: 1 }));
    expect(panel?.classList.contains('open')).toBe(false);
    expect(button?.classList.contains('gc-docked')).toBe(true);
    expect(button?.classList.contains('gc-dragging')).toBe(false);
    expect(button?.dataset.side).toBe('right');
    expect(button?.style.left).toBe(`${Math.max(8, window.innerWidth - 44 - 8)}px`);
    button?.click();
    expect(panel?.classList.contains('open')).toBe(false);
    expect(button?.classList.contains('gc-docked')).toBe(true);
    button?.click();
    expect(panel?.classList.contains('open')).toBe(false);
    expect(button?.classList.contains('gc-docked')).toBe(false);
    button?.click();
    expect(panel?.classList.contains('open')).toBe(true);
  });

  it('opens from a plain click and still closes from the close button', () => {
    new GravScope({ lang: 'en', defaultPlugins: [] });
    const button = shadow().querySelector<HTMLButtonElement>('.gc-switch');
    button?.click();
    const panel = shadow().querySelector('.gc-panel');
    expect(panel?.classList.contains('open')).toBe(true);
    expect(button?.style.left).toBe('');
    shadow().querySelector<HTMLButtonElement>('.gc-close')?.click();
    expect(panel?.classList.contains('open')).toBe(false);
  });
});
