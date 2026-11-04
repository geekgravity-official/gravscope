import { pagePerformanceRows } from '../core/page-performance';
import type { SystemStore } from '../core/store';
import { GravScopePlugin } from '../core/plugin';
import { t } from '../i18n';
import type { GravScopeLang } from '../types';
import { softWrapUrl } from '../format/text';
import { bindCopy, el } from '../ui/dom';

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export function createSystemPlugin(store: SystemStore, lang: GravScopeLang): GravScopePlugin {
  const plugin = new GravScopePlugin('system', t(lang, 'system'));
  let pane: HTMLElement | null = null;

  const draw = () => {
    if (!pane) return;
    pane.replaceChildren();
    const list = el('div', { class: 'gc-list' });
    for (const node of collect(lang, store)) list.append(node);
    pane.append(list);
  };

  plugin.on('render', (element) => {
    pane = element;
    draw();
    const unsubscribe = store.subscribe(draw);
    plugin.on('remove', unsubscribe);
  });
  plugin.addTool(t(lang, 'refresh'), draw);
  return plugin;
}

function collect(lang: GravScopeLang, store: SystemStore): HTMLElement[] {
  const sections: HTMLElement[] = [];
  const locationRows: Array<[string, string]> = [
    ['URL', safe(() => location.href)],
    ['Origin', safe(() => location.origin)],
    ['Path', safe(() => `${location.pathname}${location.search}${location.hash}`)],
    ['Referrer', safe(() => document.referrer)],
  ];
  const deviceRows: Array<[string, string]> = [
    ['UA', safe(() => navigator.userAgent)],
    ['Platform', safe(() => navigator.platform)],
    ['Language', safe(() => navigator.language)],
    ['Vendor', safe(() => navigator.vendor)],
    ['Cookie', safe(() => String(navigator.cookieEnabled))],
    ['Online', safe(() => String(navigator.onLine))],
  ];
  const screenRows: Array<[string, string]> = [
    ['Screen', safe(() => `${screen.width} × ${screen.height}`)],
    ['Viewport', safe(() => `${window.innerWidth} × ${window.innerHeight}`)],
    ['DPR', safe(() => String(window.devicePixelRatio || 1))],
    ['Orientation', safe(() => screen.orientation?.type ?? '')],
    ['Timezone', safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? '')],
    ['Time', safe(() => new Date().toString())],
  ];
  push(sections, t(lang, 'location'), locationRows, lang);
  push(sections, t(lang, 'device'), deviceRows, lang);
  push(sections, t(lang, 'screen'), screenRows, lang);

  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection) {
    push(sections, t(lang, 'connection'), [
      ['Type', connection.effectiveType ?? ''],
      ['Downlink', connection.downlink != null ? `${connection.downlink} Mb/s` : ''],
      ['RTT', connection.rtt != null ? `${connection.rtt} ms` : ''],
      ['Save-Data', connection.saveData != null ? String(connection.saveData) : ''],
    ], lang);
  }

  push(sections, t(lang, 'performance'), pagePerformanceRows(lang), lang);

  if (store.custom.length) {
    push(sections, t(lang, 'custom'), store.custom.map((entry) => [entry.key, entry.value]), lang);
  }
  return sections;
}

function push(sections: HTMLElement[], title: string, rows: Array<[string, string]>, lang: GravScopeLang): void {
  const items = rows.filter(([, value]) => value !== '');
  if (!items.length) return;
  const section = el('section', { class: 'gc-section' });
  section.append(el('h3', { text: title }));
  const dl = el('dl', { class: 'gc-dl' });
  for (const [key, value] of items) {
    const copy = el('button', { class: 'gc-icon gc-copy', type: 'button', text: t(lang, 'copy') });
    copy.setAttribute('aria-label', t(lang, 'copy'));
    bindCopy(copy, () => value, lang);
    const dd = el('dd');
    dd.append(el('span', { class: 'gc-dd-text', text: softWrapUrl(value) }), copy);
    dl.append(el('dt', { text: key }), dd);
  }
  section.append(dl);
  sections.push(section);
}

function safe(read: () => string): string {
  try {
    return read() ?? '';
  } catch {
    return '';
  }
}
