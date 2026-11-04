export type GravScopeTheme = 'light' | 'dark' | 'auto';
export type GravScopeLang = 'zh' | 'en';
export type BuiltinPlugin = 'system' | 'network' | 'element' | 'storage' | 'errors' | 'timeline' | 'performance' | 'streams';
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface CaptureOptions { console: boolean; network: boolean; error: boolean; navigation: boolean; performance: boolean; realtime: boolean; }

export interface CaptureStatus {
  enabled: boolean;
  state: 'enabled' | 'disabled' | 'unavailable' | 'failed';
  /** Localized coverage and diagnostic explanation. */
  detail: string;
}
export type CaptureStatusMap = Record<keyof CaptureOptions, CaptureStatus>;

export interface ExportFile {
  /** Unique handoff identifier; cancellation of waiting does not cancel native work. */
  requestId: string;
  filename: string;
  mimeType: string;
  format: 'html' | 'json';
  /** UTF-8 text content; already passed through report sanitization. */
  content: string;
}
export type ExportHandler = (file: ExportFile) => void | Promise<void>;

export interface GravScopeOptions {
  /** Individual capture channels; all enabled by default. */
  capture?: Partial<CaptureOptions>;
  /** Exclude URLs containing any of these nonempty, case-sensitive strings. Applies to future records. */
  networkIgnore?: string[];
  /** Extra exact field names (case-insensitive) to mask in reports and persisted logs. */
  redactKeys?: string[];
  /** Panel color. `auto` follows the system preference. */
  theme?: GravScopeTheme;
  /** `zh` or `en`. Defaults to the browser language. */
  lang?: GravScopeLang;
  /** Built-in panels besides Log, which is always included. */
  defaultPlugins?: BuiltinPlugin[];
  /** Preserve sanitized logs in sessionStorage across reloads. Defaults to off; remembers the session toggle. */
  preserveLogs?: boolean;
  maxLogNumber?: number;
  maxNetworkNumber?: number;
  /** Show the floating GC button. Defaults to true. */
  entryButton?: boolean;
  /** Show the report export UI. Defaults to true; getReport() remains available. */
  exportEnabled?: boolean;
  /** Mount point. Defaults to document.body. */
  target?: HTMLElement | string | null;
  /** Take over HTML/JSON export. Throw or reject on failure; no automatic download fallback. */
  onExport?: ExportHandler;
  onReady?: () => void;
}

export interface ResolvedOptions {
  theme: GravScopeTheme;
  lang: GravScopeLang;
  defaultPlugins: BuiltinPlugin[];
  maxLogNumber: number;
  maxNetworkNumber: number;
  entryButton: boolean;
  exportEnabled: boolean;
  target: HTMLElement | string | null;
  /** Take over HTML/JSON export. Throw or reject on failure; no automatic download fallback. */
  onExport?: ExportHandler;
  onReady?: () => void;
}
