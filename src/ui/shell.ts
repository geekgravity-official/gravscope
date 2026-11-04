import type { GravScopePlugin, ToolButton } from '../core/plugin';
import { t } from '../i18n';
import type { GravScopeLang, GravScopeTheme } from '../types';
import { clamp, el } from './dom';
import { keyboardOverlap } from './keyboard';
import { createBrandIcon } from './brand';
import { STYLE } from './style';

export interface ShellOptions {
  lang: GravScopeLang;
  theme: GravScopeTheme;
  entryButton: boolean;
  target: HTMLElement | string | null;
  onToggle: () => void;
  onHide: () => void;
}

const HOST_TAG = 'gravscope-root';
const CHROME_SLOP = 140;
const KEYBOARD_MIN = 150;
const ENTRY_LOCK_MS = 500;
const MASK_GUARD_MS = 800;
const DRAG_SLOP = 16;
const DOCK_MARGIN = 8;

export class Shell {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly app: HTMLElement;
  readonly panel: HTMLElement;
  private readonly mask: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly tabList: HTMLElement;
  private readonly panesEl: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly highlightLayer: HTMLElement;
  private readonly highlightBox: HTMLElement;
  private readonly highlightTag: HTMLElement;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly paneMap = new Map<string, HTMLElement>();
  private readonly plugins = new Map<string, GravScopePlugin>();
  private readonly stops: Array<() => void> = [];
  private activeId: string | null = null;
  private opened = false;
  private suppressClick = false;
  private theme: GravScopeTheme;
  private media: MediaQueryList | null = null;
  private highlightTarget: Element | null = null;
  private following = false;
  private passthrough = false;
  private destroyed = false;
  private keyboardInset = 0;
  private hostHeight = 0;
  private ignoreHideUntil = 0;
  private entryLockUntil = 0;
  private dockedBounds = '';
  private maskTimer = 0;
  private readyListener: (() => void) | null = null;
  private readonly options: ShellOptions;
  private entryButton: boolean;
  private readonly target: HTMLElement | string | null;

  constructor(options: ShellOptions) {
    this.theme = options.theme;
    this.entryButton = options.entryButton;
    this.target = options.target;
    this.options = options;
    defineHost();
    this.host = document.createElement(HOST_TAG);
    this.host.setAttribute('data-gravscope', '');
    this.host.style.cssText = [
      'display:block',
      'position:fixed',
      'top:0',
      'right:0',
      'bottom:0',
      'left:0',
      'width:100%',
      'height:100%',
      'z-index:2147483646',
      'pointer-events:none',
      'overflow:visible',
    ].join(';');
    this.root = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLE;
    this.app = el('div', { class: 'gc-app' });
    this.mask = el('div', { class: 'gc-mask' });
    this.panel = el('section', { class: 'gc-panel', role: 'dialog', 'aria-label': 'GravScope' });
    const handle = el('div', { class: 'gc-handle', 'aria-hidden': 'true' });
    const tabs = el('header', { class: 'gc-tabs' });
    this.tabList = el('div', { class: 'gc-tablist', role: 'tablist' });
    const close = el('button', { class: 'gc-close', type: 'button', 'aria-label': t(options.lang, 'close'), text: '✕' });
    const size = el('button', { class: 'gc-size', type: 'button', text: '⛶', 'aria-label': t(options.lang, 'expand'), title: t(options.lang, 'expand'), 'aria-pressed': 'false' });
    size.addEventListener('click', () => {
      const full = this.panel.classList.toggle('gc-fullscreen');
      size.setAttribute('aria-pressed', String(full));
      size.setAttribute('aria-label', t(options.lang, full ? 'collapse' : 'expand'));
      size.title = t(options.lang, full ? 'collapse' : 'expand');
      size.textContent = full ? '⊟' : '⛶';
      this.placeAboveKeyboard();
    });
    tabs.append(this.tabList, size, close);
    this.panesEl = el('div', { class: 'gc-panes' });
    this.toolbar = el('footer', { class: 'gc-tools' });
    this.toolbar.hidden = true;
    this.panel.append(handle, tabs, this.panesEl, this.toolbar);

    this.button = el('button', { class: 'gc-switch', type: 'button', 'aria-label': t(options.lang, 'open') });
    this.button.append(createBrandIcon(), el('span', { class: 'gc-brand-name', text: 'GravScope' }));
    this.button.setAttribute('aria-expanded', 'false');
    this.badge = el('span', { class: 'gc-badge', text: '0' });
    this.badge.hidden = true;
    this.button.append(this.badge);
    if (!this.entryButton) this.button.hidden = true;

    this.highlightBox = el('div', { class: 'gc-hbox' });
    this.highlightTag = el('div', { class: 'gc-htag' });
    this.highlightLayer = el('div', { class: 'gc-highlight' }, [this.highlightBox, this.highlightTag]);
    this.highlightLayer.hidden = true;

    this.app.append(this.mask, this.panel, this.button, this.highlightLayer);
    this.root.append(style, this.app);
    this.applyTheme(options.theme);
    this.pinHost();
    this.bind(handle, close);
  }

