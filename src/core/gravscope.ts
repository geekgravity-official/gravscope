import { ExportTask } from '../report/export-task';
import { ActivityStore } from './activity';
import { installNavigation, installLongTasks } from '../capture/activity';
import { installRealtime } from '../capture/realtime';
import { createDiagnosticsPlugin } from '../plugins/diagnostics';
import { installConsoleHook, installErrorHook } from '../capture/console';
import { installNetworkHook } from '../capture/network';
import { createElementPlugin } from '../plugins/element';
import { createLogPlugin } from '../plugins/log';
import { createNetworkPlugin } from '../plugins/network';
import { createStoragePlugin } from '../plugins/storage';
import { createErrorsPlugin } from '../plugins/errors';
import { el } from '../ui/dom';
import { createSystemPlugin } from '../plugins/system';
import type { BuiltinPlugin, CaptureOptions, CaptureStatusMap, GravScopeLang, GravScopeOptions, GravScopeTheme, ResolvedOptions } from '../types';
import { LogHistory } from './log-history';
import { VERSION } from '../version';
import { GravScopePlugin } from './plugin';
import { LogStore, NetStore, SystemStore } from './store';
import { captureReport, type DiagnosticReport, type ReportOptions } from '../report/snapshot';
import { showReportDialog } from '../report/dialog';
import { Shell } from '../ui/shell';

const BUILTINS: BuiltinPlugin[] = ['network', 'errors', 'element', 'storage', 'system', 'timeline', 'performance', 'streams'];

export class GravScope {
  static current: GravScope | null = null;
  static readonly version = VERSION;
  static readonly Plugin = GravScopePlugin;
  readonly version = VERSION;

  private readonly options: ResolvedOptions;
  private readonly logStore = new LogStore();
  private readonly netStore = new NetStore();
  private readonly systemStore = new SystemStore();
  private readonly shell: Shell;
  private readonly plugins: GravScopePlugin[] = [];
  private readonly unhooks: Array<() => void> = [];
  private capture: CaptureOptions = { console: false, network: false, error: false, navigation: false, performance: false, realtime: false };
  private captureStops = new Map<keyof CaptureOptions, () => void>();
  private readonly activity = new ActivityStore();
  private networkIgnore: string[] = [];
  private redactKeys: string[] = [];
  private timeline?: ReturnType<typeof createDiagnosticsPlugin>;
  private readonly exportTask = new ExportTask();
  private readonly captureUnavailable = new Set<keyof CaptureOptions>();
  private readonly captureFailures = new Map<keyof CaptureOptions, string>();
  private history?: LogHistory;
  private unread = 0;
  private destroyed = false;

