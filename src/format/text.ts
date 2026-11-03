export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function softWrapUrl(url: string): string {
  return url.replace(/([/?&=])/g, '$1\u200b');
}

export function resourceLabel(url: string, initiator: string): string {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(m?js|cjs)$/.test(path)) return 'JS';
  if (/\.css$/.test(path)) return 'CSS';
  if (/\.(png|jpe?g|gif|webp|svg|ico|avif|bmp)$/.test(path)) return 'IMG';
  if (/\.(woff2?|ttf|otf|eot)$/.test(path)) return 'FONT';
  if (/\.(mp4|webm|mp3|ogg|wav)$/.test(path)) return 'MEDIA';
  if (/favicon|\/icon/.test(path) || initiator.toLowerCase() === 'icon') return 'ICON';
  const name = initiator.toLowerCase();
  if (name === 'script' || name === 'javascript') return 'JS';
  if (name === 'img' || name === 'image' || name === 'img-src') return 'IMG';
  if (name === 'css' || name === 'stylesheet') return 'CSS';
  if (name === 'font') return 'FONT';
  if (name === 'navigation' || name === 'document') return 'DOC';
  if (name === 'iframe' || name === 'frame') return 'FRAME';
  if (name === 'audio' || name === 'video') return 'MEDIA';
  const upper = initiator.toUpperCase();
  return upper.length > 5 ? upper.slice(0, 5) : upper || 'GET';
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
