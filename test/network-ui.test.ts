import { describe, expect, it } from 'vitest';
import { NetStore } from '../src/core/store';
import { createNetworkPlugin } from '../src/plugins/network';

describe('network search', () => {
  it('combines URL search and failure filtering and preserves both after details', () => {
    const store = new NetStore();
    const plugin = createNetworkPlugin(store, 'en');
    const pane = document.createElement('div');
    plugin.emit('render', pane);
    store.start({ kind: 'fetch', method: 'GET', url: 'https://api.example.com/users', status: 200, pending: false });
    const failed = store.start({ kind: 'fetch', method: 'POST', url: 'https://api.example.com/users', status: 500, pending: false });
    store.start({ kind: 'fetch', method: 'GET', url: 'https://api.example.com/other', status: 404, pending: false });
    const search = pane.querySelector<HTMLInputElement>('.gc-search')!;
    search.value = 'users';
    search.dispatchEvent(new Event('input'));
    pane.querySelector<HTMLButtonElement>('[data-net="failed"]')!.click();
    const visible = () => [...pane.querySelectorAll<HTMLElement>('.gc-net')].filter(row => !row.hidden);
    expect(visible()).toHaveLength(1);
    expect(visible()[0].dataset.id).toBe(String(failed.id));
    expect(visible()[0].querySelector('.gc-url')?.textContent).toBe('/users');
    visible()[0].click();
    expect(pane.querySelector<HTMLElement>('.gc-net-search')!.hidden).toBe(true);
    expect(pane.querySelector('.gc-detail')?.textContent).toContain(failed.url);
    pane.querySelector<HTMLButtonElement>('.gc-back')!.click();
    expect(search.value).toBe('users');
    expect(visible()).toHaveLength(1);
    search.value = 'POST';
    search.dispatchEvent(new Event('input'));
    expect(visible()).toHaveLength(1);
    failed.status = 200;
    store.update(failed);
    expect(visible()).toHaveLength(0);
    expect(pane.querySelector('.gc-empty')?.textContent).toBe('No matching results');
    plugin.emit('remove');
  });
});