  constructor(options: GravScopeOptions = {}) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('GravScope can only run in a browser.');
    }
    if (GravScope.current) {
      throw new Error('GravScope is already active. Call destroy() before creating another one.');
    }
    this.options = resolveOptions(options);
    this.networkIgnore = rules(options.networkIgnore);
    this.redactKeys = rules(options.redactKeys);
    this.netStore.shouldCapture = url => !this.networkIgnore.some(part => url.includes(part));
    this.logStore.setMax(this.options.maxLogNumber);
    this.netStore.setMax(this.options.maxNetworkNumber);
    this.shell = new Shell({
      lang: this.options.lang,
      theme: this.options.theme,
      entryButton: this.options.entryButton,
      target: this.options.target,
      onToggle: () => this.toggle(),
      onHide: () => this.hide(),
    });
    GravScope.current = this;
    try {
      this.history = new LogHistory(this.logStore, options.preserveLogs, this.options.lang, () => this.redactKeys);
      this.watchUnread();
      this.configureCapture({ console: options.capture?.console !== false, network: options.capture?.network !== false, error: options.capture?.error !== false, navigation: options.capture?.navigation !== false, performance: options.capture?.performance !== false, realtime: options.capture?.realtime !== false }, true);
      const logPlugin = createLogPlugin(this.logStore, this.options.lang, (code) => this.runCommand(code), this.history);
      if (this.options.exportEnabled) {
        logPlugin.addTool(this.options.lang === 'zh' ? '导出' : 'Export', () => {
          showReportDialog(this.shell.panel, this.options.lang, (options) => this.getReport(options), this.options.onExport, this.exportTask);
        }, { placement: 'more' });
      }
      logPlugin.addTool(this.options.lang === 'zh' ? '刷新页面' : 'Reload page', () => { this.history?.flush(); window.location.reload(); }, { placement: 'more' });
      logPlugin.addTool(this.options.lang === 'zh' ? '采集设置' : 'Capture settings', () => this.showCaptureSettings(), { placement: 'more' });
      logPlugin.addTool(this.options.lang === 'zh' ? '清空全部诊断数据' : 'Clear all diagnostics', () => {
        if (window.confirm(this.options.lang === 'zh' ? '清空日志、请求、活动和自定义系统信息？不会删除业务存储或取消已交给应用的导出。' : 'Clear logs, requests, activity and custom system info? Application storage and handed-off exports are not affected.')) this.clearAll();
      }, { placement: 'more' });
      this.addPlugin(logPlugin);
      for (const name of this.options.defaultPlugins) this.addPlugin(this.createBuiltin(name));
      this.shell.mount(() => this.ready());
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  show(): void {
    if (this.destroyed) return;
    this.unread = 0;
    this.shell.setBadge(0);
    this.shell.show();
  }

  hide(): void {
    if (this.destroyed) return;
    this.shell.hide();
  }

  showTab(id: string): void {
    if (this.destroyed) return;
    this.shell.activate(id);
    this.show();
  }

  setOption(key: 'networkIgnore' | 'redactKeys', value: string[]): void;
  setOption(key: 'capture', value: Partial<CaptureOptions>): void;
  setOption(key: 'entryButton' | 'preserveLogs', value: boolean): void;
  setOption(key: 'theme', value: GravScopeTheme): void;
  setOption(key: 'maxLogNumber' | 'maxNetworkNumber', value: number): void;
  setOption(key: 'theme' | 'maxLogNumber' | 'maxNetworkNumber' | 'entryButton' | 'preserveLogs' | 'capture' | 'networkIgnore' | 'redactKeys', value: GravScopeTheme | number | boolean | Partial<CaptureOptions> | string[]): void {
    if (this.destroyed) return;
    if (key === 'networkIgnore' || key === 'redactKeys') {
      if (Array.isArray(value)) { this[key] = rules(value); if (key === 'redactKeys') this.history?.flush(); }
      return;
    }
    if (key === 'capture') {
      if (value && typeof value === 'object' && !Array.isArray(value)) this.configureCapture(value);
      return;
    }
    if (key === 'preserveLogs') {
      if (typeof value === 'boolean') this.history?.setEnabled(value);
      return;
    }
    if (key === 'entryButton') {
      if (typeof value === 'boolean') {
        this.options.entryButton = value;
        this.shell.setEntryButton(value);
      }
      return;
    }
    if (key === 'theme') {
      if (value === 'light' || value === 'dark' || value === 'auto') {
        this.options.theme = value;
        this.shell.applyTheme(value);
      }
      return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (key === 'maxLogNumber') {
      this.options.maxLogNumber = value;
      this.logStore.setMax(value);
      return;
    }
    this.options.maxNetworkNumber = value;
    this.netStore.setMax(value);
  }

  getReport(options: ReportOptions = {}): DiagnosticReport {
    return captureReport(this.logStore, this.netStore, this.systemStore, { ...options, redactKeys: [...this.redactKeys, ...(options.redactKeys ?? [])] }, this.activity);
  }

  getCaptureStatus(): CaptureStatusMap {
    const zh = this.options.lang === 'zh';
    const coverage: Record<keyof CaptureOptions, string> = {
      console: zh ? '仅接管后经过当前页面 console 的调用；无法恢复更早日志。' : 'Current-page console calls after hook installation; earlier calls are unavailable.',
      network: zh ? '仅当前页面可观察的请求；跨域正文/时序可能受限，不采集 fetch 流正文。' : 'Observable current-page requests; cross-origin bodies/timing may be restricted. Fetch streaming bodies are excluded.',
      error: zh ? '当前页面运行时、Promise 与资源错误；不覆盖 worker/其他 frame。' : 'Current-page runtime, promise and resource errors; workers/other frames are excluded.',
      navigation: zh ? '当前 URL 与之后的 SPA 路由变化；不是操作录像。' : 'Current URL and subsequent SPA routes; not an interaction recording.',
      performance: zh ? '仅浏览器支持的长任务；包含面板自身开销，不代表完整性能数据。' : 'Browser-supported long tasks only; includes panel overhead, not a complete performance trace.',
      realtime: (zh ? '仅接管后新建连接：' : 'New connections after installation only: ') + [typeof window.WebSocket === 'function' ? 'WebSocket' : '', typeof window.EventSource === 'function' ? 'EventSource' : ''].filter(Boolean).join(', ') + (zh ? '。不含既有连接、worker 或 fetch SSE 正文。' : '. Existing connections, workers and fetch SSE bodies are excluded.'),
    };
    const result = {} as CaptureStatusMap;
    for (const key of Object.keys(this.capture) as (keyof CaptureOptions)[]) {
      const state = this.destroyed ? 'disabled' : this.captureFailures.has(key) ? 'failed' : this.captureUnavailable.has(key) ? 'unavailable' : this.capture[key] ? 'enabled' : 'disabled';
      result[key] = { state, enabled: state === 'enabled', detail: this.captureFailures.get(key) ?? coverage[key] };
    }
    return result;
  }

  /** Clear retained diagnostics and persisted log records, without changing capture or page storage. */
  clearAll(): void {
    if (this.destroyed) return;
    this.shell.panel.querySelector<HTMLElement>('.gc-report:not(.gc-capture-settings) .gc-report-head button')?.click();
    this.logStore.clear(); this.netStore.clear(); this.activity.clear(); this.systemStore.clear();
  }

  setSystemInfo(key: string, value: string): void {
    if (this.destroyed) return;
    this.systemStore.set(key, value);
  }

  addPlugin(plugin: GravScopePlugin): void {
    if (this.destroyed) return;
    if (this.plugins.some((item) => item.id === plugin.id)) {
      throw new Error(`GravScope plugin "${plugin.id}" already exists`);
    }
    const channels: Record<string, string> = { log: 'console,error', network: 'network', errors: 'error,console', timeline: 'console,network,navigation', performance: 'performance,network', streams: 'realtime' };
    if (channels[plugin.id]) {
      plugin.on('render', pane => { const status = el('p', { class: 'gc-meta gc-capture-summary', 'data-capture-summary': channels[plugin.id], role: 'status' }); pane.insertBefore(status, pane.firstChild); this.syncCaptureSettings(); });
      plugin.on('show', () => this.syncCaptureSettings());
    }
    this.plugins.push(plugin);
    this.shell.addTab(plugin, this.plugins.length === 1);
  }

  removePlugin(id: string): void {
    const index = this.plugins.findIndex((plugin) => plugin.id === id);
    if (index < 0) return;
    const [plugin] = this.plugins.splice(index, 1);
    try {
      plugin.emit('remove');
    } finally {
      this.shell.removeTab(id);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.exportTask.destroy();
    this.history?.destroy();
    for (const stop of this.captureStops.values()) { try { stop(); } catch { /* Continue teardown. */ } }
    this.captureStops.clear();
    if (GravScope.current === this) GravScope.current = null;
    for (const unhook of this.unhooks) {
      try {
        unhook();
      } catch {
        // Keep tearing down the remaining hooks.
      }
    }
    this.unhooks.length = 0;
    try {
      this.shell.destroy();
    } catch {
      // The host is still removed by the browser if teardown throws.
    }
  }

  private configureCapture(options: Partial<CaptureOptions>, initial = false): void {
    for (const key of ['console', 'network', 'error', 'navigation', 'performance', 'realtime'] as const) {
      const enabled = options[key];
      if (typeof enabled !== 'boolean') continue;
      if (!enabled) { this.captureFailures.delete(key); this.captureUnavailable.delete(key); }
      if (enabled === this.capture[key]) continue;
      const available = key === 'performance' ? typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')
        : key === 'realtime' ? typeof window.WebSocket === 'function' || typeof window.EventSource === 'function' : true;
      if (enabled && !available) { this.captureUnavailable.add(key); continue; }
      this.captureUnavailable.delete(key);
      if (enabled) {
        try {
        const stop = key === 'console' ? installConsoleHook(this.logStore) : key === 'network' ? installNetworkHook(this.netStore, initial) : key === 'error' ? installErrorHook(this.logStore) : key === 'navigation' ? installNavigation(this.activity) : key === 'performance' ? installLongTasks(this.activity) : installRealtime(this.activity, url => this.netStore.shouldCapture(url));
        this.captureStops.set(key, stop);
        this.captureFailures.delete(key);
        } catch {
          this.captureFailures.set(key, this.options.lang === 'zh' ? '接口不可用或不允许接管；本通道已停用，可再次勾选重试。' : 'Unavailable or protected API; channel disabled. Enable again to retry.');
          this.logStore.append({ level: 'warn', args: [`GravScope: ${key} capture unavailable`] });
          continue;
        }
      } else {
        try { this.captureStops.get(key)?.(); } catch {
          this.captureFailures.set(key, this.options.lang === 'zh' ? '部分接口无法恢复，请在销毁后刷新页面。' : 'Some interfaces could not be restored. Reload after destroying the panel.');
        }
        this.captureStops.delete(key);
        if (key === 'console') this.logStore.resetGroups();
        if (key === 'network') for (const record of this.netStore.items) {
          if (!record.pending) continue;
          record.pending = false;
          record.statusText = 'Capture stopped';
          record.endTime = Date.now();
          record.duration = Math.max(0, record.endTime - record.startTime);
          this.netStore.update(record);
        }
      }
      this.capture[key] = enabled;
    }
    this.syncCaptureSettings();
  }

  private syncCaptureSettings(): void {
    for (const checkbox of this.shell.panel.querySelectorAll<HTMLInputElement>('[data-capture]')) checkbox.checked = this.capture[checkbox.dataset.capture as keyof CaptureOptions];
    const statuses = this.getCaptureStatus();
    const labels = this.options.lang === 'zh' ? { enabled: '采集中', disabled: '已停用', unavailable: '当前环境不支持', failed: '启用失败' } : { enabled: 'Capturing', disabled: 'Disabled', unavailable: 'Unavailable in this environment', failed: 'Capture failed' };
    for (const node of this.shell.panel.querySelectorAll<HTMLElement>('[data-capture-status]')) {
      const status = statuses[node.dataset.captureStatus as keyof CaptureOptions];
      node.textContent = `${labels[status.state]} · ${status.detail}`;
    }
    for (const node of this.shell.panel.querySelectorAll<HTMLElement>('[data-capture-summary]')) {
      const keys = node.dataset.captureSummary!.split(',') as (keyof CaptureOptions)[];
      node.textContent = keys.map(key => `${key}: ${labels[statuses[key].state]}`).join(' · ');
      node.title = keys.map(key => statuses[key].detail).join('\n');
      if (keys.includes('realtime')) node.textContent += this.options.lang === 'zh' ? ' · 仅新建连接' : ' · New connections only';
    }
  }

  private showCaptureSettings(): void {
    if (this.shell.panel.querySelector('.gc-capture-settings')) return;
    const dialog = el('section', { class: 'gc-report gc-capture-settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.options.lang === 'zh' ? '采集设置' : 'Capture settings' });
    const close = el('button', { class: 'gc-tool', type: 'button', text: this.options.lang === 'zh' ? '关闭' : 'Close' });
    const previous = this.shell.panel.getRootNode() instanceof ShadowRoot ? (this.shell.panel.getRootNode() as ShadowRoot).activeElement as HTMLElement | null : null;
    const dismiss = () => { dialog.remove(); previous?.focus(); };
    close.addEventListener('click', dismiss);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
      if (event.key === 'Tab') {
        const nodes = [...dialog.querySelectorAll<HTMLElement>('button, input')];
        const active = (dialog.getRootNode() as ShadowRoot).activeElement;
        if (event.shiftKey && active === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && active === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }
    });
    dialog.append(close, el('p', { text: this.options.lang === 'zh' ? '关闭采集不会删除已有记录，也不会中断页面请求。重新开启后采集新活动。' : 'Disabling capture retains records and does not abort page requests. Re-enable to capture new activity.' }));
    for (const key of ['console', 'network', 'error', 'navigation', 'performance', 'realtime'] as const) {
      const input = el('input', { type: 'checkbox', 'data-capture': key });
      input.checked = this.capture[key];
      input.addEventListener('change', () => this.configureCapture({ [key]: input.checked }));
      const status = el('span', { 'data-capture-status': key, role: 'status' });
      dialog.append(el('label', {}, [input, { console: 'Console', network: 'Network', error: 'Errors', navigation: 'Navigation', performance: 'Long tasks', realtime: 'WebSocket / SSE' }[key], status]));
    }
    this.shell.panel.append(dialog);
    this.syncCaptureSettings();
    close.focus();
  }

  private toggle(): void {
    if (this.shell.isOpen()) this.hide();
    else this.show();
  }

  private ready(): void {
    if (this.destroyed) return;
    try {
      this.options.onReady?.();
    } catch (error) {
      this.logStore.append({ level: 'error', args: [error] });
    }
  }

  private watchUnread(): void {
    this.logStore.subscribe((event) => {
      if (this.destroyed) return;
      if (event.type === 'clear') {
        this.unread = 0;
        this.shell.setBadge(0);
        return;
      }
      if (this.shell.isOpen()) return;
      if (event.type === 'add' || event.type === 'update') {
        this.unread += 1;
        this.shell.setBadge(this.unread);
      }
    });
  }

  private runCommand(code: string): void {
    try {
      const result = globalThis.eval(code) as unknown;
      this.logStore.append({ level: 'log', args: [result], kind: 'command', command: code });
    } catch (error) {
      this.logStore.append({ level: 'error', args: [error], kind: 'command', command: code });
    }
  }

  private createBuiltin(name: BuiltinPlugin): GravScopePlugin {
    if (name === 'timeline' || name === 'performance' || name === 'streams') {
      const plugin = createDiagnosticsPlugin(name, this.logStore, this.netStore, this.activity, this.options.lang);
      if (name === 'timeline') this.timeline = plugin;
      return plugin;
    }
    if (name === 'errors') return createErrorsPlugin(this.logStore, this.options.lang, time => {
      if (!this.plugins.some(plugin => plugin.id === 'timeline')) this.addPlugin(this.createBuiltin('timeline'));
      this.timeline?.focus(time); this.showTab('timeline');
    });
    if (name === 'system') return createSystemPlugin(this.systemStore, this.options.lang);
    if (name === 'network') return createNetworkPlugin(this.netStore, this.options.lang);
    if (name === 'storage') return createStoragePlugin(this.options.lang);
    return createElementPlugin(this.options.lang, {
      highlight: (element, label) => this.shell.highlight(element, label),
      clearHighlight: () => this.shell.highlight(null),
      getHost: () => this.shell.host,
      setPassthrough: (enabled) => this.shell.setPagePassthrough(enabled),
    });
  }
}

function resolveOptions(options: GravScopeOptions): ResolvedOptions {
  const lang = options.lang ?? detectLang();
  const requested = options.defaultPlugins ?? BUILTINS;
  return {
    theme: options.theme ?? 'auto',
    lang,
    defaultPlugins: [...new Set(requested)].filter((name): name is BuiltinPlugin => BUILTINS.includes(name)),
    maxLogNumber: positive(options.maxLogNumber, 1000),
    maxNetworkNumber: positive(options.maxNetworkNumber, 200),
    entryButton: options.entryButton !== false,
    exportEnabled: options.exportEnabled !== false,
    target: options.target ?? null,
    onReady: options.onReady,
    onExport: options.onExport,
  };
}

function detectLang(): GravScopeLang {
  const lang = navigator.language?.toLowerCase() ?? '';
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function positive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function rules(value: unknown): string[] { return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string' && part.length > 0 && part.length <= 100).slice(0, 100) : []; }
