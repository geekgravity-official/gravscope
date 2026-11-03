import { t } from '../i18n';
import type { GravScopeLang } from '../types';
import './legacy-dom';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea path for insecure contexts.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function bindCopy(button: HTMLButtonElement, read: () => string, lang: GravScopeLang): void {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const original = button.textContent ?? '';
    void copyText(read()).then((ok) => {
      button.textContent = ok ? t(lang, 'copied') : t(lang, 'copyFailed');
      window.setTimeout(() => {
        if (button.isConnected && (button.textContent === t(lang, 'copied') || button.textContent === t(lang, 'copyFailed'))) {
          button.textContent = original;
        }
      }, 900);
    });
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
