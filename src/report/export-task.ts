import type { ExportFile, ExportHandler } from '../types';

export type ExportState = { status: 'idle' | 'pending' | 'completed' | 'failed' | 'cancelled'; requestId: string; filename: string; slow: boolean };
let sequence = 0;
/** Owns the handoff across dialog lifetimes, never assumes native cancellation. */
export class ExportTask {
  state: ExportState = { status: 'idle', requestId: '', filename: '', slow: false };
  private listeners = new Set<() => void>();
  private timer = 0;
  private disposed = false;
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  start(handler: ExportHandler, file: Omit<ExportFile, 'requestId'>): boolean {
    if (this.disposed || this.state.status === 'pending') return false;
    const requestId = `gravscope-${Date.now().toString(36)}-${++sequence}`;
    this.state = { status: 'pending', requestId, filename: file.filename, slow: false };
    this.timer = window.setTimeout(() => {
      if (this.state.requestId !== requestId || this.state.status !== 'pending') return;
      this.state = { ...this.state, slow: true }; this.notify();
    }, 30000);
    this.notify();
    const finish = (status: 'completed' | 'failed') => {
      if (this.disposed || this.state.requestId !== requestId || this.state.status !== 'pending') return;
      window.clearTimeout(this.timer); this.timer = 0;
      this.state = { ...this.state, status, slow: false }; this.notify();
    };
    try { Promise.resolve(handler({ ...file, requestId })).then(() => finish('completed'), () => finish('failed')); }
    catch { finish('failed'); }
    return true;
  }
  cancelWait(): void {
    if (this.state.status !== 'pending') return;
    window.clearTimeout(this.timer); this.timer = 0;
    this.state = { ...this.state, status: 'cancelled', slow: false }; this.notify();
  }
  destroy(): void { this.disposed = true; window.clearTimeout(this.timer); this.listeners.clear(); }
  private notify(): void { for (const listener of this.listeners) listener(); }
}
