type Appendable = Node | string;

function appendNodes(parent: Node, nodes: Appendable[]): void {
  const doc = parent.ownerDocument || document;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    parent.appendChild(typeof node === 'string' ? doc.createTextNode(node) : node);
  }
}

function patchParent(proto: ParentNode): void {
  const target = proto as ParentNode & {
    append?: (...nodes: Appendable[]) => void;
    replaceChildren?: (...nodes: Appendable[]) => void;
  };
  if (typeof target.append !== 'function') {
    target.append = function append(this: Node, ...nodes: Appendable[]) {
      appendNodes(this, nodes);
    };
  }
  if (typeof target.replaceChildren !== 'function') {
    target.replaceChildren = function replaceChildren(this: Node, ...nodes: Appendable[]) {
      while (this.firstChild) this.removeChild(this.firstChild);
      appendNodes(this, nodes);
    };
  }
}

// ParentNode.append / replaceChildren and ChildNode.remove arrived after ES5.
// Patch them when missing so the ES5 bundle still runs in older WebViews.
export function installLegacyDom(): void {
  if (typeof Element === 'undefined' || typeof Node === 'undefined') return;
  patchParent(Element.prototype);
  patchParent(DocumentFragment.prototype);
  if (typeof Document !== 'undefined') patchParent(Document.prototype);
  const ShadowRootCtor = (globalThis as { ShadowRoot?: { prototype: ParentNode } }).ShadowRoot;
  if (ShadowRootCtor) patchParent(ShadowRootCtor.prototype);
  const nodeProto = Node.prototype as Node & { remove?: () => void };
  if (typeof nodeProto.remove !== 'function') {
    nodeProto.remove = function remove(this: Node) {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }
}

installLegacyDom();
