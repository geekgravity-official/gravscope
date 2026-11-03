import { installConsoleHook, installErrorHook } from '../capture/console';
import { installNetworkHook } from '../capture/network';
import { createElementPlugin } from '../plugins/element';
import { createLogPlugin } from '../plugins/log';
import { createNetworkPlugin } from '../plugins/network';
import { createStoragePlugin } from '../plugins/storage';
import { createSystemPlugin } from '../plugins/system';
import type { BuiltinPlugin, GravScopeLang, GravScopeOptions, GravScopeTheme, ResolvedOptions } from '../types';
import { VERSION } from '../version';
import { GravScopePlugin } from './plugin';
import { LogStore, NetStore, SystemStore } from './store';
import { captureReport, type DiagnosticReport, type ReportOptions } from '../report/snapshot';
import { showReportDialog } from '../report/dialog';
import { Shell } from '../ui/shell';

const BUILTINS: BuiltinPlugin[] = ['network', 'element', 'storage', 'system'];

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
      this.watchUnread();
      this.unhooks.push(installConsoleHook(this.logStore));
      this.unhooks.push(installNetworkHook(this.netStore));
      this.unhooks.push(installErrorHook(this.logStore));
      const logPlugin = createLogPlugin(this.logStore, this.options.lang, (code) => this.runCommand(code));
      if (this.options.exportEnabled) {
        logPlugin.addTool(this.options.lang === 'zh' ? '导出' : 'Export', () => {
          showReportDialog(this.shell.panel, this.options.lang, (options) => this.getReport(options));
        });
      }
      logPlugin.addTool(this.options.lang === 'zh' ? '刷新页面' : 'Reload page', () => window.location.reload());
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

  setOption(key: 'theme', value: GravScopeTheme): void;
  setOption(key: 'maxLogNumber' | 'maxNetworkNumber', value: number): void;
  setOption(key: 'theme' | 'maxLogNumber' | 'maxNetworkNumber', value: GravScopeTheme | number): void {
    if (this.destroyed) return;
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
    return captureReport(this.logStore, this.netStore, this.systemStore, options);
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
