export function keyboardOverlap(innerHeight: number, viewportHeight: number, offsetTop: number): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(viewportHeight)) return 0;
  const top = Number.isFinite(offsetTop) ? offsetTop : 0;
  return Math.max(0, Math.round(innerHeight - viewportHeight - top));
}
