import type { LogStore } from '../core/store';
import { captureTrace } from '../format/value';
import type { LogLevel } from '../types';

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

export function installConsoleHook(store: LogStore): () => void {
  const saved: Record<string, (...args: any[]) => any> = {};
  let busy = false;
  let active = true;

  const guard = (run: () => void) => {
    if (busy || !active) return;
    busy = true;
    try {
      run();
    } catch {
      // Capture must never break the page console.
    } finally {
      busy = false;
    }
  };

  const wrapLevel = (level: LogLevel) => {
    const current = console[level].bind(console);
    saved[level] = console[level];
    console[level] = (...args: unknown[]) => {
      guard(() => store.append({ level, args }));
      current(...args);
    };
  };

  for (const level of LEVELS) wrapLevel(level);

  saved.table = console.table;
  const table = console.table.bind(console);
  console.table = ((data?: unknown) => {
    guard(() => store.append({ level: 'log', args: [data], kind: 'table' }));
    table(data);
  }) as typeof console.table;

  saved.clear = console.clear;
  const clear = console.clear.bind(console);
  console.clear = () => {
    guard(() => store.clear());
    clear();
  };

  saved.group = console.group;
  const group = console.group.bind(console);
  console.group = (...args: unknown[]) => {
    guard(() => {
      store.beginGroup(args);
    });
    callHost(() => group(...args));
  };

  saved.groupCollapsed = console.groupCollapsed;
  const groupCollapsed = console.groupCollapsed.bind(console);
  console.groupCollapsed = (...args: unknown[]) => {
    guard(() => {
      store.beginGroup(args, true);
    });
    callHost(() => groupCollapsed(...args));
  };

  saved.groupEnd = console.groupEnd;
  const groupEnd = console.groupEnd.bind(console);
  console.groupEnd = () => {
    guard(() => store.endGroup());
    callHost(() => groupEnd());
  };

  saved.assert = console.assert as (...args: unknown[]) => void;
  const assert = console.assert.bind(console);
  console.assert = ((condition?: boolean, ...args: unknown[]) => {
    guard(() => {
      if (!condition) {
        store.append({
          level: 'error',
          args: args.length ? ['Assertion failed:', ...args] : ['Assertion failed'],
        });
      }
    });
    assert(condition, ...args);
  }) as typeof console.assert;

  const counts = new Map<string, number>();
  const timers = new Map<string, number>();
  const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  const note = (level: LogLevel, text: string, extra: unknown[] = []) => {
    guard(() => store.append({ level, args: ['%s', text, ...extra] }));
  };
  // Node's count/trace/timeEnd print through console.log. Ignore that re-entry;
  // the line was already recorded above. Browsers write straight to the console.
  const callHost = (run: () => void) => {
    busy = true;
    try {
      run();
    } finally {
      busy = false;
    }
  };

  hook(saved, 'dir', (original) => (value?: unknown) => {
    guard(() => store.append({ level: 'log', args: [value] }));
    callHost(() => original(value));
  });
  hook(saved, 'dirxml', (original) => (...args: unknown[]) => {
    guard(() => store.append({ level: 'log', args: args.length ? args : ['undefined'] }));
    callHost(() => original(...args));
  });
  hook(saved, 'trace', (original) => (...args: unknown[]) => {
    const trace = captureTrace(new Error('console.trace'));
    guard(() => store.append({ level: 'log', args: [...args, trace] }));
    callHost(() => original(...args));
  });
  hook(saved, 'count', (original) => (label?: string) => {
    const name = label == null || label === '' ? 'default' : String(label);
    const next = (counts.get(name) || 0) + 1;
    counts.set(name, next);
    note('log', `${name}: ${next}`);
    callHost(() => original(label));
  });
  hook(saved, 'countReset', (original) => (label?: string) => {
    const name = label == null || label === '' ? 'default' : String(label);
    counts.set(name, 0);
    callHost(() => original(label));
  });
  hook(saved, 'time', (original) => (label?: string) => {
    timers.set(label == null || label === '' ? 'default' : String(label), now());
    callHost(() => original(label));
  });
  hook(saved, 'timeLog', (original) => (label?: string, ...args: unknown[]) => {
    const name = label == null || label === '' ? 'default' : String(label);
    note('log', timerText(name, timers.get(name), now()), args);
    callHost(() => original(label, ...args));
  });
  hook(saved, 'timeEnd', (original) => (label?: string) => {
    const name = label == null || label === '' ? 'default' : String(label);
    const started = timers.get(name);
    timers.delete(name);
    note(started == null ? 'warn' : 'log', timerText(name, started, now()));
    callHost(() => original(label));
  });

  const installed: Record<string, unknown> = {};
  for (const key of Object.keys(saved)) installed[key] = (console as unknown as Record<string, unknown>)[key];
  return () => {
    active = false;
    counts.clear();
    timers.clear();
    for (const [key, method] of Object.entries(saved)) {
      if ((console as unknown as Record<string, unknown>)[key] === installed[key]) (console as unknown as Record<string, unknown>)[key] = method;
    }
  };
}

export function installErrorHook(store: LogStore): () => void {
  const onError = (event: ErrorEvent) => {
    const args: unknown[] = [event.message || 'Script error'];
    if (event.filename) args.push(`${event.filename}:${event.lineno}:${event.colno}`);
    if (event.error) args.push(event.error);
    store.append({ level: 'error', args });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    store.append({ level: 'error', args: ['Uncaught (in promise)', event.reason] });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

function hook(
  saved: Record<string, (...args: any[]) => any>,
  name: string,
  wrap: (original: (...args: any[]) => any) => (...args: any[]) => any,
): void {
  const host = console as unknown as Record<string, (...args: any[]) => any>;
  const current = host[name];
  if (typeof current !== 'function') return;
  saved[name] = current;
  const original = current.bind(console);
  host[name] = wrap(original);
}

function trimZeros(text: string): string {
  return text.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function timerText(name: string, started: number | undefined, now: number): string {
  if (started == null) return `Timer '${name}' does not exist`;
  const elapsed = Math.max(0, now - started);
  const ms = elapsed < 1000 ? `${trimZeros(elapsed.toFixed(3))} ms` : `${(elapsed / 1000).toFixed(2)} s`;
  return `${name}: ${ms}`;
}