  mount(onReady: () => void): void {
    const attach = () => {
      this.readyListener = null;
      if (this.destroyed) return;
      this.resolveTarget().append(this.host);
      this.pinHost();
      onReady();
    };
    if (document.body || this.target instanceof HTMLElement) {
      attach();
      return;
    }
    this.readyListener = attach;
    document.addEventListener('DOMContentLoaded', attach, false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.readyListener) document.removeEventListener('DOMContentLoaded', this.readyListener);
    for (const plugin of this.plugins.values()) {
      try {
        plugin.emit('remove');
      } catch {
        // Plugin cleanup should not block teardown.
      }
    }
    this.stopFollow();
    unwatchMedia(this.media, this.onMedia);
    window.clearTimeout(this.maskTimer);
    for (let index = 0; index < this.stops.length; index += 1) this.stops[index]();
    this.stops.length = 0;
    this.host.remove();
  }

  isOpen(): boolean {
    return this.opened;
  }

  show(): void {
    this.opened = true;
    this.panel.classList.add('open');
    if (!this.passthrough) this.mask.classList.add('open');
    this.button.hidden = true;
    this.button.setAttribute('aria-expanded', 'true');
    this.holdMask();
    if (this.activeId) this.plugins.get(this.activeId)?.emit('show');
    this.placeAboveKeyboard();
  }

  setPagePassthrough(enabled: boolean): void {
    this.passthrough = enabled;
    if (!this.opened) return;
    this.mask.classList.toggle('open', !enabled);
    if (enabled) this.mask.classList.remove('gc-ready');
    else if (Date.now() >= this.ignoreHideUntil) this.mask.classList.add('gc-ready');
  }

  hide(): void {
    this.toolbar.querySelector('details')?.removeAttribute('open');
    this.opened = false;
    window.clearTimeout(this.maskTimer);
    this.panel.classList.remove('open');
    this.mask.classList.remove('open', 'gc-ready');
    this.button.hidden = !this.entryButton;
    this.button.setAttribute('aria-expanded', 'false');
    this.highlight(null);
    if (this.activeId) this.plugins.get(this.activeId)?.emit('hide');
  }

  setEntryButton(visible: boolean): void {
    this.entryButton = visible;
    this.button.hidden = this.opened || !visible;
  }

  setBadge(count: number): void {
    if (count <= 0) {
      this.badge.hidden = true;
      this.badge.textContent = '0';
      return;
    }
    this.badge.hidden = false;
    this.badge.textContent = count > 99 ? '99+' : String(count);
  }

  applyTheme(theme: GravScopeTheme): void {
    this.theme = theme;
    unwatchMedia(this.media, this.onMedia);
    this.media = null;
    if (theme === 'auto' && typeof matchMedia === 'function') {
      this.media = matchMedia('(prefers-color-scheme: light)');
      watchMedia(this.media, this.onMedia);
    }
    this.paintTheme();
  }

