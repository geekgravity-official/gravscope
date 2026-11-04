import { afterEach, describe, expect, it, vi } from 'vitest';
import { GravScope } from '../src';
import { LogStore, NetStore } from '../src/core/store';
import { createLogPlugin } from '../src/plugins/log';
import { createErrorsPlugin } from '../src/plugins/errors';
import { createNetworkPlugin } from '../src/plugins/network';
import { requestCurl } from '../src/format/curl';
import { redactText } from '../src/report/snapshot';

const originalFetch = window.fetch;
afterEach(() => { GravScope.current?.destroy(); window.fetch = originalFetch; sessionStorage.clear(); vi.restoreAllMocks(); });

describe('debugging workflow', () => {
  it('pauses scrolling while capture continues, counts new entries and resumes at the bottom', () => {
    const store = new LogStore();
    const plugin = createLogPlugin(store, 'en', () => {});
    const pane = document.createElement('div');
    plugin.emit('render', pane);
    const list = pane.querySelector<HTMLElement>('.gc-list')!;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
    plugin.getTools().find(tool => tool.name === 'Pause scrolling')!.onClick();
    store.append({ level: 'log', args: ['one'] });
    store.append({ level: 'log', args: ['one'] });
    expect(list.scrollTop).toBe(0);
    const resume = pane.querySelector<HTMLButtonElement>('.gc-resume-logs')!;
    expect(resume.textContent).toContain('2 new');
    resume.click();
    expect(list.scrollTop).toBe(900);
    expect(resume.hidden).toBe(true);
    plugin.emit('remove');
  });

  it('combines method, status, failure and URL filters and updates live', () => {
    const store = new NetStore();
    const plugin = createNetworkPlugin(store, 'en');
    const pane = document.createElement('div'); plugin.emit('render', pane);
    const one = store.start({ kind: 'fetch', method: 'POST', url: '/api', status: 500, pending: false });
    store.start({ kind: 'fetch', method: 'GET', url: '/api', status: 500, pending: false });
    const method = pane.querySelector<HTMLSelectElement>('.gc-net-method')!;
    method.value = 'POST'; method.dispatchEvent(new Event('change'));
    const status = pane.querySelector<HTMLInputElement>('.gc-net-status')!;
    status.value = '5xx'; status.dispatchEvent(new Event('input'));
    const visible = () => [...pane.querySelectorAll<HTMLElement>('.gc-net')].filter(row => !row.hidden);
    expect(visible()).toHaveLength(1);
    one.status = 200; store.update(one);
    expect(visible()).toHaveLength(0);
    status.value = '200'; status.dispatchEvent(new Event('input'));
    expect(visible()).toHaveLength(1);
    plugin.emit('remove');
  });

  it('quotes cURL values without evaluating shell text or treating a body as a file', () => {
    const store = new NetStore();
    const record = store.start({ kind: 'fetch', method: 'POST', url: 'https://example.com/api', requestHeaders: { 'X-Test': "a'$(danger)", 'Bad\nName': 'bad' }, requestBody: '@secret.txt' });
    const text = requestCurl(record);
    expect(text).toContain('--data-raw \'@secret.txt\'');
    expect(text).toContain("a'\\''$(danger)");
    expect(text).not.toContain('Bad\nName');
    expect(() => requestCurl({ ...record, url: 'file:///secret' })).toThrow();
  });

  it('collects runtime, promise and resource errors independently of console capture', () => {
    const panel = new GravScope({ defaultPlugins: ['errors'], capture: { console: false, network: false } });
    console.error('not captured');
    window.dispatchEvent(new ErrorEvent('error', { message: 'runtime failure' }));
    const rejection = new Event('unhandledrejection'); Object.defineProperty(rejection, 'reason', { value: 'promise failure' });
    window.dispatchEvent(rejection);
    const image = document.createElement('img'); document.body.append(image);
    image.dispatchEvent(new Event('error'));
    image.remove();
    const logs = panel.getReport().logs as { errorSource: string }[];
    expect(logs.map(item => item.errorSource)).toEqual(['runtime', 'promise', 'resource']);
    panel.setOption('capture', { error: false, console: true });
    window.dispatchEvent(new ErrorEvent('error', { message: 'ignored' }));
    console.log('captured console');
    expect(panel.getReport().logs).toHaveLength(4);
    panel.setOption('capture', { console: false });
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    [...root.querySelectorAll<HTMLButtonElement>('.gc-tool')].find(button => button.textContent === 'Clear')!.click();
    expect(panel.getReport().logs).toHaveLength(0);
  });

  it('stops and resumes network hooks without aborting or recording requests while disabled', async () => {
    window.fetch = vi.fn(async () => new Response('ok')) as typeof fetch;
    const native = window.fetch;
    const panel = new GravScope({ defaultPlugins: [], capture: { network: false } });
    expect(window.fetch).toBe(native);
    await window.fetch('/disabled');
    expect(panel.getReport().network).toHaveLength(0);
    panel.setOption('capture', { network: true });
    await window.fetch('/enabled');
    expect(panel.getReport().network).toHaveLength(1);
    panel.setOption('capture', { network: false });
    expect(window.fetch).toBe(native);
    await window.fetch('/disabled-again');
    expect(panel.getReport().network).toHaveLength(1);
  });

  it('aggregates repeated exceptions across intervening logs and clears only errors', () => {
    const store = new LogStore();
    const plugin = createErrorsPlugin(store, 'en');
    const pane = document.createElement('div'); plugin.emit('render', pane);
    store.append({ level: 'error', args: ['failure'], errorSource: 'runtime' });
    store.append({ level: 'log', args: ['context'] });
    store.append({ level: 'error', args: ['failure'], errorSource: 'runtime' });
    expect(pane.querySelectorAll('.gc-error-item')).toHaveLength(1);
    expect(pane.textContent).toContain('×2');
    plugin.getTools()[0].onClick();
    expect(store.items.map(item => item.level)).toEqual(['log']);
    plugin.emit('remove');
  });

  it('redacts compound credential keys and handles long ordinary tokens', () => {
    const result = redactText('xpassword=SECRET_A refresh_token=SECRET_B api-key=SECRET_C ' + 'x'.repeat(10000));
    expect(result).not.toMatch(/SECRET_[ABC]/);
    expect(result).toContain('x'.repeat(100));
    expect(redactText('x-'.repeat(6000))).toContain('x-'.repeat(100));
  });
});
