export interface CookieItem {
  name: string;
  value: string;
}

export function parseCookies(cookie: string): CookieItem[] {
  if (!cookie) return [];
  const items: CookieItem[] = [];
  for (const part of cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) {
      items.push({ name: decode(trimmed), value: '' });
      continue;
    }
    const name = decode(trimmed.slice(0, index).trim());
    if (!name) continue;
    items.push({ name, value: decode(trimmed.slice(index + 1).trim()) });
  }
  return items;
}

export function writeCookie(name: string, value: string): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/`;
}

export function deleteCookie(name: string): void {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
