import type { NetworkRecord } from '../core/store';

/** POSIX-shell quoting; --data-raw prevents @file interpretation. */
export function requestCurl(item: NetworkRecord): string {
  const url = new URL(item.url, location.href);
  if (!/^https?:$/.test(url.protocol)) throw new Error('cURL requires an HTTP(S) URL');
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''").replace(/\0/g, '') + "'";
  const parts = ['curl', '--request', quote(item.method), '--url', quote(url.href)];
  for (const [key, value] of Object.entries(item.requestHeaders)) {
    if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) && !/[\r\n]/.test(value)) parts.push('--header', quote(`${key}: ${value}`));
  }
  if (item.requestBody) parts.push('--data-raw', quote(item.requestBody));
  return parts.join(' ');
}