  addTab(plugin: GravScopePlugin, activate: boolean): void {
    const tab = el('button', { class: 'gc-tab', type: 'button', role: 'tab', text: plugin.name });
    tab.dataset.id = plugin.id;
    tab.addEventListener('click', () => this.activate(plugin.id));
    this.tabList.append(tab);
    this.tabButtons.set(plugin.id, tab);

    const pane = el('div', { class: 'gc-pane' });
    pane.dataset.id = plugin.id;
    this.panesEl.append(pane);
    this.paneMap.set(plugin.id, pane);
    this.plugins.set(plugin.id, plugin);
    plugin.emit('init');
    plugin.emit('render', pane);
    if (activate) this.activate(plugin.id);
  }

  removeTab(id: string): void {
    const wasActive = this.activeId === id;
    this.tabButtons.get(id)?.remove();
    this.paneMap.get(id)?.remove();
    this.tabButtons.delete(id);
    this.paneMap.delete(id);
    this.plugins.delete(id);
    if (this.activeId === id) this.activeId = null;
    if (!wasActive) return;
    const next = this.tabButtons.keys().next().value as string | undefined;
    if (next) this.activate(next);
    else {
      this.toolbar.replaceChildren();
      this.toolbar.hidden = true;
    }
  }

  activate(id: string): void {
    if (this.activeId === id) return;
    const plugin = this.plugins.get(id);
    const pane = this.paneMap.get(id);
    if (!plugin || !pane) return;
    if (this.activeId) this.plugins.get(this.activeId)?.emit('hide');
    this.activeId = id;
    for (const [key, button] of this.tabButtons) {
      const on = key === id;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const [key, node] of this.paneMap) node.classList.toggle('active', key === id);
    this.renderTools(plugin.getTools());
    plugin.emit('show');
  }

  highlight(element: Element | null, label = ''): void {
    this.highlightTarget = element;
    if (!element) {
      this.highlightLayer.hidden = true;
      this.stopFollow();
      return;
    }
    this.highlightTag.textContent = label || element.tagName.toLowerCase();
    this.startFollow();
    this.positionHighlight();
  }

  private listen(target: EventTarget, type: string, handler: EventListener, capture = false): void {
    target.addEventListener(type, handler, capture);
    this.stops.push(() => target.removeEventListener(type, handler, capture));
  }

