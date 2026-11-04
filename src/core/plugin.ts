export interface ToolButton {
  name: string;
  onClick: () => void;
  placement?: 'primary' | 'more';
}

export interface PluginEvents {
  init: () => void;
  render: (element: HTMLElement) => void;
  show: () => void;
  hide: () => void;
  remove: () => void;
}

type AnyHandler = (...args: any[]) => void;

export class GravScopePlugin {
  readonly id: string;
  readonly name: string;
  private events = new Map<keyof PluginEvents, AnyHandler[]>();
  private tools: ToolButton[] = [];

  constructor(id: string, name: string) {
    if (!id) throw new Error('GravScope plugin id is required');
    this.id = id;
    this.name = name || id;
  }

  on<K extends keyof PluginEvents>(event: K, handler: PluginEvents[K]): this {
    const list = this.events.get(event) ?? [];
    list.push(handler as AnyHandler);
    this.events.set(event, list);
    return this;
  }

  emit<K extends keyof PluginEvents>(event: K, ...args: Parameters<PluginEvents[K]>): void {
    const list = this.events.get(event);
    if (!list) return;
    for (const handler of [...list]) handler(...args);
  }

  addTool(name: string, onClick: () => void, options: { placement?: 'primary' | 'more' } = {}): this {
    this.tools.push({ name, onClick, ...options });
    return this;
  }

  getTools(): ToolButton[] {
    return this.tools.slice();
  }
}
