import { afterEach, describe, expect, it, vi } from 'vitest';
import GravScope from '../src';

afterEach(() => { GravScope.current?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('capture coverage status', () => {
  it('distinguishes absent platform support from disabled capture without manufacturing data', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.stubGlobal('WebSocket', undefined);
    vi.stubGlobal('EventSource', undefined);
    const panel = new GravScope({ lang: 'en' });
    expect(panel.getCaptureStatus().performance.state).toBe('unavailable');
    expect(panel.getCaptureStatus().realtime.state).toBe('unavailable');
    expect(panel.getReport().logs).toHaveLength(0);
    panel.showTab('streams');
    const root = document.querySelector('gravscope-root')!.shadowRoot!;
    expect(root.querySelector('[data-capture-summary="realtime"]')!.textContent).toContain('Unavailable');
    panel.setOption('capture', { realtime: false });
    expect(panel.getCaptureStatus().realtime.state).toBe('disabled');
    expect(root.querySelector('[data-capture-summary="realtime"]')!.textContent).toContain('Disabled');
    const detached = panel.getCaptureStatus(); detached.console.enabled = false;
    expect(panel.getCaptureStatus().console.enabled).toBe(true);
    panel.destroy(); expect(panel.getCaptureStatus().console.state).toBe('disabled');
  });

  it('reports observer subscription failures and can retry without affecting other channels', () => {
    let fail = true;
    const disconnect = vi.fn();
    class Observer {
      static supportedEntryTypes = ['longtask'];
      observe() { if (fail) throw new Error('subscription denied'); }
      disconnect = disconnect;
    }
    vi.stubGlobal('PerformanceObserver', Observer);
    const panel = new GravScope({ defaultPlugins: [], capture: { network: false } });
    expect(panel.getCaptureStatus().performance.state).toBe('failed');
    expect(panel.getCaptureStatus().console.state).toBe('enabled');
    expect(disconnect).toHaveBeenCalled();
    fail = false; panel.setOption('capture', { performance: true });
    expect(panel.getCaptureStatus().performance.state).toBe('enabled');
  });

  it('reports the actually available realtime transport and new-connection coverage', () => {
    vi.stubGlobal('EventSource', undefined);
    const panel = new GravScope({ lang: 'en', defaultPlugins: [] });
    const status = panel.getCaptureStatus().realtime;
    expect(status.enabled).toBe(true);
    expect(status.detail).toContain('WebSocket');
    expect(status.detail).not.toContain('EventSource');
    expect(status.detail).toContain('New connections');
  });
});