  private bind(handle: HTMLElement, close: HTMLButtonElement): void {
    this.mask.addEventListener('click', () => {
      if (Date.now() < this.ignoreHideUntil) return;
      this.options.onHide();
    });
    close.addEventListener('click', () => this.options.onHide());
    this.listen(document, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && this.opened) this.options.onHide();
    });
    this.listen(document, 'pointerdown', event => {
      const more = this.toolbar.querySelector<HTMLDetailsElement>('.gc-more-tools');
      if (more?.open && !event.composedPath().includes(more)) more.open = false;
    });
    this.bindEntry();
    this.bindResize(handle);
    this.bindKeyboard();
  }

  private bindEntry(): void {
    let cancelGesture: (() => void) | null = null;
    this.button.addEventListener('pointerdown', (event) => {
      const point = event as PointerEvent;
      if (point.button !== 0) return;
      if (event.cancelable) event.preventDefault();
      if (cancelGesture) cancelGesture();
      const startX = point.clientX;
      const startY = point.clientY;
      const parent = this.entryParent();
      const parentRect = parent.getBoundingClientRect();
      const rect = this.button.getBoundingClientRect();
      const hasBox = rect.width > 0 || rect.height > 0;
      const originLeft = hasBox ? rect.left - parentRect.left : this.button.offsetLeft;
      const originTop = hasBox ? rect.top - parentRect.top : this.button.offsetTop;
      let moved = false;
      const move = (ev: Event) => {
        const next = ev as PointerEvent;
        if (next.pointerId !== point.pointerId) return;
        const dx = next.clientX - startX;
        const dy = next.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
        if (!moved) {
          moved = true;
          this.button.classList.add('gc-dragging');
          this.button.classList.remove('gc-docked');
          this.button.style.transform = 'none';
          this.button.style.right = 'auto';
          this.button.style.bottom = 'auto';
        }
        const width = this.button.offsetWidth || rect.width || 140;
        const height = rect.height || this.button.offsetHeight || 40;
        const bounds = this.entryBounds(parent);
        const left = clamp(originLeft + dx, DOCK_MARGIN, Math.max(DOCK_MARGIN, bounds.width - width - DOCK_MARGIN));
        const top = clamp(originTop + dy, DOCK_MARGIN, Math.max(DOCK_MARGIN, bounds.height - height - DOCK_MARGIN));
        this.button.style.left = `${left}px`;
        this.button.style.top = `${top}px`;
      };
      const up = (ev: Event) => {
        const next = ev as PointerEvent;
        const same = next.pointerId === point.pointerId;
        end();
        if (!same) return;
        this.suppressClick = true;
        if (moved) this.dockEntry();
        else this.toggleFromEntry();
      };
      const cancel = (ev: Event) => {
        const next = ev as PointerEvent;
        const same = next.pointerId === point.pointerId;
        const shouldDock = same && moved;
        end();
        if (shouldDock) this.dockEntry();
      };
      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        if (cancelGesture === end) cancelGesture = null;
      };
      cancelGesture = end;
      window.addEventListener('pointermove', move, false);
      window.addEventListener('pointerup', up, false);
      window.addEventListener('pointercancel', cancel, false);
    });
    this.stops.push(() => {
      if (cancelGesture) cancelGesture();
    });
    this.button.addEventListener('click', () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.toggleFromEntry();
    });
  }

  private toggleFromEntry(): void {
    if (this.button.classList.contains('gc-docked')) {
      this.button.classList.remove('gc-docked');
      const bounds = this.entryBounds(this.entryParent());
      const width = this.button.offsetWidth || 140;
      const left = this.button.dataset.side === 'right' ? bounds.width - width - DOCK_MARGIN : DOCK_MARGIN;
      this.button.style.left = `${Math.max(DOCK_MARGIN, left)}px`;
      return;
    }
    const now = Date.now();
    if (now < this.entryLockUntil) return;
    this.entryLockUntil = now + ENTRY_LOCK_MS;
    this.options.onToggle();
  }

  private entryParent(): HTMLElement {
    return this.button.offsetParent instanceof HTMLElement ? this.button.offsetParent : this.app;
  }

  private entryBounds(parent: HTMLElement): { width: number; height: number } {
    return {
      width: parent.clientWidth > 0 ? parent.clientWidth : window.innerWidth,
      height: parent.clientHeight > 0 ? parent.clientHeight : window.innerHeight,
    };
  }

  private dockEntry(): void {
    const parent = this.entryParent();
    const bounds = this.entryBounds(parent);
    const expandedWidth = this.button.offsetWidth || 140;
    this.button.classList.add('gc-docked');
    const width = this.button.offsetWidth || 44;
    const height = this.button.offsetHeight || this.button.getBoundingClientRect().height || 40;
    const rawLeft = Number.parseFloat(this.button.style.left);
    const rawTop = Number.parseFloat(this.button.style.top);
    const currentLeft = Number.isFinite(rawLeft) ? rawLeft : this.button.offsetLeft;
    const currentTop = Number.isFinite(rawTop) ? rawTop : this.button.offsetTop;
    const center = currentLeft + expandedWidth / 2;
    const snapLeft = center <= bounds.width / 2 ? DOCK_MARGIN : Math.max(DOCK_MARGIN, bounds.width - width - DOCK_MARGIN);
    const snapTop = clamp(currentTop, DOCK_MARGIN, Math.max(DOCK_MARGIN, bounds.height - height - DOCK_MARGIN));
    this.button.style.right = 'auto';
    this.button.style.bottom = 'auto';
    this.button.style.transform = '';
    this.button.style.left = `${snapLeft}px`;
    this.button.style.top = `${snapTop}px`;
    this.button.dataset.side = snapLeft <= DOCK_MARGIN ? 'left' : 'right';
    this.button.classList.remove('gc-dragging');
    this.button.classList.add('gc-docked');
    const boundsKey = this.entryBounds(parent);
    this.dockedBounds = `${boundsKey.width}x${boundsKey.height}`;
  }

  private keepDock(): void {
    if (!this.button.classList.contains('gc-docked') || this.button.classList.contains('gc-dragging')) return;
    const bounds = this.entryBounds(this.entryParent());
    const key = `${bounds.width}x${bounds.height}`;
    if (key === this.dockedBounds) return;
    this.dockEntry();
  }

  private bindResize(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (event) => {
      if (!this.opened) return;
      event.preventDefault();
      const point = event as PointerEvent;
      const startY = point.clientY;
      const startHeight = this.panel.getBoundingClientRect().height;
      const move = (ev: Event) => {
        const next = ev as PointerEvent;
        const limit = window.visualViewport?.height || window.innerHeight;
        const height = clamp(startHeight + (startY - next.clientY), limit * 0.32, Math.max(limit * 0.32, limit - this.keyboardInset));
        this.panel.style.height = `${height}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move, false);
      window.addEventListener('pointerup', up, false);
      this.stops.push(up);
    });
  }

  private bindKeyboard(): void {
    const viewport = window.visualViewport;
    if (viewport) {
      this.listen(viewport, 'resize', this.placeAboveKeyboard);
      this.listen(viewport, 'scroll', this.placeAboveKeyboard);
    }
    this.listen(window, 'resize', this.placeAboveKeyboard);
    this.listen(this.app, 'focusin', (event) => {
      this.placeAboveKeyboard();
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      const scroller = target.closest('.gc-list, .gc-detail');
      if (scroller && target.scrollIntoView) target.scrollIntoView(false);
    });
  }

  private holdMask(): void {
    this.ignoreHideUntil = Date.now() + MASK_GUARD_MS;
    this.mask.classList.remove('gc-ready');
    window.clearTimeout(this.maskTimer);
    this.maskTimer = window.setTimeout(() => {
      if (this.opened && !this.passthrough) this.mask.classList.add('gc-ready');
    }, MASK_GUARD_MS);
  }

  private pinHost = (): void => {
    const next = window.innerHeight;
    if (!Number.isFinite(next) || next < 160) return;
    if (this.hostHeight !== 0 && Math.abs(next - this.hostHeight) < CHROME_SLOP) return;
    this.hostHeight = next;
    this.host.style.height = `${Math.round(next)}px`;
    this.host.style.bottom = 'auto';
  };

  private placeAboveKeyboard = (): void => {
    this.pinHost();
    const viewport = window.visualViewport;
    const raw = viewport ? keyboardOverlap(window.innerHeight, viewport.height, viewport.offsetTop) : 0;
    const inset = raw >= KEYBOARD_MIN ? raw : 0;
    this.keyboardInset = inset;
    if (!inset || !viewport) {
      if (this.panel.style.bottom) this.panel.style.bottom = '';
      if (this.panel.style.maxHeight) this.panel.style.maxHeight = '';
      if (this.panel.style.minHeight) this.panel.style.minHeight = '';
    } else {
      const available = Math.max(160, Math.round(viewport.height - 8));
      this.panel.style.bottom = `${inset}px`;
      this.panel.style.maxHeight = `${available}px`;
      this.panel.style.minHeight = available < 240 ? `${Math.max(120, available)}px` : '';
    }
    this.keepDock();
  };

  private renderTools(tools: ToolButton[]): void {
    this.toolbar.replaceChildren();
    this.toolbar.hidden = tools.length === 0;
    const more = el('details', { class: 'gc-more-tools' });
    const summary = el('summary', { class: 'gc-tool', text: this.options.lang === 'zh' ? '更多' : 'More' });
    const menu = el('div', { class: 'gc-more-menu', role: 'group', 'aria-label': this.options.lang === 'zh' ? '更多操作' : 'More actions' });
    more.append(summary, menu);
    more.addEventListener('keydown', event => {
      if (event.key === 'Escape' && more.open) {
        event.preventDefault(); event.stopPropagation(); more.open = false; summary.focus();
      }
    });
    let primary = 0;
    for (const tool of tools) {
      const overflow = tool.placement === 'more' || primary >= 3;
      const button = el('button', { class: 'gc-tool', type: 'button', text: tool.name });
      button.addEventListener('click', () => {
        if (overflow) { more.open = false; summary.focus(); }
        tool.onClick();
      });
      if (overflow) menu.append(button);
      else { this.toolbar.append(button); primary++; }
    }
    if (menu.childElementCount) this.toolbar.append(more);
  }

  private resolveTarget(): HTMLElement {
    if (this.target instanceof HTMLElement) return this.target;
    if (typeof this.target === 'string' && this.target) {
      const found = document.querySelector(this.target);
      if (found instanceof HTMLElement) return found;
      throw new Error(`GravScope target not found: ${this.target}`);
    }
    if (!document.body) throw new Error('GravScope cannot find document.body');
    return document.body;
  }

  private paintTheme = (): void => {
    const light = this.theme === 'light' || (this.theme === 'auto' && Boolean(this.media?.matches));
    this.app.dataset.theme = light ? 'light' : 'dark';
  };

  private onMedia = (): void => {
    this.paintTheme();
  };

  private positionHighlight = (): void => {
    const element = this.highlightTarget;
    if (!element || !isConnected(element)) {
      this.highlightTarget = null;
      this.highlightLayer.hidden = true;
      this.stopFollow();
      return;
    }
    const rect = element.getBoundingClientRect();
    this.highlightLayer.hidden = false;
    this.highlightBox.style.left = `${rect.left}px`;
    this.highlightBox.style.top = `${rect.top}px`;
    this.highlightBox.style.width = `${Math.max(rect.width, 1)}px`;
    this.highlightBox.style.height = `${Math.max(rect.height, 1)}px`;
    this.highlightTag.style.left = `${Math.max(8, rect.left)}px`;
    this.highlightTag.style.top = `${Math.max(8, rect.top - 22)}px`;
  };

  private startFollow(): void {
    if (this.following) return;
    this.following = true;
    window.addEventListener('scroll', this.positionHighlight, true);
    window.addEventListener('resize', this.positionHighlight);
  }

  private stopFollow(): void {
    if (!this.following) return;
    this.following = false;
    window.removeEventListener('scroll', this.positionHighlight, true);
    window.removeEventListener('resize', this.positionHighlight);
  }
}

function watchMedia(media: MediaQueryList, handler: () => void): void {
  const list = media as MediaQueryList & { addListener?: (listener: () => void) => void };
  if (typeof list.addEventListener === 'function') list.addEventListener('change', handler);
  else if (list.addListener) list.addListener(handler);
}

function unwatchMedia(media: MediaQueryList | null, handler: () => void): void {
  if (!media) return;
  const list = media as MediaQueryList & { removeListener?: (listener: () => void) => void };
  if (typeof list.removeEventListener === 'function') list.removeEventListener('change', handler);
  else if (list.removeListener) list.removeListener(handler);
}

function isConnected(element: Element): boolean {
  const candidate = element as Element & { isConnected?: boolean };
  if (typeof candidate.isConnected === 'boolean') return candidate.isConnected;
  const doc = element.ownerDocument;
  return Boolean(doc && doc.contains(element));
}

function defineHost(): void {
  if (typeof customElements === 'undefined' || customElements.get(HOST_TAG)) return;
  customElements.define(HOST_TAG, class GravScopeRoot extends HTMLElement {});
}
