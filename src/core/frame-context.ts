/** Numeric frame positions only: never read another frame's URL, DOM or name. */
export interface FrameContext {
  type: 'top' | 'iframe' | 'unknown';
  /** Zero-based positions from the top window. Null when safely resolving fails. */
  path: number[] | null;
}

export function getFrameContext(current: Window = window): FrameContext {
  let type: FrameContext['type'] = 'unknown';
  try {
    if (current.top === current) return { type: 'top', path: [] };
    type = 'iframe';
    const path: number[] = [];
    const visited = new Set<Window>();
    let frame = current;
    while (frame !== frame.top) {
      if (visited.has(frame) || path.length >= 32) return { type, path: null };
      visited.add(frame);
      const parent = frame.parent;
      if (!parent || parent === frame) return { type, path: null };
      const count = parent.length;
      if (!Number.isInteger(count) || count < 0 || count > 10000) return { type, path: null };
      let index = -1;
      for (let i = 0; i < count; i++) if (parent[i] === frame) { index = i; break; }
      if (index < 0) return { type, path: null };
      path.unshift(index);
      frame = parent;
    }
    return { type, path };
  } catch {
    return { type, path: null };
  }
}
