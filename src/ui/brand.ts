/** GravScope orbit mark. Geometry matches public/brand/gravscope.svg. */
export function createBrandIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 64 64');
  icon.setAttribute('class', 'gc-brand-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const ring = document.createElementNS(ns, 'path');
  ring.setAttribute('d', 'M 56.15 25.53 A 25 25 0 1 1 38.47 7.85 L 35.88 17.51 A 15 15 0 1 0 46.49 28.12 Z');
  ring.setAttribute('fill', 'currentColor');
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', '49.68');
  dot.setAttribute('cy', '14.32');
  dot.setAttribute('r', '6');
  dot.setAttribute('fill', 'currentColor');
  icon.appendChild(ring);
  icon.appendChild(dot);
  return icon;
}
