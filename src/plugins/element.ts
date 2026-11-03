import { GravScopePlugin } from '../core/plugin';
import { t } from '../i18n';
import type { GravScopeLang } from '../types';
import { payloadLabel } from '../format/payload';
import { bindCopy, el } from '../ui/dom';

interface ElementHooks {
  highlight: (element: Element, label: string) => void;
  clearHighlight: () => void;
  getHost: () => HTMLElement | null;
  setPassthrough: (enabled: boolean) => void;
}

interface RowEntry {
  row: HTMLElement;
  line: HTMLButtonElement;
  caret: HTMLElement;
  childBox: HTMLElement;
  node: Node;
}

export function createElementPlugin(lang: GravScopeLang, hooks: ElementHooks): GravScopePlugin {
  const plugin = new GravScopePlugin('element', t(lang, 'element'));
  const registry = new Map<Node, RowEntry>();
  let tree: HTMLElement | null = null;
  let banner: HTMLElement | null = null;
  let picking = false;

  const isInternal = (node: Node) => {
    const host = hooks.getHost();
    return node === host || (node instanceof Element && node.localName === 'gravscope-root');
  };

  const countable = (node: Node) => {
    const children = node.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (isInternal(child)) continue;
      if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim()) return true;
      if (child.nodeType === Node.ELEMENT_NODE) return true;
    }
    return false;
  };

  const fillChildren = (entry: RowEntry) => {
    entry.childBox.dataset.filled = '1';
    entry.childBox.replaceChildren();
    let shown = 0;
    let skipped = 0;
    const children = entry.node.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.nodeType === Node.COMMENT_NODE) continue;
      if (child.nodeType === Node.TEXT_NODE && !(child.textContent || '').trim()) continue;
      if (isInternal(child)) continue;
      if (shown >= 300) {
        skipped += 1;
        continue;
      }
      entry.childBox.append(createRow(child));
      shown += 1;
    }
    if (skipped) entry.childBox.append(el('div', { class: 'gc-nil', text: `… +${skipped}` }));
  };

  const openNode = (node: Node) => {
    const entry = registry.get(node);
    if (!entry || entry.caret.dataset.empty === '1') return;
    entry.childBox.hidden = false;
    entry.caret.textContent = '▾';
    if (!entry.childBox.dataset.filled) fillChildren(entry);
  };

  const select = (element: Element, entry: RowEntry) => {
    for (const item of registry.values()) item.line.classList.remove('selected');
    entry.line.classList.add('selected');
    hooks.highlight(element, nodeLabel(element));
    if (entry.line.scrollIntoView) entry.line.scrollIntoView(false);
  };

  const reveal = (target: Element) => {
    if (!registry.has(document.documentElement)) rebuild();
    const chain: Node[] = [];
    let current: Node | null = target;
    while (current && current !== document) {
      chain.push(current);
      current = current.parentNode;
    }
    chain.reverse();
    for (const node of chain) {
      if (!registry.has(node) && node.parentNode) openNode(node.parentNode);
      openNode(node);
    }
    const entry = registry.get(target);
    if (entry) select(target, entry);
  };

  const createRow = (node: Node): HTMLElement => {
    const row = el('div', { class: 'gc-node' });
    const line = el('button', { class: 'gc-node-line', type: 'button' });
    const caret = el('span', { class: 'gc-caret', text: '▸' });
    line.append(caret, el('span', { class: 'gc-tag', text: nodeLabel(node) }));
    if (node instanceof Element) {
      let extra = 0;
      const attrs = node.attributes;
      for (let index = 0; index < attrs.length; index += 1) {
        const attr = attrs[index];
        if (attr.name === 'id' || attr.name === 'class') continue;
        if (extra >= 3) break;
        const shown = payloadLabel(attr.value);
        const value = shown === attr.value && shown.length > 80 ? `${shown.slice(0, 80)}…` : shown;
        line.append(el('span', { class: 'gc-attr', text: `${attr.name}="${value}"` }));
        extra += 1;
      }
    }
    const childBox = el('div', { class: 'gc-children' });
    childBox.hidden = true;
    if (!countable(node)) {
      caret.textContent = '';
      caret.dataset.empty = '1';
    }
    const head = el('div', { class: 'gc-node-head' });
    head.append(line);
    if (node instanceof Element) {
      const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
      copy.setAttribute('aria-label', t(lang, 'copy'));
      bindCopy(copy, () => selectorPath(node), lang);
      head.append(copy);
    }
    const entry: RowEntry = { row, line, caret, childBox, node };
    registry.set(node, entry);
    line.addEventListener('click', () => {
      if (caret.dataset.empty !== '1') {
        if (childBox.hidden) openNode(node);
        else {
          childBox.hidden = true;
          caret.textContent = '▸';
        }
      }
      const element = node instanceof Element ? node : node.parentElement;
      if (element && !isInternal(element)) select(element, entry);
    });
    row.append(head, childBox);
    return row;
  };

  const rebuild = () => {
    if (!tree) return;
    registry.clear();
    tree.replaceChildren();
    const root = document.documentElement;
    if (!root) return;
    tree.append(createRow(root));
    openNode(root);
    if (document.body) openNode(document.body);
  };

  const onPick = (event: Event) => {
    if (!picking) return;
    const mouse = event as MouseEvent;
    const path = typeof mouse.composedPath === 'function' ? mouse.composedPath() : [];
    const host = hooks.getHost();
    if (host && path.includes(host)) return;
    mouse.preventDefault();
    mouse.stopPropagation();
    const target = mouse.target;
    if (!(target instanceof Element) || isInternal(target)) return;
    stopPicking();
    reveal(target);
  };

  const stopPicking = () => {
    picking = false;
    if (banner) banner.hidden = true;
    hooks.setPassthrough(false);
  };

  plugin.on('render', (pane) => {
    banner = el('div', { class: 'gc-banner', text: t(lang, 'pickHint') });
    banner.hidden = true;
    tree = el('div', { class: 'gc-list' });
    pane.append(banner, tree);
    rebuild();
    document.addEventListener('click', onPick, true);
  });

  plugin.on('hide', stopPicking);
  plugin.on('remove', () => {
    document.removeEventListener('click', onPick, true);
    hooks.clearHighlight();
    stopPicking();
  });

  plugin.addTool(t(lang, 'refresh'), () => rebuild());
  plugin.addTool(t(lang, 'select'), () => {
    picking = !picking;
    if (banner) banner.hidden = !picking;
    hooks.setPassthrough(picking);
    if (!picking) hooks.clearHighlight();
  });
  return plugin;
}

function classSuffix(list: DOMTokenList): string {
  const names: string[] = [];
  const count = Math.min(list.length, 2);
  for (let index = 0; index < count; index += 1) {
    const name = list.item(index);
    if (name) names.push(`.${name}`);
  }
  return names.join('');
}

function selectorPath(node: Element): string {
  const parts: string[] = [];
  let current: Element | null = node;
  while (current) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`${part}#${cssEscape(current.id)}`);
      break;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const siblings = parent.children;
      let count = 0;
      let index = 0;
      for (let cursor = 0; cursor < siblings.length; cursor += 1) {
        if (siblings[cursor].tagName !== current.tagName) continue;
        count += 1;
        if (siblings[cursor] === current) index = count;
      }
      if (count > 1) part += `:nth-of-type(${index})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function nodeLabel(node: Node): string {
  if (node instanceof Element) {
    const id = node.id ? `#${node.id}` : '';
    const classes = classSuffix(node.classList);
    return `${node.tagName.toLowerCase()}${id}${classes}`;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    const shown = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return `#text "${shown}"`;
  }
  return node.nodeName.toLowerCase();
}
