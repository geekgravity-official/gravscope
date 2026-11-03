import { GravScopePlugin } from '../core/plugin';
import { deleteCookie, parseCookies, writeCookie } from '../format/cookie';
import { t } from '../i18n';
import type { GravScopeLang } from '../types';
import { payloadLabel } from '../format/payload';
import { bindCopy, el } from '../ui/dom';

type Area = 'cookie' | 'local' | 'session';

export function createStoragePlugin(lang: GravScopeLang): GravScopePlugin {
  const plugin = new GravScopePlugin('storage', t(lang, 'storage'));
  let area: Area = 'cookie';
  let list: HTMLElement | null = null;
  let form: HTMLFormElement | null = null;
  let errorLine: HTMLElement | null = null;

  const showError = (error: unknown) => {
    if (!errorLine) return;
    errorLine.hidden = false;
    errorLine.textContent = error instanceof Error ? error.message : String(error);
  };

  const renderItems = () => {
    if (!list) return;
    list.replaceChildren();
    if (errorLine) errorLine.hidden = true;
    let items: { key: string; value: string }[] = [];
    try {
      items = readArea(area);
    } catch (error) {
      showError(error);
      return;
    }
    if (!items.length) {
      list.append(el('div', { class: 'gc-empty', text: t(lang, 'emptyStore') }));
      return;
    }
    for (const item of items) list.append(renderItem(item));
  };

  const renderItem = (item: { key: string; value: string }) => {
    const row = el('div', { class: 'gc-item' });
    const valueButton = el('button', { class: 'gc-val', type: 'button', text: payloadLabel(item.value) });
    valueButton.addEventListener('click', () => beginEdit(item, valueButton));
    const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
    bindCopy(copy, () => item.value, lang);
    const remove = el('button', { class: 'gc-icon', type: 'button', text: t(lang, 'delete') });
    remove.addEventListener('click', () => {
      try {
        removeKey(area, item.key);
        renderItems();
      } catch (error) {
        showError(error);
      }
    });
    row.append(el('span', { class: 'gc-key', text: item.key }), valueButton, copy, remove);
    return row;
  };

  const beginEdit = (item: { key: string; value: string }, valueButton: HTMLButtonElement) => {
    const input = el('input', { class: 'gc-inline', type: 'text' }) as HTMLInputElement;
    input.value = item.value;
    valueButton.replaceWith(input);
    input.focus();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      try {
        writeArea(area, item.key, input.value);
        renderItems();
      } catch (error) {
        showError(error);
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') {
        done = true;
        renderItems();
      }
    });
    input.addEventListener('blur', commit);
  };

  plugin.on('render', (pane) => {
    const segments = el('div', { class: 'gc-seg' });
    const areas: Array<{ id: Area; label: string }> = [
      { id: 'cookie', label: t(lang, 'cookies') },
      { id: 'local', label: t(lang, 'local') },
      { id: 'session', label: t(lang, 'session') },
    ];
    for (const item of areas) {
      const button = el('button', {
        class: item.id === area ? 'active' : undefined,
        type: 'button',
        text: item.label,
      });
      button.dataset.area = item.id;
      button.addEventListener('click', () => {
        area = item.id;
        const nodes = segments.querySelectorAll('button');
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index] as HTMLButtonElement;
          node.classList.toggle('active', node.dataset.area === item.id);
        }
        renderItems();
      });
      segments.append(button);
    }

    form = el('form', { class: 'gc-form' }) as HTMLFormElement;
    form.hidden = true;
    const keyInput = el('input', { type: 'text', placeholder: t(lang, 'key') }) as HTMLInputElement;
    const valueInput = el('input', { type: 'text', placeholder: t(lang, 'value') }) as HTMLInputElement;
    keyInput.required = true;
    form.append(keyInput, valueInput, el('button', { type: 'submit', text: t(lang, 'save') }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = keyInput.value.trim();
      if (!key) return;
      try {
        writeArea(area, key, valueInput.value);
        keyInput.value = '';
        valueInput.value = '';
        form!.hidden = true;
        renderItems();
      } catch (error) {
        showError(error);
      }
    });

    errorLine = el('div', { class: 'gc-empty' });
    errorLine.hidden = true;
    list = el('div', { class: 'gc-list' });
    pane.append(segments, form, errorLine, list);
    renderItems();
  });

  plugin.on('show', () => renderItems());
  plugin.addTool(t(lang, 'refresh'), () => renderItems());
  plugin.addTool(t(lang, 'add'), () => {
    if (!form) return;
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input')?.focus();
  });
  return plugin;
}

function readArea(area: Area): { key: string; value: string }[] {
  if (area === 'cookie') return parseCookies(document.cookie).map((item) => ({ key: item.name, value: item.value }));
  const storage = area === 'local' ? localStorage : sessionStorage;
  const items: { key: string; value: string }[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key == null) continue;
    items.push({ key, value: storage.getItem(key) ?? '' });
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

function writeArea(area: Area, key: string, value: string): void {
  if (area === 'cookie') {
    writeCookie(key, value);
    return;
  }
  (area === 'local' ? localStorage : sessionStorage).setItem(key, value);
}

function removeKey(area: Area, key: string): void {
  if (area === 'cookie') {
    deleteCookie(key);
    return;
  }
  (area === 'local' ? localStorage : sessionStorage).removeItem(key);
}
