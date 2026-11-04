export interface Activity {
  id: number;
  time: number;
  type: 'navigation' | 'longtask' | 'websocket' | 'sse';
  url: string;
  action: string;
  detail: string;
  duration: number;
  connection?: number;
}
export class ActivityStore {
  items: Activity[] = [];
  private sequence = 0;
  private listeners = new Set<() => void>();
  add(input: Omit<Activity, 'id' | 'time' | 'duration'> & { time?: number; duration?: number }): void {
    this.items.push({ ...input, id: ++this.sequence, time: input.time ?? Date.now(), duration: input.duration ?? 0 });
    if (this.items.length > 1000) this.items.splice(0, this.items.length - 1000);
    this.notify();
  }
  clear(): void { this.items = []; this.notify(); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private notify(): void { for (const fn of this.listeners) { try { fn(); } catch { /* Never interrupt the page. */ } } }
}
