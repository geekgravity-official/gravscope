export type GravScopeTheme = 'light' | 'dark' | 'auto';
export type GravScopeLang = 'zh' | 'en';
export type BuiltinPlugin = 'system' | 'network' | 'element' | 'storage';
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface GravScopeOptions {
  /** Panel color. `auto` follows the system preference. */
  theme?: GravScopeTheme;
  /** `zh` or `en`. Defaults to the browser language. */
  lang?: GravScopeLang;
  /** Built-in panels besides Log, which is always included. */
  defaultPlugins?: BuiltinPlugin[];
  maxLogNumber?: number;
  maxNetworkNumber?: number;
  /** Show the floating GC button. Defaults to true. */
  entryButton?: boolean;
  /** Mount point. Defaults to document.body. */
  target?: HTMLElement | string | null;
  onReady?: () => void;
}

export interface ResolvedOptions {
  theme: GravScopeTheme;
  lang: GravScopeLang;
  defaultPlugins: BuiltinPlugin[];
  maxLogNumber: number;
  maxNetworkNumber: number;
  entryButton: boolean;
  target: HTMLElement | string | null;
  onReady?: () => void;
}
