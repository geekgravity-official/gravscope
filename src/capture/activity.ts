import type { ActivityStore } from '../core/activity';

export function installNavigation(store: ActivityStore): () => void {
  let last = '';
  let active = true;
  const record = () => { if (active && last !== location.href) { last = location.href; store.add({ type: 'navigation', url: last, action: 'navigate', detail: document.title }); } };
  const restores: (() => void)[] = [];
  try { for (const key of ['pushState', 'replaceState'] as const) {
    const original = history[key];
    const wrapped: History[typeof key] = function (this: History, ...args) { const result = original.apply(this, args); record(); return result; };
    history[key] = wrapped;
    restores.push(() => { if (history[key] === wrapped) history[key] = original; });
  }
  } catch (error) { active = false; restores.forEach(fn => fn()); throw error; }
  window.addEventListener('popstate', record); window.addEventListener('hashchange', record); record();
  return () => { active = false; restores.forEach(fn => fn()); window.removeEventListener('popstate', record); window.removeEventListener('hashchange', record); };
}

export function installLongTasks(store: ActivityStore): () => void {
  if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return () => {};
  let active = true;
  const observer = new PerformanceObserver(list => {
    if (!active) return;
    for (const entry of list.getEntries()) store.add({ type: 'longtask', url: '', action: entry.name, detail: 'Main thread long task', duration: entry.duration, time: Date.now() - performance.now() + entry.startTime });
  });
  try { observer.observe({ type: 'longtask', buffered: false }); } catch (error) { observer.disconnect(); throw error; }
  return () => { active = false; observer.disconnect(); };
}
